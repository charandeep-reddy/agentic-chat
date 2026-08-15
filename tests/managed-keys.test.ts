import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptProviderKey, encryptProviderKey } from "@/lib/managed-keys";

const VALID_SECRET = Buffer.alloc(32, 7).toString("base64");

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const ORIGINAL = process.env.MANAGED_KEY_ENCRYPTION_SECRET;

beforeEach(() => {
  setEnv({ MANAGED_KEY_ENCRYPTION_SECRET: VALID_SECRET });
});

afterEach(() => {
  setEnv({ MANAGED_KEY_ENCRYPTION_SECRET: ORIGINAL });
});

describe("encryptProviderKey / decryptProviderKey", () => {
  it("round-trips a plaintext key", () => {
    const plaintext = "sk-ant-super-secret-org-key";
    const encrypted = encryptProviderKey(plaintext);
    expect(decryptProviderKey(encrypted)).toBe(plaintext);
  });

  it("never stores the plaintext in the encrypted column", () => {
    const plaintext = "sk-ant-super-secret-org-key";
    const encrypted = encryptProviderKey(plaintext);
    expect(encrypted.encryptedKey).not.toContain(plaintext);
  });

  it("produces a different iv (and ciphertext) on every call", () => {
    // A reused iv under the same key is what breaks AES-GCM's guarantees —
    // two encryptions of the same plaintext must not look alike.
    const a = encryptProviderKey("same-plaintext");
    const b = encryptProviderKey("same-plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.encryptedKey).not.toBe(b.encryptedKey);
  });

  it("throws rather than returning garbage when the auth tag doesn't match", () => {
    // Simulates a corrupted or tampered row — the whole reason GCM's tag
    // exists is to make exactly this loud instead of silent.
    const encrypted = encryptProviderKey("sk-ant-super-secret-org-key");
    const tampered = { ...encrypted, authTag: encryptProviderKey("different").authTag };
    expect(() => decryptProviderKey(tampered)).toThrow();
  });

  it("throws a clear error when the secret is missing", () => {
    setEnv({ MANAGED_KEY_ENCRYPTION_SECRET: undefined });
    expect(() => encryptProviderKey("x")).toThrow(/MANAGED_KEY_ENCRYPTION_SECRET/);
  });

  it("throws a clear error when the secret isn't 32 bytes", () => {
    setEnv({ MANAGED_KEY_ENCRYPTION_SECRET: Buffer.from("too short").toString("base64") });
    expect(() => encryptProviderKey("x")).toThrow(/32 bytes/);
  });
});
