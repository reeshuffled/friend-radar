/**
 * Client-side encryption for local (IndexedDB) mode.
 *
 * Algorithm: PBKDF2 (SHA-256, 250k iterations) → AES-256-GCM.
 * Key never touches disk; derived fresh each session from the passphrase.
 *
 * Ciphertext envelope (same convention as server/db/crypto.js):
 *   enc:v1:<base64( iv(12) | ciphertext | gcmTag(16) )>
 *
 * Transparent reads: decryptField() returns its input unchanged if it does
 * not start with "enc:v1:", so plaintext legacy records round-trip correctly.
 *
 * Encryption is OFF by default; UI enables it by calling enableEncryption().
 * A passphrase verifier (enc of known constant) is stored in the "meta" IDB
 * store so subsequent sessions can confirm the correct passphrase.
 */

const ENVELOPE_PREFIX = "enc:v1:";
const VERIFIER_PLAINTEXT = "friend-radar-v1-verifier";
const PBKDF2_ITERATIONS = 250_000;

// Module-scoped active key (CryptoKey, or null when locked).
let _activeKey = null;

// ── Key derivation ────────────────────────────────────────────────────────────

/** Derive an AES-256-GCM CryptoKey from a passphrase + salt (Uint8Array). */
export async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, hash: "SHA-256", iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────────

/**
 * Encrypt a string field value with the active key.
 * Returns value unchanged if: not a string, null/empty, or no active key.
 * Already-encrypted values are returned as-is (idempotent).
 */
export async function encryptField(value) {
  if (!_activeKey) return value;
  if (value == null || value === "") return value;
  if (typeof value !== "string") return value;
  if (value.startsWith(ENVELOPE_PREFIX)) return value; // idempotent

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, _activeKey, encoded);

  // ciphertext includes the 16-byte GCM tag appended by SubtleCrypto
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);

  return ENVELOPE_PREFIX + btoa(String.fromCharCode(...payload));
}

/**
 * Decrypt a field value.
 * Returns the value unchanged if it is null, empty, or lacks the "enc:v1:" prefix
 * (transparent read of plaintext legacy data).
 * Throws if decryption fails (wrong key / corrupted).
 */
export async function decryptField(value) {
  if (value == null || value === "") return value;
  if (typeof value !== "string" || !value.startsWith(ENVELOPE_PREFIX)) return value;
  if (!_activeKey) {
    console.warn("[crypto] encrypted field found but no active key");
    return value;
  }

  const raw = Uint8Array.from(atob(value.slice(ENVELOPE_PREFIX.length)), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);

  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, _activeKey, data);
  return new TextDecoder().decode(plainBuffer);
}

// ── Active key management ─────────────────────────────────────────────────────

/** Returns true when a passphrase has been accepted this session. */
export function isUnlocked() {
  return _activeKey !== null;
}

/** Set the active key directly (used by enableEncryption / unlock). */
export function setActiveKey(key) {
  _activeKey = key;
}

/** Clear the in-memory key (lock the session). */
export function lock() {
  _activeKey = null;
}

// ── Verifier helpers (stored in IDB "meta" store) ─────────────────────────────

/**
 * Build the meta record to persist when encryption is enabled.
 * Returns { id: "enc", salt: base64, verifier: "enc:v1:..." }.
 */
export async function buildEncMeta(passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  setActiveKey(key);
  const verifier = await encryptField(VERIFIER_PLAINTEXT);
  return {
    id: "enc",
    salt: btoa(String.fromCharCode(...salt)),
    verifier,
  };
}

/**
 * Attempt to unlock using a stored meta record.
 * Returns true on success (sets active key), false on wrong passphrase.
 */
export async function unlockWithMeta(passphrase, meta) {
  const salt = Uint8Array.from(atob(meta.salt), (c) => c.charCodeAt(0));
  const candidate = await deriveKey(passphrase, salt);

  // Temporarily set the candidate key to attempt verifier decryption
  const prev = _activeKey;
  _activeKey = candidate;
  try {
    const plain = await decryptField(meta.verifier);
    if (plain === VERIFIER_PLAINTEXT) {
      return true; // key stays set
    }
    _activeKey = prev;
    return false;
  } catch {
    _activeKey = prev;
    return false;
  }
}

// ── Record-level helpers (used by local.js) ────────────────────────────────────

const FRIEND_SENSITIVE = [
  "email",
  "contact",
  "notes",
  "phone",
  "appleContactId",
  "homeLocation",
];
// JSON fields that should be serialized-then-encrypted as a string
const FRIEND_JSON_FIELDS = [
  "groups",
  "tags",
  "interests",
  "availSlots",
  "conflicts",
  "synergies",
  "rankings",
];
const EVENT_SENSITIVE = ["location", "notes", "message"];
const EVENT_JSON_FIELDS = ["legs"];

/** Encrypt sensitive fields of a friend record in-place (returns new object). */
export async function encryptFriend(f) {
  if (!_activeKey) return f;
  const out = { ...f };
  for (const k of FRIEND_SENSITIVE) {
    if (out[k] != null) out[k] = await encryptField(out[k]);
  }
  for (const k of FRIEND_JSON_FIELDS) {
    if (out[k] != null) out[k] = await encryptField(JSON.stringify(out[k]));
  }
  return out;
}

/** Decrypt sensitive fields of a friend record (returns new object). */
export async function decryptFriend(f) {
  if (!_activeKey) return f;
  const out = { ...f };
  for (const k of FRIEND_SENSITIVE) {
    if (out[k] != null) out[k] = await decryptField(out[k]);
  }
  for (const k of FRIEND_JSON_FIELDS) {
    if (out[k] != null) {
      const raw = await decryptField(out[k]);
      // If it came back as a string (was encrypted), parse it; otherwise leave as-is
      out[k] = typeof raw === "string" && (raw.startsWith("[") || raw.startsWith("{"))
        ? JSON.parse(raw)
        : out[k]; // was already plaintext object
    }
  }
  return out;
}

/** Encrypt sensitive fields of an event record (returns new object). */
export async function encryptEvent(e) {
  if (!_activeKey) return e;
  const out = { ...e };
  for (const k of EVENT_SENSITIVE) {
    if (out[k] != null) out[k] = await encryptField(out[k]);
  }
  for (const k of EVENT_JSON_FIELDS) {
    if (out[k] != null) out[k] = await encryptField(JSON.stringify(out[k]));
  }
  return out;
}

/** Decrypt sensitive fields of an event record (returns new object). */
export async function decryptEvent(e) {
  if (!_activeKey) return e;
  const out = { ...e };
  for (const k of EVENT_SENSITIVE) {
    if (out[k] != null) out[k] = await decryptField(out[k]);
  }
  for (const k of EVENT_JSON_FIELDS) {
    if (out[k] != null) {
      const raw = await decryptField(out[k]);
      out[k] = typeof raw === "string" && raw.startsWith("[") ? JSON.parse(raw) : out[k];
    }
  }
  return out;
}
