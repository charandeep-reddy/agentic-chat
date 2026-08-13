import { describe, expect, it, vi } from "vitest";
import { fetchUrl, htmlToText } from "@/lib/tools/fetch-url";
import { MAX_TEXT_RESPONSE } from "@/lib/tools/errors";
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

describe("htmlToText", () => {
  it("drops script, style and comments with their contents", () => {
    const text = htmlToText(
      `<p>Keep</p><script>var secret = 1;</script><style>.a{color:red}</style><!-- note -->`,
    );
    expect(text).toBe("Keep");
  });

  it("keeps prose and drops the tags around it", () => {
    const html = `<div class="wrapper"><h1>Title</h1><p>First <b>bold</b> line.</p></div>`;
    expect(htmlToText(html)).toBe("Title\nFirst bold line.");
  });

  it("does not run separate blocks together", () => {
    // Without the line break, "one" and "two" would fuse into "onetwo" and the
    // model would read a word that was never on the page.
    expect(htmlToText("<li>one</li><li>two</li>")).toBe("one\ntwo");
  });

  it("decodes the entities that survive stripping", () => {
    expect(htmlToText("<p>a &amp; b &lt; c&nbsp;d &#39;e&#39;</p>")).toBe("a & b < c d 'e'");
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(htmlToText("<p>&hearts;</p>")).toBe("&hearts;");
  });

  it("collapses the whitespace indented markup leaves behind", () => {
    const html = "<div>\n    <p>one</p>\n\n\n    <p>two</p>\n</div>";
    expect(htmlToText(html)).toBe("one\ntwo");
  });

  it("cuts a real page down by most of its size", () => {
    const body = Array.from({ length: 50 }, (_, i) => `<p class="row r${i}">Line ${i}.</p>`).join("");
    const html = `<html><head><style>${".x{color:red}".repeat(200)}</style></head><body><nav><a href="/a">A</a></nav>${body}<script>${"var x=1;".repeat(200)}</script></body></html>`;
    const text = htmlToText(html);
    expect(text.length).toBeLessThan(html.length / 4);
    expect(text).toContain("Line 49.");
  });
});

describe("fetch_url text reduction", () => {
  it("returns HTML as text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockFetchResponse("<html><body><p>Hello</p><script>x()</script></body></html>", {
          contentType: "text/html; charset=utf-8",
        }),
      ),
    );
    const result = await fetchUrl({ url: "https://example.com/page" });
    expect(result.text).toBe("Hello");
  });

  it("leaves JSON exactly as it was", async () => {
    const json = '{"a": "<p>not markup</p>"}';
    vi.stubGlobal("fetch", vi.fn(async () => mockFetchResponse(json)));
    const result = await fetchUrl({ url: "https://example.com/a.json" });
    expect(result.text).toBe(json);
  });

  it("strips HTML served under the wrong content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockFetchResponse("<html><body><p>Hello</p></body></html>", {
          contentType: "application/octet-stream",
        }),
      ),
    );
    const result = await fetchUrl({ url: "https://example.com/page" });
    expect(result.text).toBe("Hello");
  });

  it("truncates at the budget and says so", async () => {
    const long = `<p>${"word ".repeat(20_000)}</p>`;
    vi.stubGlobal("fetch", vi.fn(async () => mockFetchResponse(long, { contentType: "text/html" })));
    const result = await fetchUrl({ url: "https://example.com/long" });
    expect(result.text.length).toBe(MAX_TEXT_RESPONSE);
    expect(result.truncated).toBe(true);
  });
});
