import { afterEach, describe, expect, it, vi } from "vitest";
import { listModels } from "@/lib/model-catalog";

/**
 * Four providers, four unrelated response shapes. The payloads below are the
 * documented ones — OpenAI's from its OpenAPI schema, Anthropic's and Google's
 * from their list-models reference — so these tests fail if the normaliser
 * drifts from what the providers actually send.
 */

interface Call {
  url: string;
  headers: Record<string, string>;
}

const calls: Call[] = [];

/** Replies with `body` and records how it was asked for. */
function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe("openai catalogue", () => {
  const payload = {
    object: "list",
    data: [
      { id: "gpt-5.4", object: "model", created: 1, owned_by: "openai" },
      { id: "gpt-4.1-mini", object: "model", created: 1, owned_by: "openai" },
      { id: "text-embedding-3-large", object: "model", created: 1, owned_by: "openai" },
      { id: "whisper-1", object: "model", created: 1, owned_by: "openai" },
      { id: "dall-e-3", object: "model", created: 1, owned_by: "openai" },
      { id: "omni-moderation-latest", object: "model", created: 1, owned_by: "openai" },
      { id: "gpt-4o-realtime-preview", object: "model", created: 1, owned_by: "openai" },
    ],
  };

  it("authenticates with a bearer token against OpenAI's own host", async () => {
    mockFetch(payload);
    await listModels("openai", "sk-test");
    expect(calls[0].url).toBe("https://api.openai.com/v1/models");
    expect(calls[0].headers.Authorization).toBe("Bearer sk-test");
  });

  it("drops the families served by other endpoints", async () => {
    mockFetch(payload);
    const result = await listModels("openai", "sk-test");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models.map((m) => m.id)).toEqual(["gpt-4.1-mini", "gpt-5.4"]);
  });

  it("keeps an unrecognised id rather than hiding a new model", async () => {
    mockFetch({ data: [{ id: "gpt-6-something-new", object: "model" }] });
    const result = await listModels("openai", "sk-test");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models.map((m) => m.id)).toEqual(["gpt-6-something-new"]);
  });

  it("reports no context, because OpenAI's model object has no such field", async () => {
    mockFetch({ data: [{ id: "gpt-5.4", object: "model" }] });
    const result = await listModels("openai", "sk-test");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models[0].context).toBeNull();
  });
});

describe("anthropic catalogue", () => {
  const payload = {
    data: [
      {
        id: "claude-opus-4-6",
        display_name: "Claude Opus 4.6",
        max_input_tokens: 200000,
        type: "model",
      },
      // The reference's own example returns 0 here, which means "unknown"
      // rather than a model that accepts no input.
      { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5", max_input_tokens: 0 },
    ],
    has_more: false,
  };

  it("sends the dated version header Anthropic requires", async () => {
    mockFetch(payload);
    await listModels("anthropic", "sk-ant-test");
    expect(calls[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0].headers["x-api-key"]).toBe("sk-ant-test");
    // Without an explicit limit the endpoint pages at 20.
    expect(calls[0].url).toContain("limit=1000");
  });

  it("uses display names and treats a zero context as unknown", async () => {
    mockFetch(payload);
    const result = await listModels("anthropic", "sk-ant-test");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models).toEqual([
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", context: null },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", context: 200000 },
    ]);
  });
});

describe("google catalogue", () => {
  const payload = {
    models: [
      {
        name: "models/gemini-3.6-flash",
        displayName: "Gemini 3.6 Flash",
        inputTokenLimit: 1048576,
        supportedGenerationMethods: ["generateContent", "countTokens"],
      },
      {
        name: "models/gemini-embedding-001",
        displayName: "Gemini Embedding",
        inputTokenLimit: 2048,
        supportedGenerationMethods: ["embedContent"],
      },
    ],
  };

  it("passes the key as a header rather than in the query string", async () => {
    mockFetch(payload);
    await listModels("google", "AIza-test");
    expect(calls[0].headers["x-goog-api-key"]).toBe("AIza-test");
    // A key in a URL ends up in logs; this one belongs to the user.
    expect(calls[0].url).not.toContain("AIza-test");
  });

  it("strips the models/ prefix the generation API does not want", async () => {
    mockFetch(payload);
    const result = await listModels("google", "AIza-test");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models[0].id).toBe("gemini-3.6-flash");
  });

  it("keeps only what generateContent can be called on", async () => {
    mockFetch(payload);
    const result = await listModels("google", "AIza-test");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models.map((m) => m.id)).toEqual(["gemini-3.6-flash"]);
  });
});

describe("custom (OpenAI-compatible) catalogue", () => {
  it("reads the name and context gateways add beyond OpenAI's schema", async () => {
    mockFetch({
      data: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", context_length: 131072 }],
    });
    const result = await listModels("custom", "key");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models[0]).toEqual({
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      context: 131072,
    });
  });

  it("keeps every model, since a compatible endpoint serves what it serves", async () => {
    mockFetch({ data: [{ id: "whisper-local" }, { id: "llama-3" }] });
    const result = await listModels("custom", "key");
    if (!result.ok) throw new Error("expected a catalogue");
    expect(result.models.map((m) => m.id)).toEqual(["llama-3", "whisper-local"]);
  });
});

describe("failures", () => {
  it("passes a rejected key through as the provider's own status", async () => {
    mockFetch({ error: "nope" }, 401);
    const result = await listModels("anthropic", "bad");
    expect(result).toEqual({ ok: false, error: "provider", status: 401 });
  });

  it("separates never-reached-them from they-said-no", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
    expect(await listModels("openai", "sk-test")).toEqual({ ok: false, error: "network" });
  });

  it("survives an envelope with nothing in it", async () => {
    mockFetch({});
    for (const provider of ["custom", "openai", "anthropic", "google"] as const) {
      const result = await listModels(provider, "key");
      if (!result.ok) throw new Error("expected a catalogue");
      expect(result.models).toEqual([]);
    }
  });
});

describe("ordering", () => {
  it("sorts numerically, so the newest model is not buried mid-list", async () => {
    mockFetch({ data: [{ id: "gpt-5.11" }, { id: "gpt-5.4" }, { id: "gpt-5.2" }] });
    const result = await listModels("openai", "sk-test");
    if (!result.ok) throw new Error("expected a catalogue");
    // Plain string order would put 5.11 before 5.2.
    expect(result.models.map((m) => m.id)).toEqual(["gpt-5.2", "gpt-5.4", "gpt-5.11"]);
  });
});
