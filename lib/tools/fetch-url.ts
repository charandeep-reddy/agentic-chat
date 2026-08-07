import { z } from "zod";
import { ToolError, MAX_TEXT_RESPONSE } from "./errors";
import { lookup } from "node:dns/promises";

export const fetchUrlSchema = z.object({
  url: z.string().url("url must be a valid absolute http(s) URL"),
});

export type FetchUrlArgs = z.infer<typeof fetchUrlSchema>;

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function isPrivateIP(ip: string): boolean {
  if (ip.includes(":")) {
    if (ip === "::1" || ip.startsWith("::ffff:")) return ip === "::1" || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
    if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) return true;
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0 || a === 100 || a >= 224) return true;
  return false;
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local")) {
    throw new ToolError("fetch_url is not allowed to access local addresses.");
  }
  const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (isIpLiteral) {
    if (isPrivateIP(host)) {
      throw new ToolError(`fetch_url refused: ${host} is a private address.`);
    }
    return;
  }
  try {
    const { address } = await lookup(host, { verbatim: true });
    if (isPrivateIP(address)) {
      throw new ToolError(`fetch_url refused: ${host} resolves to a private address (${address}).`);
    }
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError(`Could not resolve host '${host}'.`);
  }
}

export interface FetchResult {
  kind: "fetch";
  url: string;
  status: number;
  contentType: string;
  text: string;
  truncated: boolean;
}

export async function fetchUrl(args: FetchUrlArgs): Promise<FetchResult> {
  const url = new URL(args.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolError("Only http(s) URLs are supported.");
  }
  await assertPublicHost(url);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/plain,text/csv,application/json,text/html,*/*" },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ToolError(`Request failed: ${reason}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    throw new ToolError(`Response exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.`);
  }

  if (!response.body) {
    throw new ToolError("Response has no body.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new ToolError(`Response exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const truncated = text.length > MAX_TEXT_RESPONSE;

  return {
    kind: "fetch",
    url: url.toString(),
    status: response.status,
    contentType,
    text: text.slice(0, MAX_TEXT_RESPONSE),
    truncated,
  };
}
