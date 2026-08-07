import { describe, expect, it, vi } from "vitest";
import { fetchUrl } from "@/lib/tools/fetch-url";
import { lookup } from "node:dns/promises";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => ({ address: "8.8.8.8" })),
}));

function mockFetchResponse(body: string, init: { status?: number; contentType?: string } = {}) {
  const bytes = new TextEncoder().encode(body);
  return {
    status: init.status ?? 200,
    headers: new Headers({ "content-type": init.contentType ?? "application/json" }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  } as unknown as Response;
}

describe("fetch_url", () => {
  it("fetches and returns body text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockFetchResponse("hello world")));
    const result = await fetchUrl({ url: "https://example.com/data.txt" });
    expect(result.kind).toBe("fetch");
    expect(result.status).toBe(200);
    expect(result.text).toBe("hello world");
    expect(result.truncated).toBe(false);
    vi.unstubAllGlobals();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(fetchUrl({ url: "file:///etc/passwd" })).rejects.toThrow(/http/);
  });

  it("rejects localhost", async () => {
    await expect(fetchUrl({ url: "http://localhost:3000/x" })).rejects.toThrow(/local/);
    await expect(fetchUrl({ url: "http://127.0.0.1:3000/x" })).rejects.toThrow(/local|private/);
  });

  it("rejects private IP resolutions", async () => {
    vi.mocked(lookup).mockResolvedValueOnce({ address: "192.168.1.5" } as never);
    await expect(fetchUrl({ url: "https://example.com/x" })).rejects.toThrow(/private/);
  });

  it("rejects oversized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockFetchResponse("x".repeat(5 * 1024 * 1024))),
    );
    await expect(fetchUrl({ url: "https://example.com/big" })).rejects.toThrow(/MB limit/);
    vi.unstubAllGlobals();
  });

  it("truncates long text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockFetchResponse("x".repeat(150_000))),
    );
    const result = await fetchUrl({ url: "https://example.com/long" });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(100_000);
    vi.unstubAllGlobals();
  });
});
