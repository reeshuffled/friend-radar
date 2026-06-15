import { useState } from "react";
import { SignalBars } from "./SignalBars.jsx";

export function ScoreDisplay({ score, willing, able, trust, inCooldown, daysUntilDue, isBusyThisWeek, targetFreqDays, ds }) {
  const [show, setShow] = useState(false);
  const wC = Math.round(willing * 0.40);
  const aC = Math.round(able   * 0.35);
  const tC = Math.round(trust  * 0.25);
  const base = wC + aC + tC;
  const color = score >= 75 ? "#16a34a" : score >= 55 ? "#d97706" : "#dc2626";

  const modifier =
    isBusyThisWeek                                        ? { label: "Busy penalty ×0.15", color: "#f87171" } :
    inCooldown                                            ? { label: `Cooldown (${daysUntilDue}d left)`,  color: "#60a5fa" } :
    targetFreqDays && ds !== null && ds >= targetFreqDays ? { label: `Overdue boost (+${score - base})`,  color: "#fbbf24" } :
    ds === null && targetFreqDays                         ? { label: "Never hung boost",   color: "#c084fc" } :
    null;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative", cursor: "default" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {show && (
        <div style={{
          position: "absolute", right: 0, bottom: "calc(100% + 6px)",
          background: "#1f2937", color: "#f9fafb", borderRadius: 10,
          padding: "10px 13px", fontSize: 11, lineHeight: 1.7,
          whiteSpace: "nowrap", zIndex: 100,
          boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
          pointerEvents: "none",
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 7 }}>Score breakdown</div>
          {[["W", willing, "40%", wC, "#a78bfa"], ["A", able, "35%", aC, "#60a5fa"], ["T", trust, "25%", tC, "#34d399"]].map(([k, v, w, c, col]) => (
            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ color: col, fontWeight: 700, width: 12 }}>{k}</span>
              <span style={{ width: 22, textAlign: "right" }}>{v}</span>
              <span style={{ color: "#6b7280", width: 30 }}>× {w}</span>
              <span style={{ color: "#4b5563" }}>→</span>
              <span style={{ width: 18, textAlign: "right", fontWeight: 600 }}>{c}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #374151", marginTop: 7, paddingTop: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "#9ca3af" }}>
              <span>Base</span><span style={{ fontWeight: 600, color: "#d1d5db" }}>{base}</span>
            </div>
            {modifier && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 2 }}>
                <span style={{ color: modifier.color }}>{modifier.label}</span>
                <span style={{ fontWeight: 700, color }}>{score}</span>
              </div>
            )}
            {!modifier && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 2 }}>
                <span style={{ color: "#9ca3af" }}>Final</span>
                <span style={{ fontWeight: 700, color }}>{score}</span>
              </div>
            )}
          </div>
        </div>
      )}
      <SignalBars score={score} />
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{score}</span>
    </div>
  );
}
