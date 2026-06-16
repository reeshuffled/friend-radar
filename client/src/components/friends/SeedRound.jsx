import { useState } from "react";
import {
  RANKED_ATTRS, rankedOrder,
  startComparisonSession, nextComparison, applyComparison,
  buildRankingWrites, interpolate,
} from "../../lib/ranking.js";
import { Pill } from "../ui/Pill.jsx";

const ATTR   = "reliability";
const PROMPT = RANKED_ATTRS.find(a => a.key === ATTR)?.prompt ?? ATTR;

/**
 * Advance through the queue starting at `startIdx`, skipping any friend
 * whose insertion is immediately done (first friend in an empty list).
 * Returns the next state object.
 */
function buildNextState(currentOrder, queue, startIdx) {
  let order = currentOrder;
  let qi    = startIdx;
  while (qi < queue.length) {
    const friend  = queue[qi];
    // Map reliability slider (1–5, higher=more reliable) to predicted insertion
    // index: slider 5 → top (0), slider 1 → bottom (order.length).
    const hintPos = Math.round((5 - (friend.reliability ?? 3)) / 4 * order.length);
    const s = startComparisonSession(order, friend.id, hintPos);
    if (!s.done) return { session: s, orderedIds: order, queueIdx: qi, allDone: false };
    order = s.finalOrder;
    qi++;
  }
  return { session: null, orderedIds: order, queueIdx: qi, allDone: true };
}

/**
 * SeedRound — batch reliability ranking modal.
 * Goes through all unranked active friends one by one using binary insertion.
 * Shows progress and a growing ranked list.
 *
 * Props:
 *   friends      {Friend[]}  Full friend list
 *   onComplete   {(patches: {id, rankings}[]) => void}  Called with ranking patches on save
 *   onCancel     {() => void}
 */
export function SeedRound({ friends, onComplete, onCancel }) {
  const friendMap = Object.fromEntries(friends.map(f => [f.id, f]));

  // Queue: unranked active friends, most reliable slider first.
  // Insertion order doesn't affect total comparison count, but a predictable
  // order lets the hint-based search in buildNextState start near the right spot.
  const queue = friends
    .filter(f => f.wantAround !== "skip" && typeof f.rankings?.[ATTR] !== "number")
    .sort((a, b) => (b.reliability ?? 3) - (a.reliability ?? 3));

  const [state, setState] = useState(() =>
    buildNextState(rankedOrder(friends, ATTR), queue, 0)
  );

  const { session, orderedIds, queueIdx, allDone } = state;
  const [compsDone, setCompsDone] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // How many queue members have been placed so far
  const placedThisSession = orderedIds.filter(id => queue.some(q => q.id === id)).length;

  function handleAnswer(newWins) {
    const next = applyComparison(session, newWins);
    setCompsDone(c => c + 1);
    if (next.done) {
      setState(buildNextState(next.finalOrder, queue, queueIdx + 1));
    } else {
      setState(s => ({ ...s, session: next }));
    }
  }

  function handleSave() {
    if (!orderedIds.length) { onCancel(); return; }
    onComplete(buildRankingWrites(friends, ATTR, orderedIds));
  }

  const cmp     = session ? nextComparison(session) : null;
  const friendA = cmp ? friendMap[cmp.a] : null;
  const friendB = cmp ? friendMap[cmp.b] : null;
  const ratings = interpolate(orderedIds);

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

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && (compsDone === 0 ? onCancel() : setConfirmCancel(true))}>
      <div style={panel}>

        {/* Cancel confirm */}
        {confirmCancel && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: "#fef2f2", border: "1.5px solid #fca5a5" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Discard progress?</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              {placedThisSession} friend{placedThisSession !== 1 ? "s" : ""} ranked so far won't be saved.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onCancel} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Discard & close
              </button>
              <button onClick={() => setConfirmCancel(false)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                Keep ranking
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>Rank your friends' reliability</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              {allDone
                ? `All ${queue.length} friends ranked!`
                : `${placedThisSession} of ${queue.length} placed — compare two at a time`}
            </div>
          </div>
          <button
            onClick={() => compsDone === 0 ? onCancel() : setConfirmCancel(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1, flexShrink: 0, marginLeft: 10 }}
          >✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, borderRadius: 2, background: "#f3f4f6", marginBottom: 20, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2, background: "#4f46e5",
            width: `${queue.length === 0 ? 100 : (placedThisSession / queue.length) * 100}%`,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Comparison question */}
        {!allDone && cmp && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", textAlign: "center", marginBottom: 14 }}>
              Who {PROMPT} more?
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <button
                onClick={() => handleAnswer(true)}
                style={{ flex: 1, padding: "18px 14px", borderRadius: 14, border: "none", cursor: "pointer", background: "#f9fafb", outline: "1.5px solid #e5e7eb", textAlign: "center" }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{friendA?.name ?? cmp.a}</div>
              </button>

              <div style={{ display: "flex", alignItems: "center", color: "#9ca3af", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>vs</div>

              <button
                onClick={() => handleAnswer(false)}
                style={{ flex: 1, padding: "18px 14px", borderRadius: 14, border: "none", cursor: "pointer", background: "#f9fafb", outline: "1.5px solid #e5e7eb", textAlign: "center" }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{friendB?.name ?? cmp.b}</div>
              </button>
            </div>
            <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
              placing <strong style={{ color: "#374151" }}>{friendMap[cmp.a]?.name ?? cmp.a}</strong>
            </div>
          </div>
        )}

        {/* Completion screen */}
        {allDone && (
          <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Ranking complete!</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{orderedIds.length} friends ranked. Drag to adjust if needed, then save.</div>
          </div>
        )}

        {/* Growing ranked list — hidden until first real comparison produces 2+ entries */}
        {orderedIds.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              {allDone ? "Final ranking" : "Ranked so far"}
            </div>
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
              {orderedIds.map((id, idx) => {
                const fr     = friendMap[id];
                const rating = ratings[id];
                const isNew  = queue.some(q => q.id === id); // placed in this session
                return (
                  <div key={id} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                    borderRadius: 8, background: isNew ? "#f5f3ff" : "#f9fafb",
                    border: isNew ? "1px solid #ddd6fe" : "1px solid #f3f4f6",
                  }}>
                    <span style={{ width: 18, textAlign: "right", fontSize: 10, color: "#d1d5db", fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: isNew ? 700 : 500, color: isNew ? "#5b21b6" : "#374151" }}>
                      {fr?.name ?? id}
                    </span>
                    {fr?.groups?.slice(0, 1).map(g => <Pill key={g} text={g} bg="#f3f4f6" c="#9ca3af" />)}
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#4f46e5", minWidth: 28, textAlign: "right" }}>
                      {rating?.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action button */}
        <button onClick={handleSave} disabled={placedThisSession === 0} style={{
          width: "100%", padding: "11px", borderRadius: 12, border: "none",
          background: placedThisSession === 0 ? "#e5e7eb" : "#4f46e5",
          color: placedThisSession === 0 ? "#9ca3af" : "#fff",
          fontWeight: 700, fontSize: 13, cursor: placedThisSession === 0 ? "default" : "pointer",
          fontFamily: "inherit",
        }}>
          {allDone ? "Save ranking" : `Save & stop (${placedThisSession} placed)`}
        </button>
      </div>
    </div>
  );
}
