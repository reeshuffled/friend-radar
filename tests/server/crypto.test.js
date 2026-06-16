import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, encryptionEnabled, _resetKey } from "../../server/db/crypto.js";

// Generate a valid test key: 32 random bytes base64-encoded.
// We derive it deterministically so the test is repeatable.
const TEST_KEY = Buffer.alloc(32, 0xab).toString("base64"); // 32 bytes of 0xAB

function withKey(key, fn) {
  const prev = process.env.DB_ENCRYPTION_KEY;
  process.env.DB_ENCRYPTION_KEY = key;
  _resetKey();
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.DB_ENCRYPTION_KEY;
    else process.env.DB_ENCRYPTION_KEY = prev;
    _resetKey();
  }
}

describe("passthrough mode (no key set)", () => {
  beforeEach(() => {
    delete process.env.DB_ENCRYPTION_KEY;
    _resetKey();
  });
  afterEach(() => _resetKey());

  it("encryptionEnabled returns false", () => {
    expect(encryptionEnabled()).toBe(false);
  });

  it("encrypt returns value unchanged", () => {
    expect(encrypt("hello")).toBe("hello");
    expect(encrypt("")).toBe("");
    expect(encrypt(null)).toBe(null);
  });

  it("decrypt returns value unchanged", () => {
    expect(decrypt("hello")).toBe("hello");
    expect(decrypt("")).toBe("");
    expect(decrypt(null)).toBe(null);
  });
});

describe("encrypt / decrypt with key", () => {
  beforeEach(() => {
    process.env.DB_ENCRYPTION_KEY = TEST_KEY;
    _resetKey();
  });
  afterEach(() => {
    delete process.env.DB_ENCRYPTION_KEY;
    _resetKey();
  });

  it("encryptionEnabled returns true", () => {
    expect(encryptionEnabled()).toBe(true);
  });

  it("produces enc:v1: prefixed ciphertext", () => {
    const ct = encrypt("alice@example.com");
    expect(ct).toMatch(/^enc:v1:/);
  });

  it("roundtrip: decrypt(encrypt(x)) === x", () => {
    const values = [
      "alice@example.com",
      "My notes are private",
      JSON.stringify({ "board-games": 5, hiking: 3 }),
      "[]",
      "{}",
    ];
    for (const v of values) {
      expect(decrypt(encrypt(v))).toBe(v);
    }
  });

  it("different IVs produce different ciphertexts for same input", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b); // random IV
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("null passthrough", () => {
    expect(encrypt(null)).toBe(null);
    expect(decrypt(null)).toBe(null);
  });

  it("empty string passthrough", () => {
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });

  it("transparent read: decrypt returns plaintext values unchanged", () => {
    expect(decrypt("legacy plaintext")).toBe("legacy plaintext");
    expect(decrypt('{"key":"value"}')).toBe('{"key":"value"}');
  });

  it("idempotent encrypt: already-encrypted value is not double-encrypted", () => {
    const ct = encrypt("hello");
    expect(encrypt(ct)).toBe(ct);
  });

  it("tampered ciphertext throws on decrypt", () => {
    const ct = encrypt("sensitive");
    // Flip a byte in the payload
    const base64 = ct.slice("enc:v1:".length);
    const buf = Buffer.from(base64, "base64");
    buf[buf.length - 1] ^= 0xff; // corrupt the GCM tag
    const tampered = "enc:v1:" + buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("key validation", () => {
  afterEach(() => {
    delete process.env.DB_ENCRYPTION_KEY;
    _resetKey();
  });

  it("throws if DB_ENCRYPTION_KEY is wrong length", () => {
    process.env.DB_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64"); // 16 bytes, not 32
    _resetKey();
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });
});

describe("encrypted serializer integration", () => {
  it("encrypt then decrypt roundtrips JSON blob", () => {
    withKey(TEST_KEY, () => {
      const obj = { "board-games": 5, hiking: 3 };
      const stored = encrypt(JSON.stringify(obj));
      expect(stored).toMatch(/^enc:v1:/);
      const recovered = JSON.parse(decrypt(stored));
      expect(recovered).toEqual(obj);
    });
  });
});
