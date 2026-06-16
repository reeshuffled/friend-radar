/**
 * Application-level field encryption for the SQLite backend.
 *
 * Algorithm: AES-256-GCM with a random 12-byte IV per value.
 * Key source: DB_ENCRYPTION_KEY env var (base64-encoded 32 bytes).
 *   If unset → passthrough mode; encrypt/decrypt are identity functions.
 *
 * Ciphertext envelope: enc:v1:<base64(iv || ciphertext+gcmTag)>
 *
 * HONEST CAVEAT: an env-var key on the same host as the DB protects
 * against stolen DB file / backup leaks, but NOT full host compromise
 * (attacker who can read the DB file can also read the env).
 *
 * Transparent reads: decrypt() returns its input unchanged for any value
 * that does not start with "enc:v1:" — enables lazy migration from plaintext.
 * null and "" pass through untouched in both directions.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENVELOPE_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let _key = undefined; // Buffer(32) | null (disabled) | undefined (not yet loaded)

function getKey() {
  if (_key !== undefined) return _key;
  const raw = process.env.DB_ENCRYPTION_KEY;
  if (!raw) {
    _key = null;
    return null;
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `DB_ENCRYPTION_KEY must be 32 bytes base64-encoded (got ${buf.length} bytes). ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  _key = buf;
  return _key;
}

/** True when DB_ENCRYPTION_KEY is set and valid. */
export function encryptionEnabled() {
  return getKey() !== null;
}

/**
 * Encrypt a string value. Returns the original value if:
 * - encryption is disabled (no DB_ENCRYPTION_KEY)
 * - value is null or ""
 * Already-encrypted values (enc:v1: prefix) are returned as-is.
 */
export function encrypt(value) {
  if (value == null || value === "") return value;
  const key = getKey();
  if (!key) return value;
  if (typeof value === "string" && value.startsWith(ENVELOPE_PREFIX)) return value; // idempotent

  const plaintext = typeof value === "string" ? value : String(value);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  const payload = Buffer.concat([iv, encrypted, tag]);
  return ENVELOPE_PREFIX + payload.toString("base64");
}

/**
 * Decrypt a value previously encrypted by encrypt().
 * Returns the original value if:
 * - value is null or ""
 * - value does not start with "enc:v1:" (transparent read of legacy plaintext)
 * - encryption is disabled
 * Throws if the envelope is malformed or authentication fails.
 */
export function decrypt(value) {
  if (value == null || value === "") return value;
  if (typeof value !== "string" || !value.startsWith(ENVELOPE_PREFIX)) return value;

  const key = getKey();
  if (!key) {
    // Passthrough — caller gets the raw ciphertext string; warn once.
    console.warn(
      "[crypto] DB_ENCRYPTION_KEY not set but encrypted value encountered — returning ciphertext as-is"
    );
    return value;
  }

  const payload = Buffer.from(value.slice(ENVELOPE_PREFIX.length), "base64");
  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new Error("[crypto] Malformed ciphertext envelope (too short)");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES, payload.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

// For testing: reset the cached key so process.env changes take effect.
export function _resetKey() {
  _key = undefined;
}
