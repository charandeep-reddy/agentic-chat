import { describe, expect, it, vi } from "vitest";
import { fetchUrl, htmlToText, isPrivateIP } from "@/lib/tools/fetch-url";
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

function mockRedirect(location: string, status = 302) {
  return {
    status,
    url: "",
    headers: new Headers({ location }),
    body: new ReadableStream({
      start(controller) {
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

describe("fetch_url redirects", () => {
  it("refuses a redirect into a private address", async () => {
    // The whole point of following redirects by hand: the first host passes
    // every check, and then hands back a Location pointing at the loopback
    // interface. With `redirect: "follow"` this fetch would have succeeded.
    vi.mocked(lookup).mockResolvedValue({ address: "8.8.8.8" } as never);
    vi.stubGlobal("fetch", vi.fn(async () => mockRedirect("http://127.0.0.1/admin")));
    await expect(fetchUrl({ url: "https://example.com/start" })).rejects.toThrow(/local|private/);
    vi.unstubAllGlobals();
  });

  it("refuses a redirect to the cloud metadata endpoint", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "8.8.8.8" } as never);
    vi.stubGlobal("fetch", vi.fn(async () => mockRedirect("http://169.254.169.254/latest/meta-data/")));
    await expect(fetchUrl({ url: "https://example.com/start" })).rejects.toThrow(/private/);
    vi.unstubAllGlobals();
  });

  it("follows a redirect to another public host", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "8.8.8.8" } as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRedirect("https://elsewhere.example/final"))
      .mockResolvedValueOnce(mockFetchResponse("arrived"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchUrl({ url: "https://example.com/start" });
    expect(result.text).toBe("arrived");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("refuses a redirect to a non-http protocol", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "8.8.8.8" } as never);
    vi.stubGlobal("fetch", vi.fn(async () => mockRedirect("file:///etc/passwd")));
    await expect(fetchUrl({ url: "https://example.com/start" })).rejects.toThrow(/non-http/);
    vi.unstubAllGlobals();
  });

  it("gives up on a redirect loop instead of following it forever", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "8.8.8.8" } as never);
    vi.stubGlobal("fetch", vi.fn(async () => mockRedirect("https://example.com/start")));
    await expect(fetchUrl({ url: "https://example.com/start" })).rejects.toThrow(/Too many redirects/);
    vi.unstubAllGlobals();
  });
});

describe("isPrivateIP", () => {
  it("blocks the IPv4 ranges that must never be reachable", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.5",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254", // cloud metadata
      "0.0.0.0",
      "100.64.0.1", // carrier-grade NAT
      "224.0.0.1", // multicast
    ]) {
      expect(isPrivateIP(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "93.184.216.34"]) {
      expect(isPrivateIP(ip), ip).toBe(false);
    }
  });

  it("does not treat the rest of 100.0.0.0/8 as carrier-grade NAT", () => {
    // Only 100.64.0.0/10 is CGNAT; 100.0.x and 100.128.x are public space that
    // was previously refused.
    expect(isPrivateIP("100.0.0.1")).toBe(false);
    expect(isPrivateIP("100.128.0.1")).toBe(false);
  });

  it("sees through IPv4-mapped IPv6, which used to be the way in", () => {
    // Each of these is a private v4 address wearing a v6 spelling. The old
    // prefix matching only knew 127./10./192.168., so the metadata endpoint
    // and the 172.16/12 block went straight through.
    expect(isPrivateIP("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIP("::ffff:172.16.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
  });

  it("blocks the IPv6 ranges that are local by definition", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "[::1]", "FE80::1"]) {
      expect(isPrivateIP(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
  });

  it("refuses anything it cannot parse rather than guessing", () => {
    for (const ip of ["1.2.3", "1.2.3.4.5", "999.1.1.1", "1.2.3.256", ""]) {
      expect(isPrivateIP(ip), ip).toBe(true);
    }
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
