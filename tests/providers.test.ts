import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER,
  PROVIDER_IDS,
  PROVIDERS,
  allKeyStorageNames,
  isProviderId,
  keyStorageFor,
  modelStorageFor,
  providersWithStoredKey,
  toProviderId,
} from "@/lib/providers";
import { KEY_STORAGE, MODEL_STORAGE, scopedKey } from "@/lib/storage-keys";
import { resolveModelId } from "@/lib/provider";

/**
 * The provider id decides who gets sent the user's key and who gets billed, so
 * these cover the two things that must not go wrong: an unrecognised id must
 * never resolve to a real provider, and the default provider's storage names
 * must not move (browsers already hold a key under them).
 */

describe("provider ids", () => {
  it("accepts every catalogued id and nothing else", () => {
    for (const id of PROVIDER_IDS) expect(isProviderId(id)).toBe(true);
    for (const junk of ["", "openai ", "OpenAI", "gpt", null, undefined, 7, {}]) {
      expect(isProviderId(junk)).toBe(false);
    }
  });

  it("falls back to the default rather than inventing a provider", () => {
    expect(toProviderId("anthropic")).toBe("anthropic");
    expect(toProviderId("bogus")).toBe(DEFAULT_PROVIDER);
    expect(toProviderId(undefined)).toBe(DEFAULT_PROVIDER);
  });

  it("gives every provider a label, a key link, a placeholder and a default model", () => {
    for (const id of PROVIDER_IDS) {
      const info = PROVIDERS[id];
      expect(info.id).toBe(id);
      expect(info.label).not.toBe("");
      expect(info.defaultModel).not.toBe("");
      expect(info.keyPlaceholder).not.toBe("");
      expect(info.keysUrl).toMatch(/^https:\/\//);
    }
  });

  it("shapes each placeholder like that provider's own keys", () => {
    // Only OpenAI's keys are a bare `sk-`; showing that hint to someone
    // pasting a Gemini key is what prompted this.
    expect(PROVIDERS.openai.keyPlaceholder).toBe("sk-…");
    expect(PROVIDERS.anthropic.keyPlaceholder).toBe("sk-ant-…");
    expect(PROVIDERS.google.keyPlaceholder).toBe("AIza…");
    // A compatible endpoint can accept any string, so promising a shape here
    // would be inventing one.
    expect(PROVIDERS.custom.keyPlaceholder).not.toContain("sk-");
  });

  it("does not reuse one provider's placeholder for another", () => {
    const placeholders = PROVIDER_IDS.map((id) => PROVIDERS[id].keyPlaceholder);
    expect(new Set(placeholders).size).toBe(placeholders.length);
  });
});

describe("per-provider storage names", () => {
  it("leaves the default provider's names untouched", () => {
    // The upgrade must not orphan a key stored before providers existed.
    expect(keyStorageFor(DEFAULT_PROVIDER)).toBe(KEY_STORAGE);
    expect(modelStorageFor(DEFAULT_PROVIDER)).toBe(MODEL_STORAGE);
  });

  it("suffixes every other provider", () => {
    expect(keyStorageFor("anthropic")).toBe("agentic-chat.key.anthropic");
    expect(keyStorageFor("openai")).toBe("agentic-chat.key.openai");
    expect(modelStorageFor("google")).toBe("agentic-chat.model.google");
  });

  it("never collides across providers", () => {
    const names = PROVIDER_IDS.flatMap((id) => [keyStorageFor(id), modelStorageFor(id)]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("matches the rule the pre-paint script reimplements", () => {
    // `HAS_KEY_INIT_SCRIPT` cannot import this module, so it repeats the rule
    // inline. If one side changes, the header claims the wrong key state.
    for (const id of PROVIDER_IDS) {
      const inlined = id === "custom" ? KEY_STORAGE : `${KEY_STORAGE}.${id}`;
      expect(scopedKey(KEY_STORAGE, id)).toBe(inlined);
    }
  });
});

describe("clearing keys", () => {
  /** Stands in for localStorage. */
  const reader = (store: Record<string, string>) => (name: string) => store[name] ?? "";

  it("clears every provider, including ones added later", () => {
    const names = allKeyStorageNames();
    expect(names).toHaveLength(PROVIDER_IDS.length);
    // Derived from the catalogue, so a new provider cannot be left holding a
    // key after the user asked for all of them to go.
    for (const id of PROVIDER_IDS) expect(names).toContain(keyStorageFor(id));
  });

  it("clears the default provider's unsuffixed name too", () => {
    // The easiest one to miss: it is the only name without a suffix.
    expect(allKeyStorageNames()).toContain("agentic-chat.key");
  });

  it("reports which providers hold a key", () => {
    const store = {
      "agentic-chat.key": "custom-key",
      "agentic-chat.key.google": "AIza-key",
    };
    expect(providersWithStoredKey(reader(store))).toEqual(["custom", "google"]);
  });

  it("treats an empty string as no key", () => {
    // `getStorage` returns "" for a missing entry, so a blank value and an
    // absent one have to mean the same thing here.
    expect(providersWithStoredKey(reader({ "agentic-chat.key.openai": "" }))).toEqual([]);
  });

  it("reports nothing once everything is cleared", () => {
    const store: Record<string, string> = {
      "agentic-chat.key": "a",
      "agentic-chat.key.anthropic": "b",
      "agentic-chat.key.openai": "c",
      "agentic-chat.key.google": "d",
    };
    expect(providersWithStoredKey(reader(store))).toHaveLength(PROVIDER_IDS.length);
    for (const name of allKeyStorageNames()) delete store[name];
    expect(providersWithStoredKey(reader(store))).toEqual([]);
  });

  it("leaves model choices alone — they are preferences, not secrets", () => {
    const names = allKeyStorageNames();
    for (const id of PROVIDER_IDS) expect(names).not.toContain(modelStorageFor(id));
  });
});

describe("resolveModelId", () => {
  it("prefers what the request asked for", () => {
    expect(resolveModelId("claude-opus-5", "stored", "anthropic")).toBe("claude-opus-5");
    expect(resolveModelId("  spaced  ", null, "openai")).toBe("spaced");
  });

  it("falls back to the provider's own default", () => {
    for (const id of PROVIDER_IDS) {
      expect(resolveModelId(undefined, null, id)).toBe(PROVIDERS[id].defaultModel);
    }
  });

  it("keeps the custom provider's default deployment-configurable", () => {
    // DEFAULT_MODEL is an env override on the server. The catalogue entry is a
    // compile-time constant because the browser reads it too, so resolving
    // through the catalogue here would have quietly ignored the env var.
    expect(resolveModelId(undefined, null, "custom")).toBe(
      process.env.DEFAULT_MODEL ?? PROVIDERS.custom.defaultModel,
    );
  });

  it("only honours the stored account default for the custom provider", () => {
    // The column has no provider attached, so a model saved while on one
    // provider must not be sent to another as a name it has never heard of.
    expect(resolveModelId(undefined, "some-custom-model", "custom")).toBe("some-custom-model");
    expect(resolveModelId(undefined, "some-custom-model", "google")).toBe(
      PROVIDERS.google.defaultModel,
    );
  });

  it("ignores blank and non-string requests", () => {
    expect(resolveModelId("", null, "openai")).toBe(PROVIDERS.openai.defaultModel);
    expect(resolveModelId("   ", null, "openai")).toBe(PROVIDERS.openai.defaultModel);
    expect(resolveModelId(42, null, "openai")).toBe(PROVIDERS.openai.defaultModel);
  });
});
