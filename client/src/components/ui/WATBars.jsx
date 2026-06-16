import { useState } from "react";

export function WATBars({ willing, able, trust, slotMatch, inCooldown, energyMod }) {
  const [show, setShow] = useState(false);

  const notes = [
    !slotMatch && slotMatch !== undefined ? "slot mismatch" : null,
    inCooldown ? "in cooldown" : null,
    energyMod !== undefined && energyMod < 0.8 ? "low energy" : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        position: "relative",
        cursor: "default",
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {show && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 6px)",
            background: "#1f2937",
            color: "#f9fafb",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            lineHeight: 1.7,
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            pointerEvents: "none",
          }}
        >
          <div>
            <span style={{ color: "#a78bfa", fontWeight: 700, display: "inline-block", width: 14 }}>
              W
            </span>{" "}
            <span style={{ fontWeight: 700 }}>{willing}</span>{" "}
            <span style={{ color: "#9ca3af" }}>willing</span>
          </div>
          <div>
            <span style={{ color: "#60a5fa", fontWeight: 700, display: "inline-block", width: 14 }}>
              A
            </span>{" "}
            <span style={{ fontWeight: 700 }}>{able}</span>{" "}
            <span style={{ color: "#9ca3af" }}>able</span>
          </div>
          <div>
            <span style={{ color: "#34d399", fontWeight: 700, display: "inline-block", width: 14 }}>
              T
            </span>{" "}
            <span style={{ fontWeight: 700 }}>{trust}</span>{" "}
            <span style={{ color: "#9ca3af" }}>trust</span>
          </div>
          {notes.length > 0 && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTop: "1px solid #374151",
                color: "#f59e0b",
                fontSize: 10,
              }}
            >
              {notes.join(" · ")}
            </div>
          )}
        </div>
      )}
      {[
        ["W", willing, "#6d28d9"],
        ["A", able, "#0284c7"],
        ["T", trust, "#15803d"],
      ].map(([l, v, c]) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", width: 8 }}>{l}</span>
          <div style={{ width: 48, background: "#f3f4f6", borderRadius: 99, height: 3 }}>
            <div
              style={{ width: `${Math.min(100, v)}%`, height: 3, borderRadius: 99, background: c }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
