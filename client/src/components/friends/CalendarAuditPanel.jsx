import { useState } from "react";

const chip = (label, bg, color, border) => ({
  display: "inline-flex", alignItems: "center", gap: 3,
  fontSize: 11, padding: "2px 7px", borderRadius: 6, fontWeight: 500,
  background: bg, color, border: border ?? "none",
});

export function CalendarAuditPanel({ audit, friends, onConfirmHang, onClose }) {
  const matchedCount   = audit.matchedEvents?.length   ?? 0;
  const unmatchedCount = audit.unmatchedEvents?.length ?? 0;
  const reviewCount    = audit.reviewEvents?.length    ?? 0;

  const defaultTab = unmatchedCount > 0 ? "unmatched" : matchedCount > 0 ? "matched" : reviewCount > 0 ? "review" : "matched";
  const [tab,       setTab]       = useState(defaultTab);
  const [confirmed, setConfirmed] = useState({});  // key → [friendId, ...]
  const [dismissed, setDismissed] = useState({});  // key → Set<friendId>

  const byId  = id  => friends.find(f => f.id === id);
  const eKey  = ev  => `${ev.date}||${ev.title}`;

  const handleConfirm = async (friendId, date, key) => {
    try {
      await onConfirmHang(friendId, date);
      setConfirmed(prev => ({ ...prev, [key]: [...(prev[key] ?? []), friendId] }));
    } catch {}
  };

  const handleDismiss = (friendId, key) => {
    setDismissed(prev => {
      const s = new Set(prev[key]);
      s.add(friendId);
      return { ...prev, [key]: s };
    });
  };

  const handleTagSelect = async (e, date, key) => {
    const friendId = Number(e.target.value);
    if (!friendId) return;
    e.target.value = "";
    await handleConfirm(friendId, date, key);
  };

  const tabBtn = (id, label, count) => (
    <button key={id} onClick={() => setTab(id)} style={{
      padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
      cursor: "pointer", border: "1px solid",
      background:   tab === id ? "#111827" : "transparent",
      color:        tab === id ? "#fff"     : "#6b7280",
      borderColor:  tab === id ? "#111827"  : "#e5e7eb",
    }}>
      {label} {count}
    </button>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", letterSpacing: -0.2 }}>Calendar Audit</span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {tabBtn("matched",   "Matched",   matchedCount)}
          {tabBtn("unmatched", "Unmatched", unmatchedCount)}
          {tabBtn("review",    "Review",    reviewCount)}
          <button onClick={onClose} style={{ marginLeft: 4, background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {tab === "matched" && (
          matchedCount === 0
            ? <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: "#9ca3af" }}>No matched events.</p>
            : audit.matchedEvents.map(ev => {
                const key = eKey(ev);
                return (
                  <div key={key} style={{ padding: "8px 14px", borderBottom: "1px solid #f9fafb" }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>
                      {ev.date}
                      {ev.title && <span style={{ color: "#374151", fontWeight: 500 }}> · {ev.title}</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {ev.friendIds.map(id => {
                        const f = byId(id);
                        return f && <span key={id} style={chip(f.name, "#dcfce7", "#15803d")}>✓ {f.name}</span>;
                      })}
                    </div>
                  </div>
                );
              })
        )}

        {tab === "unmatched" && (
          unmatchedCount === 0
            ? <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: "#9ca3af" }}>No unmatched events — great coverage!</p>
            : audit.unmatchedEvents.map(ev => {
                const key    = eKey(ev);
                const conf   = confirmed[key] ?? [];
                const dism   = dismissed[key] ?? new Set();
                const fuzzy  = (ev.fuzzyMatches ?? []).filter(id => !conf.includes(id) && !dism.has(id));
                const picker = friends
                  .filter(f => (f.wantAround ?? "active") === "active" && !conf.includes(f.id))
                  .sort((a, b) => a.name.localeCompare(b.name));

                return (
                  <div key={key} style={{ padding: "8px 14px", borderBottom: "1px solid #f9fafb" }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                      {ev.date}
                      {ev.title && <span style={{ color: "#374151", fontWeight: 500 }}> · {ev.title}</span>}
                      {ev.attendeeCount > 0 && (
                        <span style={{ color: "#d1d5db" }}> · {ev.attendeeCount} attendee{ev.attendeeCount !== 1 ? "s" : ""}</span>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                      {conf.map(id => {
                        const f = byId(id);
                        return f && <span key={id} style={chip(f.name, "#dcfce7", "#15803d")}>✓ {f.name}</span>;
                      })}

                      {fuzzy.map(id => {
                        const f = byId(id);
                        return f && (
                          <span key={id} style={chip(f.name, "#fef9c3", "#92400e", "1px solid #fde68a")}>
                            {f.name}?
                            <button
                              onClick={() => handleConfirm(id, ev.date, key)}
                              title="Yes, we hung out"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#15803d", fontWeight: 700, fontSize: 12, padding: 0, lineHeight: 1 }}
                            >✓</button>
                            <button
                              onClick={() => handleDismiss(id, key)}
                              title="Not this person"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 11, padding: 0, lineHeight: 1 }}
                            >✗</button>
                          </span>
                        );
                      })}

                      <select
                        defaultValue=""
                        onChange={e => handleTagSelect(e, ev.date, key)}
                        style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #e5e7eb", color: "#6b7280", background: "#f9fafb", cursor: "pointer" }}
                      >
                        <option value="" disabled>+ Tag friend</option>
                        {picker.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })
        )}

        {tab === "review" && (
          reviewCount === 0
            ? <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: "#9ca3af" }}>No events to review.</p>
            : <>
                <p style={{ margin: 0, padding: "8px 14px 0", fontSize: 11, color: "#9ca3af" }}>
                  These events had no attendee data. Tag any where you hung out with a friend.
                </p>
                {audit.reviewEvents.map(ev => {
                  const key    = eKey(ev);
                  const conf   = confirmed[key] ?? [];
                  const picker = friends
                    .filter(f => (f.wantAround ?? "active") === "active" && !conf.includes(f.id))
                    .sort((a, b) => a.name.localeCompare(b.name));

                  return (
                    <div key={key} style={{ padding: "8px 14px", borderBottom: "1px solid #f9fafb" }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                        {ev.date}
                        {ev.title && <span style={{ color: "#374151", fontWeight: 500 }}> · {ev.title}</span>}
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                        {conf.map(id => {
                          const f = byId(id);
                          return f && <span key={id} style={chip(f.name, "#dcfce7", "#15803d")}>✓ {f.name}</span>;
                        })}

                        <select
                          defaultValue=""
                          onChange={e => handleTagSelect(e, ev.date, key)}
                          style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #e5e7eb", color: "#6b7280", background: "#f9fafb", cursor: "pointer" }}
                        >
                          <option value="" disabled>+ Tag friend</option>
                          {picker.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </>
        )}
      </div>
    </div>
  );
}
