import { useState } from "react";
import {
  startComparisonSession, nextComparison, applyComparison, interpolate, reorder,
} from "../../lib/ranking.js";
import { Pill } from "../ui/Pill.jsx";

// ⌈log₂(N+1)⌉ — expected number of comparisons for a list of length N
function expectedComparisons(n) {
  return Math.ceil(Math.log2(n + 1));
}

/**
 * RankSession — fixed-overlay modal for Beli-style pairwise reliability ranking.
 *
 * Props:
 *   orderedIds  {string[]}  Current best→worst IDs (caller strips the friend being ranked)
 *   newId       {string}    ID of the friend being inserted/re-ranked
 *   prompt      {string}    Attribute question, e.g. "shows up when they say yes"
 *   friends     {Friend[]}  Full friend list (for name + groups lookup)
 *   onComplete  {(finalOrder: string[]) => void}  Called with best→worst order on "Done"
 *   onCancel    {() => void}
 */
export function RankSession({ orderedIds, newId, prompt, friends, onComplete, onCancel }) {
  const [session,   setSession]   = useState(() => startComparisonSession(orderedIds, newId));
  const [compsDone, setCompsDone] = useState(0);
  const [dragOrder, setDragOrder] = useState(null); // null until comparisons done
  const [dragFrom,  setDragFrom]  = useState(null);

  const friendMap = Object.fromEntries(friends.map(f => [f.id, f]));
  const expected  = expectedComparisons(orderedIds.length);
  const isDone    = session.done;

  // Active order for the ranked list below the comparison
  const activeOrder = dragOrder ?? session.finalOrder ?? orderedIds;

  // Ratings shown only after comparisons finish (we know the full final order)
  const ratings = isDone ? interpolate(activeOrder) : {};

  function handleAnswer(newWins) {
    const next = applyComparison(session, newWins);
    setCompsDone(c => c + 1);
    setSession(next);
    if (next.done) {
      setDragOrder(next.finalOrder);
    }
  }

  function handleDragStart(idx) { setDragFrom(idx); }
  function handleDragOver(e)     { e.preventDefault(); }
  function handleDrop(toIdx) {
    if (dragFrom === null || dragFrom === toIdx) return;
    setDragOrder(reorder(activeOrder, dragFrom, toIdx));
    setDragFrom(null);
  }

  const cmp     = nextComparison(session);
  const friendA = cmp ? friendMap[cmp.a] : null;
  const friendB = cmp ? friendMap[cmp.b] : null;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const overlay = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.55)", zIndex: 1000,
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    overflowY: "auto", padding: "32px 16px",
  };
  const panel = {
    background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480,
    padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  };
  const cardBtn = {
    flex: 1, padding: "18px 14px", borderRadius: 14, border: "none", cursor: "pointer",
    background: "#f9fafb", outline: "1.5px solid #e5e7eb",
    textAlign: "center", transition: "background 0.1s",
  };
  const rowStyle = (isNew, isDragging) => ({
    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
    borderRadius: 10, marginBottom: 4, cursor: isDone ? "grab" : "default",
    background: isNew ? "#eff6ff" : isDragging ? "#f0f9ff" : "#f9fafb",
    border: isNew ? "1.5px solid #3b82f6" : "1px solid #f3f4f6",
    opacity: dragFrom !== null && dragFrom === friends.findIndex(f => f.id === activeOrder[0]) ? 0.5 : 1,
  });

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={panel}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>Reliability ranking</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Pairwise comparison → interpolated 0–10 score</div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>

        {/* Comparison phase */}
        {!isDone && cmp && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", textAlign: "center", marginBottom: 14 }}>
              Who {prompt} more?
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button style={cardBtn} onClick={() => handleAnswer(true)}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                  {friendA?.name ?? cmp.a}
                </div>
              </button>

              <div style={{ display: "flex", alignItems: "center", color: "#9ca3af", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>vs</div>

              <button style={cardBtn} onClick={() => handleAnswer(false)}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                  {friendB?.name ?? cmp.b}
                </div>
              </button>
            </div>

            {orderedIds.length > 0 && (
              <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
                comparison {compsDone + 1} of ~{expected}
              </div>
            )}
          </div>
        )}

        {/* Empty list: no comparisons needed, just show the friend being placed */}
        {!isDone && !cmp && !session.done && (
          <div style={{ textAlign: "center", padding: "12px 0 20px", fontSize: 13, color: "#6b7280" }}>
            First in the ranking — no comparisons needed.
          </div>
        )}

        {/* Ranked list — always visible, draggable after done */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            {isDone ? "Final ranking — drag to adjust" : "Current ranking"}
          </div>

          {(isDone ? activeOrder : orderedIds).length === 0 && !isDone && (
            <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", padding: "6px 0" }}>
              No friends ranked yet on this attribute.
            </div>
          )}

          {(isDone ? activeOrder : orderedIds).map((id, idx) => {
            const fr     = friendMap[id];
            const rating = ratings[id];
            const isNew  = id === newId;
            return (
              <div
                key={id}
                draggable={isDone}
                onDragStart={() => isDone && handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => isDone && handleDrop(idx)}
                style={rowStyle(isNew, false)}
              >
                <span style={{ width: 18, textAlign: "right", fontSize: 11, color: "#d1d5db", fontWeight: 700, flexShrink: 0 }}>
                  {idx + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: isNew ? 700 : 500, color: isNew ? "#1d4ed8" : "#374151" }}>
                  {fr?.name ?? id}
                  {isNew && <span style={{ marginLeft: 6, fontSize: 10, color: "#3b82f6", fontWeight: 700 }}>← placing</span>}
                </span>
                {fr?.groups?.length > 0 && (
                  <div style={{ display: "flex", gap: 3 }}>
                    {fr.groups.slice(0, 2).map(g => <Pill key={g} text={g} bg="#f3f4f6" c="#6b7280" />)}
                  </div>
                )}
                {isDone && rating != null && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#4f46e5", minWidth: 28, textAlign: "right" }}>
                    {rating.toFixed(1)}
                  </span>
                )}
                {isDone && (
                  <span style={{ color: "#d1d5db", fontSize: 14, flexShrink: 0, userSelect: "none" }}>⣿</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Done button — visible after comparisons complete */}
        {isDone && (
          <button
            onClick={() => onComplete(dragOrder ?? session.finalOrder)}
            style={{
              width: "100%", marginTop: 16, padding: "12px", borderRadius: 12, border: "none",
              background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: 14,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Save ranking
          </button>
        )}
      </div>
    </div>
  );
}
