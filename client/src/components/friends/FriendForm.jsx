import { useState } from "react";
import {
  AVAIL_SLOTS,
  DIST_TIERS,
  COMFORT_LEVELS,
  NOTICE_PREFS,
  STATUSES,
  FREQ_OPTS,
  EMPTY_FRIEND,
} from "../../lib/constants.js";
import { RangeSlider } from "../ui/RangeSlider.jsx";
import { Stars } from "../ui/Stars.jsx";
import {
  RANKED_ATTRS,
  rankedOrder,
  reRank,
  startComparisonSession,
  buildRankingWrites,
} from "../../lib/ranking.js";
import { RankSession } from "./RankSession.jsx";

const LOCATION_PREFS = [
  { id: "home", label: "Prefers home", desc: "Would rather hang at someone's place" },
  { id: "out", label: "Prefers out", desc: "Likes bars, restaurants, venues" },
  { id: "either", label: "Either works", desc: "No strong preference" },
];

function FriendPicker({ allFriends, selfId, selected, onChange, accentColor, bgColor }) {
  const [query, setQuery] = useState("");
  const options = allFriends.filter(
    (f) =>
      f.id !== selfId &&
      !selected.includes(f.id) &&
      f.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div>
      <div
        style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: selected.length ? 6 : 0 }}
      >
        {selected.map((id) => {
          const name = allFriends.find((f) => f.id === id)?.name ?? id;
          return (
            <span
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "3px 8px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                background: bgColor,
                color: accentColor,
              }}
            >
              {name}
              <button
                onClick={() => onChange(selected.filter((s) => s !== id))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: accentColor,
                  fontSize: 11,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          );
        })}
      </div>
      <input
        placeholder="Search friends..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {query && options.length > 0 && (
        <div
          style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 3, overflow: "hidden" }}
        >
          {options.slice(0, 5).map((f) => (
            <button
              key={f.id}
              onClick={() => {
                onChange([...selected, f.id]);
                setQuery("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                fontSize: 12,
                border: "none",
                background: "#fff",
                cursor: "pointer",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FriendForm({
  initial,
  isEditing,
  onSave,
  onCancel,
  onRankingUpdate,
  friends = [],
  activities = [],
  onAddActivity,
  onDeleteActivity,
}) {
  const [f, setF] = useState({ ...EMPTY_FRIEND, ...initial });
  const [newGroup, setNewGroup] = useState("");
  const [newTag, setNewTag] = useState("");
  const [addingAct, setAddingAct] = useState(false);
  const [newActLabel, setNewActLabel] = useState("");
  const [rankingAttr, setRankingAttr] = useState(null); // null = closed, "reliability" = open
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setInt = (id, v) => setF((p) => ({ ...p, interests: { ...p.interests, [id]: v } }));
  const toggleArr = (key, val) =>
    setF((p) => {
      const arr = p[key] ?? [];
      return { ...p, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });

  const card = {
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    padding: "16px 16px 6px",
    marginBottom: 12,
  };
  const inp = {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#1f2937",
    background: "#fff",
    display: "block",
    marginBottom: 8,
  };
  const sL = {
    fontSize: 10,
    fontWeight: 700,
    color: "#9ca3af",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 11,
    display: "block",
  };

  const Chips = ({ options, field, idKey = null, labelKey = null, bg = "#4f46e5" }) => (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
      {options.map((opt) => {
        const id = idKey ? opt[idKey] : opt;
        const lbl = labelKey ? opt[labelKey] : opt;
        const active = Array.isArray(f[field]) ? f[field]?.includes(id) : f[field] === id;
        return (
          <button
            key={String(id)}
            onClick={() => (Array.isArray(f[field]) ? toggleArr(field, id) : set(field, id))}
            style={{
              padding: "4px 11px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: active ? bg : "#f3f4f6",
              color: active ? "#fff" : "#6b7280",
              border: "none",
            }}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>
          {isEditing ? `Edit ${initial.name}` : "Add a friend"}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onCancel}
            style={{
              fontSize: 13,
              color: "#9ca3af",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => f.name.trim() && onSave(f)}
            disabled={!f.name.trim()}
            style={{
              padding: "6px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: f.name.trim() ? "pointer" : "default",
              background: f.name.trim() ? "#4f46e5" : "#e5e7eb",
              color: f.name.trim() ? "#fff" : "#9ca3af",
            }}
          >
            {isEditing ? "Save" : "Add"}
          </button>
        </div>
      </div>

      <div style={card}>
        <span style={sL}>Basic info</span>
        <input
          placeholder="Name *"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          style={inp}
        />
        <input
          placeholder="Email — needed for calendar invites"
          value={f.email || ""}
          onChange={(e) => set("email", e.target.value)}
          style={{ ...inp, borderColor: f.email ? "#a5b4fc" : "#e5e7eb" }}
        />
        <input
          placeholder="Phone (for texts)"
          value={f.phone || ""}
          onChange={(e) => set("phone", e.target.value)}
          style={inp}
        />
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 5,
            }}
          >
            Preferred invite channel
          </span>
          <Chips
            options={[
              { id: "email", label: "Email" },
              { id: "gcal", label: "Google Cal" },
              { id: "imessage", label: "Text" },
              { id: "manual", label: "Manual" },
            ]}
            field="preferredChannel"
            idKey="id"
            labelKey="label"
            bg="#0284c7"
          />
        </div>
        <input
          placeholder="Phone / IG / contact (optional)"
          value={f.contact || ""}
          onChange={(e) => set("contact", e.target.value)}
          style={inp}
        />
        <textarea
          placeholder="Notes..."
          value={f.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          style={{ ...inp, resize: "none" }}
        />

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 5,
            }}
          >
            Status
          </span>
          <Chips options={STATUSES} field="status" />
        </div>
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Groups
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Social units — crews you hang with together
          </span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            {[...new Set([...(f.groups ?? []), ...friends.flatMap((fr) => fr.groups ?? [])])]
              .sort()
              .map((g) => {
                const active = f.groups?.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleArr("groups", g)}
                    style={{
                      padding: "4px 11px",
                      borderRadius: 99,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: active ? "#0ea5e9" : "#f3f4f6",
                      color: active ? "#fff" : "#6b7280",
                      border: "none",
                    }}
                  >
                    {g}
                  </button>
                );
              })}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              placeholder="New group..."
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroup.trim()) {
                  toggleArr("groups", newGroup.trim());
                  setNewGroup("");
                }
              }}
              style={{ ...inp, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => {
                if (newGroup.trim()) {
                  toggleArr("groups", newGroup.trim());
                  setNewGroup("");
                }
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                background: "#0ea5e9",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Tags
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            How you know them — co-worker, neighbor, gym buddy…
          </span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            {[...new Set([...(f.tags ?? []), ...friends.flatMap((fr) => fr.tags ?? [])])]
              .sort()
              .map((t) => {
                const active = f.tags?.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleArr("tags", t)}
                    style={{
                      padding: "4px 11px",
                      borderRadius: 99,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: active ? "#f59e0b" : "#f3f4f6",
                      color: active ? "#fff" : "#6b7280",
                      border: "none",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              placeholder="New tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  toggleArr("tags", newTag.trim());
                  setNewTag("");
                }
              }}
              style={{ ...inp, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => {
                if (newTag.trim()) {
                  toggleArr("tags", newTag.trim());
                  setNewTag("");
                }
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                background: "#f59e0b",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 5,
            }}
          >
            Hang frequency
          </span>
          <Chips
            options={FREQ_OPTS}
            field="targetFreqDays"
            idKey="days"
            labelKey="label"
            bg="#6d28d9"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Distance from you
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Affects Able score.
          </span>
          <Chips
            options={DIST_TIERS}
            field="distanceTier"
            idKey="id"
            labelKey="label"
            bg="#0284c7"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Location preference
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Modulates Willing when activity location type mismatches their preference.
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {LOCATION_PREFS.map((lp) => (
              <button
                key={lp.id}
                onClick={() => set("locationPref", lp.id)}
                style={{
                  padding: "7px 11px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  background: f.locationPref === lp.id ? "#f0f9ff" : "#f9fafb",
                  outline: f.locationPref === lp.id ? "1.5px solid #0284c7" : "1px solid #f3f4f6",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: f.locationPref === lp.id ? "#0284c7" : "#374151",
                  }}
                >
                  {lp.label}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{lp.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Generally available
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Leave blank = unknown.
          </span>
          <Chips
            options={AVAIL_SLOTS}
            field="availSlots"
            idKey="id"
            labelKey="label"
            bg="#16a34a"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Comfort at hangs
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Modulates Willing when +1 is allowed.
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {COMFORT_LEVELS.map((cl) => (
              <button
                key={cl.id}
                onClick={() => set("comfortLevel", cl.id)}
                style={{
                  padding: "7px 11px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  background: f.comfortLevel === cl.id ? "#f5f3ff" : "#f9fafb",
                  outline: f.comfortLevel === cl.id ? "1.5px solid #6d28d9" : "1px solid #f3f4f6",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: f.comfortLevel === cl.id ? "#6d28d9" : "#374151",
                  }}
                >
                  {cl.label}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{cl.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Social battery type
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Affects Willing on weekday-evening hangs.
          </span>
          <Chips
            options={[
              { id: "introvert", label: "Introvert 🔋" },
              { id: "ambivert", label: "Ambivert" },
              { id: "extrovert", label: "Extrovert ⚡" },
            ]}
            field="socialType"
            idKey="id"
            labelKey="label"
            bg="#6d28d9"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Work drain
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            How much their job drains their social battery by evening.
          </span>
          <Chips
            options={[
              { id: "low", label: "Low drain" },
              { id: "medium", label: "Medium drain" },
              { id: "high", label: "High drain" },
            ]}
            field="workDrain"
            idKey="id"
            labelKey="label"
            bg="#dc2626"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 2,
            }}
          >
            Notice needed
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 5 }}>
            Short-notice invites reduce Able score for planners.
          </span>
          <Chips
            options={NOTICE_PREFS}
            field="noticePreference"
            idKey="id"
            labelKey="label"
            bg="#0284c7"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              display: "block",
              marginBottom: 5,
            }}
          >
            Status
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { value: "active", label: "Active ✓", bg: "#dcfce7", color: "#15803d" },
              { value: "skip", label: "Set as inactive priority", bg: "#fee2e2", color: "#b91c1c" },
            ].map(({ value, label, bg, color }) => {
              const sel = (f.wantAround ?? "active") === value;
              return (
                <button
                  key={value}
                  onClick={() => set("wantAround", value)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: sel ? bg : "#f3f4f6",
                    color: sel ? color : "#9ca3af",
                    border: "none",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={card}>
        <span style={sL}>About them — used until event history builds</span>

        {/* Reliability: ranked via Beli pairwise (or legacy slider for unsaved friends) */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              Shows up when they say yes?
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {f.rankings?.reliability != null ? (
                <>
                  <Stars value={Math.round(f.rankings.reliability / 2)} size={14} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#4f46e5" }}>
                    {f.rankings.reliability.toFixed(1)}/10
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  {f.id ? "not ranked" : `${f.reliability ?? 3}/5`}
                </span>
              )}
              {f.id ? (
                <button
                  onClick={() => setRankingAttr("reliability")}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 8,
                    border: "none",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                  }}
                >
                  {f.rankings?.reliability != null ? "Re-rank" : "Rank"}
                </button>
              ) : null}
            </div>
          </div>
          {/* Fallback slider for unsaved friend */}
          {!f.id && <RangeSlider value={f.reliability} onChange={(v) => set("reliability", v)} />}
          {f.id && f.rankings?.reliability == null && (
            <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
              Click "Rank" to place this friend in a pairwise ranking instead of guessing a number.
            </div>
          )}
        </div>

        {/* Flake override counter */}
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fef9ee",
            border: "1px solid #fed7aa",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                Manual reliability penalty
              </span>
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 1 }}>
                −12% Trust per flake, floored at 30%. Use for flakes not logged as events.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => set("manualFlakes", (f.manualFlakes ?? 0) - 1)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  border: "1px solid #d97706",
                  background: "#fff7ed",
                  color: "#92400e",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                −
              </button>
              <span
                style={{
                  minWidth: 24,
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: 800,
                  color:
                    (f.manualFlakes ?? 0) > 0
                      ? "#b91c1c"
                      : (f.manualFlakes ?? 0) < 0
                        ? "#059669"
                        : "#9ca3af",
                }}
              >
                {(f.manualFlakes ?? 0) > 0 ? `+${f.manualFlakes}` : (f.manualFlakes ?? 0)}
              </span>
              <button
                onClick={() => set("manualFlakes", (f.manualFlakes ?? 0) + 1)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  border: "1px solid #d97706",
                  background: "#fff7ed",
                  color: "#92400e",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <RangeSlider
          label="Texts back reliably?"
          value={f.responsiveness}
          onChange={(v) => set("responsiveness", v)}
        />
        <RangeSlider
          label="Easy to reach out to?"
          value={f.vibe}
          onChange={(v) => set("vibe", v)}
        />
        <RangeSlider
          label="Down to hang with your other friends?"
          value={f.openness}
          onChange={(v) => set("openness", v)}
        />
        <RangeSlider
          label="Generally has bandwidth?"
          value={f.logistics}
          onChange={(v) => set("logistics", v)}
        />
      </div>

      {/* Rank session modal */}
      {rankingAttr && f.id && (
        <RankSession
          orderedIds={
            // If re-ranking, strip this friend from the current order; if new to ranking, use full order
            f.rankings?.[rankingAttr] != null
              ? rankedOrder(friends, rankingAttr).filter((id) => id !== f.id)
              : rankedOrder(friends, rankingAttr)
          }
          newId={f.id}
          prompt={RANKED_ATTRS.find((a) => a.key === rankingAttr)?.prompt ?? rankingAttr}
          friends={friends}
          onComplete={(finalOrder) => {
            setRankingAttr(null);
            // Update the current friend's ranking in form state
            const writes = buildRankingWrites(friends, rankingAttr, finalOrder);
            const myPatch = writes.find((w) => w.id === f.id);
            if (myPatch) setF((prev) => ({ ...prev, rankings: myPatch.rankings }));
            // Batch-persist rankings for all affected friends (including this one)
            if (onRankingUpdate) onRankingUpdate(writes);
          }}
          onCancel={() => setRankingAttr(null)}
        />
      )}

      <div style={card}>
        <span style={sL}>What are they into?</span>
        {activities.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <RangeSlider
                label={a.label}
                value={f.interests?.[a.id] ?? 1}
                onChange={(v) => setInt(a.id, v)}
              />
            </div>
            {!a.isBuiltin && onDeleteActivity && (
              <button
                onClick={() => onDeleteActivity(a.id)}
                title="Remove activity type"
                style={{
                  flexShrink: 0,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#d1d5db",
                  fontSize: 14,
                  padding: "0 2px",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {onAddActivity &&
          (addingAct ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const label = newActLabel.trim();
                if (label) onAddActivity(label);
                setNewActLabel("");
                setAddingAct(false);
              }}
              style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}
            >
              <input
                autoFocus
                value={newActLabel}
                onChange={(e) => setNewActLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setAddingAct(false), setNewActLabel(""))}
                placeholder="Activity name…"
                style={{
                  flex: 1,
                  border: "1.5px solid #4f46e5",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingAct(false);
                  setNewActLabel("");
                }}
                style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: "#f3f4f6",
                  color: "#6b7280",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAddingAct(true)}
              style={{
                marginTop: 8,
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                background: "#f3f4f6",
                color: "#6b7280",
                border: "1px dashed #d1d5db",
                cursor: "pointer",
              }}
            >
              + Add activity type
            </button>
          ))}
      </div>

      <div style={card}>
        <span style={sL}>Social dynamics</span>

        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#dc2626",
              display: "block",
              marginBottom: 4,
            }}
          >
            Doesn't get along with
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 6 }}>
            Cascade will skip them if a conflicting friend already said yes.
          </span>
          <FriendPicker
            allFriends={friends}
            selfId={f.id}
            selected={f.conflicts ?? []}
            onChange={(ids) => set("conflicts", ids)}
            accentColor="#dc2626"
            bgColor="#fee2e2"
          />
        </div>

        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#059669",
              display: "block",
              marginBottom: 4,
            }}
          >
            Has good chemistry with
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 6 }}>
            Shows synergy hints in the plan view (backed up by event history).
          </span>
          <FriendPicker
            allFriends={friends}
            selfId={f.id}
            selected={f.synergies ?? []}
            onChange={(ids) => set("synergies", ids)}
            accentColor="#059669"
            bgColor="#dcfce7"
          />
        </div>
      </div>

      <button
        onClick={() => f.name.trim() && onSave(f)}
        disabled={!f.name.trim()}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 14,
          border: "none",
          background: f.name.trim() ? "#4f46e5" : "#c7d2fe",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          cursor: f.name.trim() ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}
      >
        {isEditing ? "Save changes" : "Add friend"}
      </button>
    </div>
  );
}
