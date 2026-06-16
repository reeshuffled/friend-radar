import { useState } from "react";
import { todayStr } from "../../lib/helpers.js";
import { EventCard } from "./EventCard.jsx";

export function EventsTab({
  events,
  friends,
  activities = [],
  onUpdate,
  onAdvanceCascade,
  goToPlan,
  onResponseUpdate,
}) {
  const [showDone, setShowDone] = useState(false);
  const today = todayStr();
  const upcoming = events
    .filter((e) => !e.finalized && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const needsAct = events
    .filter((e) => !e.finalized && e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const finalized = events.filter((e) => e.finalized).sort((a, b) => b.date.localeCompare(a.date));

  if (!events.length)
    return (
      <div style={{ textAlign: "center", padding: "64px 0", color: "#9ca3af" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
        <p style={{ fontWeight: 500, margin: 0 }}>No hangouts yet</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>Use Plan to create your first one</p>
        <button
          onClick={goToPlan}
          style={{
            marginTop: 12,
            padding: "8px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            background: "#4f46e5",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Go to Plan →
        </button>
      </div>
    );

  const Block = ({ title, items }) =>
    items.length > 0 && (
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#9ca3af",
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              friends={friends}
              activities={activities}
              onUpdate={onUpdate}
              onAdvanceCascade={onAdvanceCascade}
              onResponseUpdate={onResponseUpdate}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <Block title="Upcoming" items={upcoming} />
      <Block title={`Past — needs finalization (${needsAct.length})`} items={needsAct} />
      {finalized.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((v) => !v)}
            style={{
              fontSize: 12,
              color: "#9ca3af",
              background: "none",
              border: "none",
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            {showDone ? "▾" : "▸"} {finalized.length} finalized hangs
          </button>
          {showDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {finalized.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  friends={friends}
                  activities={activities}
                  onUpdate={onUpdate}
                  onAdvanceCascade={onAdvanceCascade}
                  onResponseUpdate={onResponseUpdate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
