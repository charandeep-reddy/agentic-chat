import { z } from "zod";
import { ToolError, MAX_TEXT_RESPONSE } from "./errors";
import { lookup } from "node:dns/promises";

export const fetchUrlSchema = z.object({
  url: z.string().url("url must be a valid absolute http(s) URL"),
});

export type FetchUrlArgs = z.infer<typeof fetchUrlSchema>;

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Redirect hops allowed before giving up, matching what browsers settled on. */
const MAX_REDIRECTS = 5;

/**
 * Whether an IP literal is one this tool must never reach.
 *
 * Exported for its own tests: it is the whole of the SSRF defence, and every
 * case it gets wrong is a way to reach the loopback interface or a cloud
 * metadata endpoint from a URL the model was asked to read.
 *
 * Unknown or unparseable input returns true — refusing to fetch something we
 * could not classify is the safe direction to be wrong in.
 */
export function isPrivateIP(ip: string): boolean {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (address.includes(":")) {
    // An IPv4-mapped address has to be judged on the IPv4 it carries. Matching
    // on the text prefix instead meant `::ffff:169.254.169.254` — the cloud
    // metadata service, written in its v6 form — was read as "not 127./10./
    // 192.168., therefore public" and allowed straight through.
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
    if (mapped) return isPrivateIP(mapped[1]);
    // Any other `::ffff:` spelling (hex-form mapping) is refused rather than
    // guessed at.
    if (address.startsWith("::ffff:")) return true;
    if (address === "::" || address === "::1") return true; // unspecified, loopback
    if (/^f[cd]/.test(address)) return true; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(address)) return true; // fe80::/10 link-local
    return false;
  }

  const parts = address.split(".");
  if (parts.length !== 4) return true;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return true;

  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Carrier-grade NAT is 100.64.0.0/10, not all of 100.0.0.0/8 — the rest of
  // that block is ordinary public space that was being refused.
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true; // multicast and reserved
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

/** Elements whose contents are code or styling, never prose. */
const DROPPED = /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Tags that end a line of prose, so removing markup does not run text together. */
const BREAKS = /<\/?(p|div|br|li|tr|h[1-6]|section|article|header|footer|blockquote)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#160": " ",
};

/**
 * Reduces an HTML document to the text a reader would see.
 *
 * A page fetched for its content is mostly not content: nav, inline scripts,
 * styles and attributes typically outweigh the prose several times over, and
 * every byte of it was being handed to the model and then replayed into the
 * prompt on every later turn of the conversation. Stripping markup here costs
 * nothing at answer quality — the model was never going to use the class names.
 *
 * Deliberately a rewrite rather than a parse. A real parser is a dependency and
 * a DOM for something whose output is fed to a language model, which tolerates
 * the occasional stray bracket far better than the budget tolerates the markup.
 */
export function htmlToText(html: string): string {
  return html
    .replace(DROPPED, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(BREAKS, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&([a-z]+|#\d+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    // Collapse the whitespace indented markup leaves behind. One newline per
    // block, not two: both the opening and closing tag emit a break, and blank
    // lines between every paragraph are structure the model does not need and
    // tokens it would be charged for. One line per block keeps the shape.
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** True for a body worth reducing to text. JSON and CSV are already terse. */
function isHtml(contentType: string, body: string): boolean {
  if (/\b(json|csv|plain)\b/i.test(contentType)) return false;
  if (/\bhtml\b/i.test(contentType)) return true;
  // Content types lie often enough to be worth a second opinion.
  return /<\/(html|body|div|p)>/i.test(body.slice(0, 4000));
}

/**
 * Fetches a URL, re-checking the host on every redirect hop.
 *
 * `redirect: "follow"` cannot be used here: it would validate the hostname the
 * model supplied and then let the *remote server* pick where the request
 * actually lands. Any public URL could 302 to `http://169.254.169.254/` or
 * `http://127.0.0.1/`, and the check above would have passed on a host that was
 * never fetched. Following the chain by hand is what makes `assertPublicHost`
 * apply to the address that finally gets connected to.
 *
 * One deadline covers the whole chain, so a server cannot stall for
 * `TIMEOUT_MS` per hop.
 */
async function fetchGuarded(startUrl: URL): Promise<Response> {
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  let url = startUrl;

  for (let hop = 0; ; hop++) {
    await assertPublicHost(url);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: deadline,
        headers: { accept: "text/plain,text/csv,application/json,text/html,*/*" },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ToolError(`Request failed: ${reason}`);
    }

    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;

    if (hop >= MAX_REDIRECTS) {
      throw new ToolError(`Too many redirects (more than ${MAX_REDIRECTS}).`);
    }

    // The body of a redirect is never content; drop it rather than leaving the
    // socket held open until GC.
    await response.body?.cancel().catch(() => {});

    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw new ToolError(`Redirect to an unreadable location: ${location}`);
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new ToolError("Redirect to a non-http(s) URL was refused.");
    }
    url = next;
  }
}

export async function fetchUrl(args: FetchUrlArgs): Promise<FetchResult> {
  const url = new URL(args.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolError("Only http(s) URLs are supported.");
  }

  const response = await fetchGuarded(url);

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
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const text = isHtml(contentType, raw) ? htmlToText(raw) : raw;
  const truncated = text.length > MAX_TEXT_RESPONSE;

  return {
    kind: "fetch",
    // Where the content actually came from, which after a redirect is not the
    // URL that was asked for.
    url: response.url || url.toString(),
    status: response.status,
    contentType,
    text: text.slice(0, MAX_TEXT_RESPONSE),
    truncated,
  };
}
