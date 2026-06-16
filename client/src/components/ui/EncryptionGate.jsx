/**
 * EncryptionGate — full-screen overlay that handles two cases:
 *
 *   mode="offer"  → first-run opt-in prompt
 *   mode="unlock" → passphrase entry for already-encrypted data
 *
 * Props:
 *   onReady()    — called when gate is cleared (key set or plaintext confirmed)
 *   onDecline()  — called when user chooses not to encrypt (offer mode only)
 */

import { useState } from "react";
import { getEncMeta, saveEncMeta } from "../../lib/api/db.js";
import { buildEncMeta, unlockWithMeta } from "../../lib/crypto.js";

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 1000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  overflowY: "auto",
  padding: "32px 16px",
};

const panel = {
  background: "#fff",
  borderRadius: 20,
  width: "100%",
  maxWidth: 440,
  padding: 28,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #d1d5db",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

const btn = (primary) => ({
  flex: 1,
  padding: "11px 14px",
  borderRadius: 10,
  border: primary ? "none" : "1.5px solid #d1d5db",
  background: primary ? "#2563eb" : "#fff",
  color: primary ? "#fff" : "#374151",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
});

export function EncryptionGate({ mode, onReady, onDecline }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // offer sub-state: "prompt" (initial), "enable" (user wants to enable)
  const [offerStage, setOfferStage] = useState("prompt");

  // ── Unlock (already encrypted) ────────────────────────────────────────────

  async function handleUnlock(e) {
    e.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await getEncMeta();
      const ok = await unlockWithMeta(passphrase, meta);
      if (ok) {
        onReady();
      } else {
        setError("Incorrect passphrase. Try again.");
      }
    } catch {
      setError("Incorrect passphrase. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Enable (from offer) ───────────────────────────────────────────────────

  async function handleEnable(e) {
    e.preventDefault();
    if (!passphrase) return;
    if (passphrase !== confirm) {
      setError("Passphrases don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const meta = await buildEncMeta(passphrase);
      await saveEncMeta(meta);
      onReady();
    } catch (err) {
      setError(err.message ?? "Failed to enable encryption.");
    } finally {
      setBusy(false);
    }
  }

  // ── Render: unlock ────────────────────────────────────────────────────────

  if (mode === "unlock") {
    return (
      <div style={overlay}>
        <div style={panel}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
              🔒 Unlock Friend Radar
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Your data is encrypted. Enter your passphrase to continue.
            </div>
          </div>

          <form onSubmit={handleUnlock}>
            <input
              type="password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
              autoFocus
            />
            {error && (
              <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 10 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={busy || !passphrase}
              style={{ ...btn(true), width: "100%", opacity: busy || !passphrase ? 0.6 : 1 }}
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: offer — initial prompt ────────────────────────────────────────

  if (mode === "offer" && offerStage === "prompt") {
    return (
      <div style={overlay}>
        <div style={panel}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 6 }}>
              🔐 Encrypt your data?
            </div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 10 }}>
              Friend Radar can encrypt names, notes, contact info, and other personal data stored in
              your browser.
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#6b7280",
                background: "#f9fafb",
                borderRadius: 8,
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
              }}
            >
              ⚠️ You&apos;ll need to enter a passphrase each time you open the app. If you forget
              it, your data <strong>cannot be recovered</strong>.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={btn(false)} onClick={onDecline}>
              Keep it unencrypted
            </button>
            <button style={btn(true)} onClick={() => setOfferStage("enable")}>
              Yes, encrypt it
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: offer — enable form ───────────────────────────────────────────

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
            Set a passphrase
          </div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Choose something memorable. There is no recovery option if you forget it.
          </div>
        </div>

        <form onSubmit={handleEnable}>
          <input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
            autoFocus
          />
          <input
            type="password"
            placeholder="Confirm passphrase"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          {error && (
            <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 10 }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={btn(false)} onClick={() => setOfferStage("prompt")}>
              Back
            </button>
            <button
              type="submit"
              disabled={busy || !passphrase}
              style={{ ...btn(true), opacity: busy || !passphrase ? 0.6 : 1 }}
            >
              {busy ? "Encrypting…" : "Enable encryption"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
