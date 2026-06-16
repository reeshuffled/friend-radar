import { useState } from "react";
import { LEGACY_SLOT_LABELS } from "../../lib/constants.js";
import { todayStr, formatTime } from "../../lib/helpers.js";
import { Pill } from "../ui/Pill.jsx";
import { Stars } from "../ui/Stars.jsx";
import { api } from "../../lib/api/index.js";

const RESP_META = {
  pending: { bg: "#f3f4f6", c: "#6b7280", label: "pending" },
  yes:     { bg: "#dcfce7", c: "#15803d", label: "yes ✓" },
  maybe:   { bg: "#fef9c3", c: "#854d0e", label: "maybe" },
  no:      { bg: "#fee2e2", c: "#b91c1c", label: "no" },
  ghosted: { bg: "#ede9fe", c: "#6d28d9", label: "ghosted" },
};

const CHANNEL_META = {
  email:    { bg: "#f3f4f6", c: "#6b7280",  label: "email" },
  gcal:     { bg: "#eff6ff", c: "#1d4ed8",  label: "GCal" },
  imessage: { bg: "#f0fdf4", c: "#15803d",  label: "Text" },
  manual:   { bg: "#fff7ed", c: "#c2410c",  label: "manual" },
};

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function EventCard({ event, friends, activities = [], onUpdate, onAdvanceCascade, onResponseUpdate }) {
  const [expandedId, setExpanded]   = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [tempShowed, setTempShowed] = useState({});
  const [rating, setRating]         = useState(3);

  const actLabel  = activities.find(a => a.id === event.activityId)?.label ?? event.activityId;
  const timeLabel = event.startTime
    ? `${formatTime(event.startTime)}${event.endTime ? ` – ${formatTime(event.endTime)}` : ""}`
    : (LEGACY_SLOT_LABELS[event.timeSlotId] ?? "");
  const dateLabel = new Date(event.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isPast    = event.date < todayStr();

  const getName  = id => friends.find(f => f.id === id)?.name ?? "Unknown";
  const getEmail = id => friends.find(f => f.id === id)?.email ?? "";

  const invited  = event.invites.filter(i => i.inviteStatus !== "queued");
  const queued   = event.invites.filter(i => i.inviteStatus === "queued");
  const yesInv   = invited.filter(i => i.response === "yes");
  const accepted = event.invites.filter(i => i.response === "yes").length;
  const nextQueued = queued[0];

  const setResponse = (friendId, resp) => {
    onUpdate(event.id, e => ({ ...e, invites: e.invites.map(i => i.friendId === friendId ? { ...i, response: resp } : i) }));
    setExpanded(null);
  };

  const handleManualResponse = async (friendId, resp) => {
    try {
      await api.recordResponse(event.id, friendId, resp);
      onUpdate(event.id, e => ({ ...e, invites: e.invites.map(i => i.friendId === friendId ? { ...i, response: resp } : i) }));
      if (onResponseUpdate) onResponseUpdate();
    } catch (e) {
      // fall back to local-only update so UI stays responsive
      onUpdate(event.id, e => ({ ...e, invites: e.invites.map(i => i.friendId === friendId ? { ...i, response: resp } : i) }));
    }
  };

  const handleToggleLeg = (friendId, legId, currentAttendingLegs) => {
    const allLegIds = event.legs.map(l => l.id);
    let next;
    if (!currentAttendingLegs) {
      // Was attending all — remove this leg
      next = allLegIds.filter(id => id !== legId);
    } else if (currentAttendingLegs.includes(legId)) {
      next = currentAttendingLegs.filter(id => id !== legId);
      if (next.length === 0) next = [legId]; // can't un-attend everything, keep at least one
    } else {
      next = [...currentAttendingLegs, legId];
      if (next.length === allLegIds.length) next = null; // back to all
    }
    api.updateInviteAttendingLegs(event.id, friendId, next).then(updated => onUpdate(event.id, () => updated));
  };

  const startFinalize = () => {
    const init = {};
    yesInv.forEach(i => { init[i.friendId] = i.showed !== false; });
    setTempShowed(init);
    setRating(event.rating ?? 3);
    setFinalizing(true);
  };

  const saveFinalize = () => {
    onUpdate(event.id, e => ({
      ...e, finalized: true, rating,
      invites: e.invites.map(i => i.inviteStatus !== "queued" && i.response === "yes"
        ? { ...i, showed: tempShowed[i.friendId] ?? false }
        : i
      ),
    }));
    setFinalizing(false);
  };

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{actLabel}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>
            {dateLabel} · {timeLabel}
            {event.location && <span> · 📍 {event.location}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {event.soloAnchor     && <Pill text="Going regardless" bg="#ecfdf5" c="#15803d" />}
          {event.plusOneAllowed && <Pill text="+1 welcome"       bg="#f5f3ff" c="#6d28d9" />}
          {event.cascade        && <Pill text={`Cascade ${accepted}/${event.maxCapacity ?? "?"}`} bg="#eef2ff" c="#4338ca" />}
          {event.finalized
            ? <Stars value={event.rating ?? 0} size={14} />
            : isPast
              ? <Pill text="Past — finalize" bg="#fef3c7" c="#d97706" />
              : <Pill text="Upcoming"        bg="#dcfce7" c="#15803d" />
          }
        </div>
      </div>

      {event.legs?.length > 0 && (
        <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: "2px solid #e5e7eb" }}>
          {event.legs.map(leg => (
            <div key={leg.id} style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>
              <span style={{ fontWeight: 700, color: "#374151" }}>{fmtTime(leg.startTime)}</span>
              {" — "}{leg.label}{leg.location ? <span style={{ color: "#9ca3af" }}> @ {leg.location}</span> : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {invited.map(inv => {
          const rm      = RESP_META[inv.response] || RESP_META.pending;
          const isExp   = expandedId === inv.friendId;
          const email   = getEmail(inv.friendId);
          const ch      = inv.inviteChannel;
          const chMeta  = ch ? (CHANNEL_META[ch] || null) : null;
          const showInlineResp = !event.finalized && inv.response === "pending"
            && (ch === "manual" || ch === "imessage");
          return (
            <div key={inv.friendId}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, color: "#374151" }}>{getName(inv.friendId)}</span>
                  {email && <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>{email}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {chMeta && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: chMeta.bg, color: chMeta.c }}>{chMeta.label}</span>
                  )}
                  {event.finalized && inv.response === "yes" && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: inv.showed ? "#16a34a" : "#dc2626" }}>
                      {inv.showed ? "✓ came" : "✗ flaked"}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: rm.bg, color: rm.c }}>{rm.label}</span>
                  {!event.finalized && (
                    <button onClick={() => setExpanded(isExp ? null : inv.friendId)} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#f3f4f6", color: "#6b7280", border: "none", cursor: "pointer" }}>edit</button>
                  )}
                </div>
              </div>
              {showInlineResp && (
                <div style={{ display: "flex", gap: 4, marginTop: 4, paddingLeft: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", alignSelf: "center" }}>Got a reply?</span>
                  {["yes", "maybe", "no"].map(r => {
                    const rc = RESP_META[r];
                    return <button key={r} onClick={() => handleManualResponse(inv.friendId, r)} style={{ padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.c, border: "none", cursor: "pointer" }}>{rc.label}</button>;
                  })}
                </div>
              )}
              {isExp && (
                <div style={{ display: "flex", gap: 4, marginTop: 4, paddingLeft: 8, flexWrap: "wrap" }}>
                  {["yes", "maybe", "no", "ghosted"].map(r => {
                    const rc = RESP_META[r];
                    return <button key={r} onClick={() => setResponse(inv.friendId, r)} style={{ padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.c, border: "none", cursor: "pointer" }}>{rc.label}</button>;
                  })}
                </div>
              )}
              {event.legs?.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, paddingLeft: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>
                    {!inv.attendingLegs ? "All segments" : inv.attendingLegs.map(id => event.legs.find(l => l.id === id)?.label ?? id).join(", ")}
                  </span>
                  {!event.finalized && event.legs.map(leg => {
                    const attending = !inv.attendingLegs || inv.attendingLegs.includes(leg.id);
                    return (
                      <button key={leg.id} onClick={() => handleToggleLeg(inv.friendId, leg.id, inv.attendingLegs)}
                        style={{
                          padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
                          background: attending ? "#dbeafe" : "#f3f4f6",
                          color: attending ? "#1d4ed8" : "#9ca3af",
                        }}>{leg.label || "Segment"}</button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {event.cascade && queued.length > 0 && !event.finalized && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Queue — waiting their turn</div>
          {queued.slice(0, 4).map((inv, i) => (
            <div key={inv.friendId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>#{invited.length + i + 1} — {getName(inv.friendId)}</span>
              {getEmail(inv.friendId) && <span style={{ fontSize: 10, color: "#c7d2fe" }}>{getEmail(inv.friendId)}</span>}
            </div>
          ))}
          {queued.length > 4 && <div style={{ fontSize: 11, color: "#9ca3af" }}>+{queued.length - 4} more in queue</div>}
          <button onClick={() => onAdvanceCascade(event.id)} style={{
            marginTop: 6, width: "100%", padding: "6px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#eef2ff", color: "#4f46e5", fontSize: 11, fontWeight: 700,
          }}>Invite next → {getName(nextQueued.friendId)}</button>
        </div>
      )}

      {isPast && !event.finalized && !finalizing && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
          <button onClick={startFinalize} style={{ width: "100%", padding: "7px", borderRadius: 9, fontSize: 12, fontWeight: 700, background: "#eef2ff", color: "#4f46e5", border: "none", cursor: "pointer" }}>
            Finalize — mark who actually showed up →
          </button>
        </div>
      )}

      {finalizing && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
          {yesInv.length === 0
            ? <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>Nobody said yes.</div>
            : <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Who actually showed up?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {yesInv.map(inv => {
                    const showed = tempShowed[inv.friendId] !== false;
                    return (
                      <div key={inv.friendId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "#374151" }}>{getName(inv.friendId)}</span>
                        <button onClick={() => setTempShowed(p => ({ ...p, [inv.friendId]: !showed }))} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: showed ? "#dcfce7" : "#fee2e2", color: showed ? "#15803d" : "#b91c1c", border: "none", cursor: "pointer" }}>{showed ? "✓ Showed" : "✗ Flaked"}</button>
                      </div>
                    );
                  })}
                </div>
              </>
          }
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Rate the hangout</div>
            <Stars value={rating} onChange={setRating} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveFinalize} style={{ flex: 1, padding: "8px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer" }}>Save & Finalize</button>
            <button onClick={() => setFinalizing(false)} style={{ padding: "8px 12px", borderRadius: 10, fontSize: 12, background: "#f3f4f6", color: "#6b7280", border: "none", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
