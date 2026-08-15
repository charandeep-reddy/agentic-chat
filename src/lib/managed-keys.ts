import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Encryption for org-paid provider keys, used only when `ORG_MANAGED_KEYS`
 * is set — see the route branch in `app/api/chat/route.ts` and the schema
 * comment on `managedProviderKey`.
 *
 * BYOK keys never touch the server at all (see the privacy invariants in
 * CLAUDE.md); this is the one case where a provider key genuinely has to
 * live in this app's own database, because the whole point of managed mode
 * is that the company's key is shared across employees rather than pasted
 * into each of their browsers. Encrypting it at rest is defense in depth —
 * a Postgres dump or a misconfigured backup shouldn't hand out a live,
 * billable API key in plaintext.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the size AES-GCM is designed for

export interface EncryptedKey {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

/**
 * Reads and validates the encryption secret once per call rather than at
 * module load: this module can be imported by test code and by routes that
 * never actually touch managed mode, and a deployment that never sets
 * `ORG_MANAGED_KEYS` shouldn't be required to also set this — it should only
 * fail the moment something genuinely tries to encrypt or decrypt a key.
 */
function encryptionKey(): Buffer {
  const raw = process.env.MANAGED_KEY_ENCRYPTION_SECRET;
  if (!raw) {
    throw new Error(
      "MANAGED_KEY_ENCRYPTION_SECRET is not set. Required to store or read managed provider keys.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `MANAGED_KEY_ENCRYPTION_SECRET must decode to 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

/** Encrypts a plaintext provider key for storage in `managedProviderKey`. */
export function encryptProviderKey(plaintext: string): EncryptedKey {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encryptedKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypts a stored provider key. Throws — deliberately, not a null return —
 * if the auth tag doesn't match, which means the ciphertext was corrupted or
 * tampered with. A silently wrong decryption here is a live API key sent to
 * whatever garbage came out of it; a thrown error surfaces as a clear 500
 * instead.
 */
export function decryptProviderKey(row: EncryptedKey): string {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(row.encryptedKey, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
