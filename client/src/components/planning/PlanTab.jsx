import { useState, useRef } from "react";
import { SOCIAL_ENERGY_COSTS, ACTIVITIES, VENUE_PROXIMITY, ACTIVITY_LOCATION_TYPE } from "../../lib/constants.js";
import { todayStr, getEventSlot, formatTime, effectiveLastHang, daysSince, flakeStats, recencyBadge, synergyBetween } from "../../lib/helpers.js";
import { scoreFor } from "../../lib/scoring.js";
import { Pill } from "../ui/Pill.jsx";
import { WATBars } from "../ui/WATBars.jsx";
import { ScoreDisplay } from "../ui/ScoreDisplay.jsx";

export function PlanTab({ friends, events, activities = [], onCreate, onAddActivity, goToEvents }) {
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; };

  const [actId,          setActId]      = useState("just-hang");
  const [date,           setDate]       = useState(tomorrow);
  const [startTime,      setStart]      = useState("18:00");
  const [endTime,        setEnd]        = useState("21:00");

  const changeActivity = (id) => {
    const def     = ACTIVITIES.find(a => a.id === id) ?? activities.find(a => a.id === id);
    const locType = def?.locationType ?? ACTIVITY_LOCATION_TYPE[id] ?? "either";
    setActId(id);
    if (def?.defaultStart) setStart(def.defaultStart);
    if (def?.defaultEnd)   setEnd(def.defaultEnd);
    setVenueProx(locType === "home" ? "mine" : "out");
  };
  const [location,       setLocation]   = useState("");
  const [venueProx,      setVenueProx]  = useState("mine");
  const [cascade,        setCascade]    = useState(false);
  const [maxCap,         setMaxCap]     = useState(5);
  const [selected,       setSelected]   = useState(new Set());
  const [plusOneAllowed, setPlusOne]    = useState(false);
  const [soloAnchor,     setSoloAnchor] = useState(false);
  const [quickMode,      setQuickMode]  = useState(false);
  const [goal,           setGoal]        = useState("best-match");
  const [shuffleMode,    setShuffleMode] = useState(false);
  const [shuffleGroup,   setShuffleGroup] = useState([]);
  const [lockedFriends,  setLockedFriends] = useState(new Set());
  const [lockedActivity, setLockedActivity] = useState(false);
  const [shuffleSize,    setShuffleSize] = useState(3);
  const [wildCard,       setWildCard]   = useState(false);
  const [myEnergy,       setMyEnergy]   = useState(3);
  const [legs,           setLegs]       = useState([]);
  const [message,        setMessage]        = useState("");
  const [addingActivity, setAddingActivity] = useState(false);
  const [newActLabel,    setNewActLabel]    = useState("");
  const newActRef = useRef(null);

  const effectiveDate  = quickMode ? todayStr() : date;
  const effectiveStart = quickMode
    ? (() => {
        const now = new Date();
        const h   = now.getHours();
        const m   = now.getMinutes() >= 30 ? "30" : "00";
        return `${String(h).padStart(2, "0")}:${m}`;
      })()
    : startTime;

  const slot = getEventSlot(effectiveDate, effectiveStart);

  const scored = friends
    .filter(f => f.wantAround === 'active')
    .map(f => {
      const s = { ...f, ...scoreFor(f, actId, slot, events, plusOneAllowed, effectiveDate, activities, venueProx) };
      const ds = daysSince(effectiveLastHang(f, events));
      if (goal === "reconnect") {
        const base = ds === null ? 15 : ds >= 90 ? 12 : ds >= 60 ? 8 : ds >= 30 ? 4 : 0;
        const overdueBonus = (f.targetFreqDays && ds !== null && ds >= f.targetFreqDays) ? 5 : 0;
        const boost = Math.min(20, base + overdueBonus);
        if (boost) s.score = Math.min(100, s.score + boost);
      } else if (goal === "reliable") {
        const boost = Math.round((s.trust - 50) * 0.4);
        s.score = Math.min(100, Math.max(0, s.score + boost));
      } else if (goal === "grow") {
        const boost = f.status === "Prospect" ? 18 : f.status === "Acquaintance" ? 10 : 0;
        if (boost) s.score = Math.min(100, s.score + boost);
      }
      return s;
    })
    .sort((a, b) => {
      if (a.isBusyThisWeek !== b.isBusyThisWeek) return a.isBusyThisWeek ? 1 : -1;
      if (a.inCooldown !== b.inCooldown) return a.inCooldown ? 1 : -1;
      return b.score - a.score;
    });

  const queue  = cascade ? scored.filter(f => !f.isBusyThisWeek && !f.inCooldown).slice(0, maxCap * 2) : [];

  const bestActivityForGroup = (groupIds) => {
    const grp = friends.filter(f => groupIds.includes(f.id));
    if (!activities.length || !grp.length) return actId;
    return activities
      .map(a => ({ id: a.id, avg: grp.reduce((s, f) => s + (f.interests?.[a.id] ?? 1), 0) / grp.length }))
      .sort((a, b) => b.avg - a.avg)[0].id;
  };

  const doReroll = (locked = lockedFriends, size = shuffleSize) => {
    const lockedArr = [...locked];
    const pool = friends
      .filter(f => f.wantAround === 'active' && !locked.has(f.id))
      .filter(f => wildCard ? true : !lockedArr.some(lid =>
        (f.conflicts ?? []).includes(lid) ||
        (friends.find(lf => lf.id === lid)?.conflicts ?? []).includes(f.id)
      ))
      .sort(() => Math.random() - 0.5);
    const newIds = [...lockedArr, ...pool.slice(0, Math.max(0, size - lockedArr.length)).map(f => f.id)];
    setShuffleGroup(newIds);
    if (!lockedActivity) setActId(bestActivityForGroup(newIds));
  };

  const toggleLockFriend = (id) => setLockedFriends(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggle = id => {
    if (shuffleMode) {
      setShuffleGroup(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    } else {
      setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }
  };

  const shuffleConflicts = shuffleGroup.flatMap((id, i) =>
    shuffleGroup.slice(i + 1)
      .filter(id2 =>
        (friends.find(f => f.id === id)?.conflicts ?? []).includes(id2) ||
        (friends.find(f => f.id === id2)?.conflicts ?? []).includes(id)
      )
      .map(id2 => [friends.find(f => f.id === id)?.name, friends.find(f => f.id === id2)?.name])
  );

  const createNormal = () => {
    const inviteIds = shuffleMode ? shuffleGroup : [...selected];
    if (!inviteIds.length) return;
    const effectiveLegs     = legs.length > 0 ? legs : null;
    const effectiveStartFin = effectiveLegs ? effectiveLegs[0].startTime : effectiveStart;
    const effectiveEndFin   = effectiveLegs ? effectiveLegs[effectiveLegs.length - 1].endTime : endTime;
    onCreate({
      id: `evt-${Date.now()}`, activityId: actId, date: effectiveDate,
      startTime: effectiveStartFin, endTime: effectiveEndFin, location,
      legs: effectiveLegs,
      invites: inviteIds.map(id => {
        const friend = friends.find(f => f.id === id);
        return { friendId: id, response: "pending", showed: null, inviteStatus: "invited", inviteChannel: friend?.preferredChannel ?? "email", attendingLegs: null };
      }),
      notes: "", message, finalized: false, rating: null,
      cascade: false, maxCapacity: null,
      plusOneAllowed, soloAnchor, venueProximity: venueProx, createdAt: todayStr(),
    });
    setSelected(new Set());
    setShuffleGroup([]);
    setLockedFriends(new Set());
    setMessage("");
    goToEvents();
  };

  const createCascade = () => {
    if (!queue.length) return;
    const effectiveLegs     = legs.length > 0 ? legs : null;
    const effectiveStartFin = effectiveLegs ? effectiveLegs[0].startTime : effectiveStart;
    const effectiveEndFin   = effectiveLegs ? effectiveLegs[effectiveLegs.length - 1].endTime : endTime;
    onCreate({
      id: `evt-${Date.now()}`, activityId: actId, date: effectiveDate,
      startTime: effectiveStartFin, endTime: effectiveEndFin, location,
      legs: effectiveLegs,
      invites: queue.map((f, idx) => ({
        friendId: f.id, response: "pending", showed: null,
        inviteStatus: idx === 0 ? "invited" : "queued",
        queuePosition: idx + 1,
        inviteChannel: f.preferredChannel ?? "email",
        attendingLegs: null,
      })),
      notes: "", message, finalized: false, rating: null,
      cascade: true, maxCapacity: maxCap,
      plusOneAllowed, soloAnchor, venueProximity: venueProx, createdAt: todayStr(),
    });
    setMessage("");
    goToEvents();
  };

  const actLabel = activities.find(a => a.id === actId)?.label;

  return (
    <div>
      {/* Mode selector */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#f3f4f6", borderRadius: 12, padding: 4 }}>
        {[
          { id: "normal",  label: "Normal" },
          { id: "cascade", label: "Cascade" },
          { id: "today",   label: "⚡ Today" },
          { id: "shuffle", label: "🎲 Shuffle" },
        ].map(m => {
          const active = m.id === "today" ? quickMode : m.id === "cascade" ? cascade && !quickMode : m.id === "shuffle" ? shuffleMode : !cascade && !quickMode && !shuffleMode;
          return (
            <button key={m.id} onClick={() => {
              if (m.id === "today")   { setQuickMode(true);  setCascade(false); setShuffleMode(false); }
              if (m.id === "cascade") { setQuickMode(false); setCascade(true);  setShuffleMode(false); }
              if (m.id === "normal")  { setQuickMode(false); setCascade(false); setShuffleMode(false); }
              if (m.id === "shuffle") { setQuickMode(false); setCascade(false); setShuffleMode(true); doReroll(lockedFriends, shuffleSize); }
            }} style={{
              flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700,
              background: active ? "#fff" : "transparent",
              color: active ? (m.id === "today" ? "#4f46e5" : m.id === "cascade" ? "#0284c7" : "#111827") : "#9ca3af",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.12s",
            }}>{m.label}</button>
          );
        })}
      </div>

      {!quickMode && cascade && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13, padding: "8px 12px", background: "#f0f9ff", borderRadius: 10, border: "1px solid #bae6fd" }}>
          <div style={{ flex: 1, fontSize: 11, color: "#0369a1" }}>Invite #1 now → queue the rest → auto-advance every 36hrs</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#0369a1", fontWeight: 600 }}>Max</span>
            {[3, 4, 5, 6, 8].map(n => (
              <button key={n} onClick={() => setMaxCap(n)} style={{
                padding: "3px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                background: maxCap === n ? "#0284c7" : "#e0f2fe",
                color: maxCap === n ? "#fff" : "#0369a1",
              }}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {quickMode && (
        <div style={{ marginBottom: 13, padding: "10px 12px", background: "#f0f9ff", borderRadius: 10, border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 11, color: "#0369a1", fontWeight: 700, marginBottom: 7 }}>Short notice — planners will score lower. Pick what fits your energy.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, whiteSpace: "nowrap" }}>My energy:</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setMyEnergy(n)} style={{
                  width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: n <= myEnergy ? "#0284c7" : "#e0f2fe",
                  color: n <= myEnergy ? "#fff" : "#7dd3fc",
                }}>●</button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {myEnergy <= 2 ? "Low — coffee / movies" : myEnergy >= 4 ? "High — up for anything" : "Medium"}
            </span>
          </div>
        </div>
      )}

      {/* Activity */}
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 7 }}>Activity</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {activities.map(a => {
            const cost = a.energyCost ?? SOCIAL_ENERGY_COSTS[a.id] ?? 0.35;
            const costLabel = cost <= 0.25 ? "low energy" : cost <= 0.5 ? "medium" : "high energy";
            return (
              <button key={a.id} onClick={() => changeActivity(a.id)} style={{
                padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 500,
                background: actId === a.id ? "#4f46e5" : "#fff",
                color: actId === a.id ? "#fff" : "#6b7280",
                border: actId === a.id ? "1.5px solid #4f46e5" : "1px solid #e5e7eb", cursor: "pointer",
              }}>
                {a.label}
                {actId === a.id && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.8 }}>({costLabel})</span>}
              </button>
            );
          })}
          {addingActivity ? (
            <form onSubmit={e => {
              e.preventDefault();
              const label = newActLabel.trim();
              if (label && onAddActivity) onAddActivity(label);
              setNewActLabel("");
              setAddingActivity(false);
            }} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                ref={newActRef}
                autoFocus
                value={newActLabel}
                onChange={e => setNewActLabel(e.target.value)}
                onKeyDown={e => e.key === "Escape" && (setAddingActivity(false), setNewActLabel(""))}
                placeholder="Activity name…"
                style={{ padding: "5px 10px", borderRadius: 99, fontSize: 12, border: "1.5px solid #4f46e5", outline: "none", width: 140 }}
              />
              <button type="submit" style={{ padding: "5px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer" }}>Add</button>
              <button type="button" onClick={() => { setAddingActivity(false); setNewActLabel(""); }} style={{ padding: "5px 8px", borderRadius: 99, fontSize: 12, background: "#f3f4f6", color: "#6b7280", border: "none", cursor: "pointer" }}>✕</button>
            </form>
          ) : (
            <button onClick={() => setAddingActivity(true)} style={{
              padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
              background: "#f3f4f6", color: "#6b7280", border: "1px dashed #d1d5db", cursor: "pointer",
            }}>+ Add</button>
          )}
        </div>
        {actId && (
          <div style={{ marginTop: 5, fontSize: 11, color: "#9ca3af" }}>
            Social energy cost:{" "}
            <span style={{ fontWeight: 700, color: (activities.find(a => a.id === actId)?.energyCost ?? SOCIAL_ENERGY_COSTS[actId] ?? 0) <= 0.25 ? "#16a34a" : (activities.find(a => a.id === actId)?.energyCost ?? SOCIAL_ENERGY_COSTS[actId] ?? 0) <= 0.5 ? "#d97706" : "#dc2626" }}>
              {Math.round((activities.find(a => a.id === actId)?.energyCost ?? SOCIAL_ENERGY_COSTS[actId] ?? 0.35) * 100)}%
            </span>
            {" "}of battery — introverts after a work day feel this more
          </div>
        )}
      </div>

      {!quickMode && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
                width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 10px",
                fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111827",
              }} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Time</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="time" value={startTime} onChange={e => setStart(e.target.value)} style={{
                  flex: 1, border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 10px",
                  fontSize: 13, outline: "none", background: "#fff", color: "#111827",
                }} />
                <span style={{ fontSize: 12, color: "#9ca3af" }}>to</span>
                <input type="time" value={endTime} onChange={e => setEnd(e.target.value)} style={{
                  flex: 1, border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 10px",
                  fontSize: 13, outline: "none", background: "#fff", color: "#111827",
                }} />
              </div>
              {startTime && (
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>
                  {formatTime(startTime)}{endTime ? ` – ${formatTime(endTime)}` : ""} · {slot.replace("-", " ").replace("-", " ")}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <button onClick={() => {
              if (legs.length === 0) {
                setLegs([{ id: `leg-${Date.now()}`, label: "Main activity", startTime, endTime, location }]);
              } else {
                setLegs([]);
              }
            }} style={{
              fontSize: 11, color: legs.length > 0 ? "#4f46e5" : "#9ca3af",
              background: "none", border: "none", cursor: "pointer", padding: "4px 0", textAlign: "left",
            }}>
              {legs.length > 0 ? "✓ Multi-segment" : "+ Add segments (pre/post activity)"}
            </button>

            {legs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {legs.map((leg, i) => (
                  <div key={leg.id} style={{ background: "#f9fafb", borderRadius: 10, padding: "8px 10px", border: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 5, alignItems: "center" }}>
                      <input
                        value={leg.label}
                        onChange={e => setLegs(ls => ls.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                        placeholder="Label (e.g. Pre-drinks)"
                        style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 7, padding: "5px 8px", fontSize: 12, outline: "none" }}
                      />
                      <button onClick={() => setLegs(ls => ls.filter((_, j) => j !== i))}
                        style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>✕</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="time" value={leg.startTime}
                        onChange={e => setLegs(ls => ls.map((l, j) => j === i ? { ...l, startTime: e.target.value } : l))}
                        style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 7, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff", color: "#111827" }} />
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>–</span>
                      <input type="time" value={leg.endTime}
                        onChange={e => setLegs(ls => ls.map((l, j) => j === i ? { ...l, endTime: e.target.value } : l))}
                        style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 7, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff", color: "#111827" }} />
                      <input value={leg.location || ""}
                        onChange={e => setLegs(ls => ls.map((l, j) => j === i ? { ...l, location: e.target.value } : l))}
                        placeholder="Location"
                        style={{ flex: 2, border: "1px solid #e5e7eb", borderRadius: 7, padding: "5px 8px", fontSize: 12, outline: "none" }} />
                    </div>
                  </div>
                ))}
                <button onClick={() => setLegs(ls => [...ls, { id: `leg-${Date.now()}`, label: "", startTime: legs[legs.length-1]?.endTime ?? endTime, endTime, location: "" }])}
                  style={{ fontSize: 11, color: "#4f46e5", background: "none", border: "1px dashed #c7d2fe", borderRadius: 8, padding: "6px", cursor: "pointer" }}>
                  + Add segment
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Location</div>
            <input placeholder="Where is this happening?" value={location} onChange={e => setLocation(e.target.value)} style={{
              width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 12px",
              fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111827",
              marginBottom: 6,
            }} />
            <div style={{ display: "flex", gap: 5 }}>
              {VENUE_PROXIMITY.map(vp => (
                <button key={vp.id} onClick={() => setVenueProx(vp.id)} title={vp.desc} style={{
                  flex: 1, padding: "5px 4px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", border: "1px solid",
                  background:  venueProx === vp.id ? "#1e1b4b" : "#f9fafb",
                  color:       venueProx === vp.id ? "#fff"    : "#6b7280",
                  borderColor: venueProx === vp.id ? "#1e1b4b" : "#e5e7eb",
                }}>{vp.label}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Event flags */}
      <div style={{ display: "flex", gap: 8, marginBottom: 13 }}>
        <button onClick={() => setSoloAnchor(v => !v)} style={{
          flex: 1, padding: "9px 12px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
          background: soloAnchor ? "#ecfdf5" : "#f9fafb",
          outline: soloAnchor ? "1.5px solid #16a34a" : "1px solid #f3f4f6",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: soloAnchor ? "#15803d" : "#374151" }}>
            {soloAnchor ? "✓ " : ""}I'm going anyway
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Solo anchor — removes coordination pressure.</div>
        </button>
        <button onClick={() => setPlusOne(v => !v)} style={{
          flex: 1, padding: "9px 12px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
          background: plusOneAllowed ? "#f5f3ff" : "#f9fafb",
          outline: plusOneAllowed ? "1.5px solid #6d28d9" : "1px solid #f3f4f6",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: plusOneAllowed ? "#6d28d9" : "#374151" }}>
            {plusOneAllowed ? "✓ " : ""}+1 welcome
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Boosts Willing for people who need an anchor.</div>
        </button>
      </div>

      {/* Shuffle panel */}
      {shuffleMode && (
        <div style={{ marginBottom: 13, background: "#fafafa", borderRadius: 12, border: "1px solid #e5e7eb", padding: "12px 14px" }}>
          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Size</span>
            {[2, 3, 4, 5, 6].map(n => (
              <button key={n} onClick={() => { setShuffleSize(n); doReroll(lockedFriends, n); }} style={{
                width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: shuffleSize === n ? "#4f46e5" : "#f3f4f6",
                color: shuffleSize === n ? "#fff" : "#9ca3af",
              }}>{n}</button>
            ))}
            <button onClick={() => setWildCard(v => !v)} style={{
              padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
              background: wildCard ? "#fef3c7" : "#f3f4f6",
              color: wildCard ? "#b45309" : "#9ca3af",
              outline: wildCard ? "1.5px solid #f59e0b" : "none",
            }}>Wild card</button>
            <button onClick={() => doReroll()} style={{
              marginLeft: "auto", padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700,
              background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer",
            }}>🎲 Re-roll</button>
          </div>

          {/* Activity lock */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", width: 60 }}>Activity</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{activities.find(a => a.id === actId)?.label ?? actId}</span>
            <button onClick={() => setLockedActivity(v => !v)} style={{
              fontSize: 12, background: "none", border: "none", cursor: "pointer",
              color: lockedActivity ? "#4f46e5" : "#d1d5db",
            }} title={lockedActivity ? "Unlock activity" : "Lock activity"}>{lockedActivity ? "🔒" : "🔓"}</button>
          </div>

          {/* Group chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", width: 60 }}>Group</span>
            {shuffleGroup.length === 0 && <span style={{ fontSize: 11, color: "#9ca3af" }}>Hit Re-roll to pick a group</span>}
            {shuffleGroup.map(id => {
              const f = friends.find(fr => fr.id === id);
              if (!f) return null;
              const locked = lockedFriends.has(id);
              const hasConflict = shuffleConflicts.some(([a, b]) => a === f.name || b === f.name);
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 8px 4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                  background: locked ? "#eef2ff" : "#f3f4f6",
                  color: locked ? "#4338ca" : "#374151",
                  border: hasConflict ? "1.5px solid #fca5a5" : locked ? "1.5px solid #a5b4fc" : "1.5px solid transparent",
                }}>
                  {f.name}
                  <button onClick={() => toggleLockFriend(id)} style={{
                    fontSize: 11, background: "none", border: "none", cursor: "pointer",
                    color: locked ? "#4f46e5" : "#d1d5db", padding: 0, lineHeight: 1,
                  }} title={locked ? "Unlock" : "Lock"}>{locked ? "🔒" : "🔓"}</button>
                </div>
              );
            })}
          </div>

          {/* Conflict warning */}
          {shuffleConflicts.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#b91c1c", display: "flex", alignItems: "center", gap: 4 }}>
              ⚠ {shuffleConflicts.map(([a, b]) => `${a} & ${b}`).join(" · ")} have a conflict
              {!wildCard && <span style={{ color: "#9ca3af" }}> — turn on Wild card to allow</span>}
            </div>
          )}
        </div>
      )}

      {/* Goal selector */}
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 7 }}>Goal</div>
        <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 12, padding: 4 }}>
          {[
            { id: "best-match", label: "Best match",      desc: "Highest WAT score" },
            { id: "reconnect",  label: "Reconnect",       desc: "Boost unseen / overdue" },
            { id: "reliable",   label: "Reliable turnout", desc: "Weight trust higher" },
            { id: "grow",       label: "Grow circle",     desc: "Boost new connections" },
          ].map(g => {
            const active = goal === g.id;
            return (
              <button key={g.id} onClick={() => setGoal(g.id)} style={{
                flex: 1, padding: "7px 4px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700,
                background: active ? "#fff" : "transparent",
                color: active ? "#111827" : "#9ca3af",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.12s",
              }}>
                <div>{g.label}</div>
                {active && <div style={{ fontSize: 9, fontWeight: 400, color: "#6b7280", marginTop: 1 }}>{g.desc}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* WAT key */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Key — all scores 0–100</div>
        {[
          ["W", "Willing", "activity interest × openness × energy", "40%", "#6d28d9"],
          ["A", "Able",    "schedule × logistics × distance",       "35%", "#0284c7"],
          ["T", "Trust",   "flake history + response velocity",     "25%", "#15803d"],
        ].map(([k, name, detail, weight, c]) => (
          <div key={k} style={{ fontSize: 10, color: "#9ca3af", marginBottom: 3, display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ color: c, fontWeight: 700, width: 10 }}>{k}</span>
            <span style={{ color: "#374151", fontWeight: 600 }}>{name}</span>
            <span>— {detail}</span>
            <span style={{ marginLeft: "auto", color: "#d1d5db", fontWeight: 700 }}>{weight}</span>
          </div>
        ))}
        <div style={{ marginTop: 5, fontSize: 10, color: "#d1d5db", borderTop: "1px solid #f3f4f6", paddingTop: 5 }}>
          Score = W×40 + A×35 + T×25, then adjusted for recency &amp; cooldown
        </div>
      </div>

      {/* Ranked list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {scored.map((f, idx) => {
          const inQueue     = cascade ? queue.findIndex(q => q.id === f.id) : -1;
          const queuePos    = inQueue + 1;
          const isInCascade = cascade && inQueue !== -1;
          const isSelected  = !cascade && (shuffleMode ? shuffleGroup.includes(f.id) : selected.has(f.id));
          const lh    = effectiveLastHang(f, events);
          const badge = recencyBadge(f.targetFreqDays, lh);
          const st    = flakeStats(f.id, events);

          const selectionIds = cascade ? queue.map(q => q.id) : [...selected];
          const conflictNames = selectionIds
            .filter(id => id !== f.id && (
              (f.conflicts ?? []).includes(id) ||
              (scored.find(s => s.id === id)?.conflicts ?? []).includes(f.id)
            ))
            .map(id => scored.find(s => s.id === id)?.name)
            .filter(Boolean);

          const synergies = selectionIds
            .filter(id => id !== f.id)
            .map(id => ({ id, name: scored.find(s => s.id === id)?.name, syn: synergyBetween(f.id, id, events) }))
            .filter(s => s.syn?.score != null && s.syn.score >= 3.5)
            .sort((a, b) => b.syn.score - a.syn.score);
          const bestSynergy = synergies[0];

          const cardOpacity = f.isBusyThisWeek ? 0.4 : f.inCooldown ? (cascade ? 0.3 : 0.5) : cascade && !isInCascade ? 0.3 : 1;
          const cardBg     = cascade && queuePos === 1 ? "#f0fdf4" : cascade && isInCascade ? "#fafafa" : isSelected ? "#f5f3ff" : "#fff";
          const cardBorder = cascade && queuePos === 1 ? "1.5px solid #16a34a" : cascade && isInCascade ? "1px solid #e5e7eb" : isSelected ? "1.5px solid #6d28d9" : "1px solid #e5e7eb";

          return (
            <div key={f.id}
              onClick={() => !cascade && !f.isBusyThisWeek && toggle(f.id)}
              style={{ background: cardBg, borderRadius: 14, border: cardBorder, padding: "10px 12px", opacity: cardOpacity, cursor: cascade ? "default" : f.isBusyThisWeek ? "default" : "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {cascade ? (
                  <div style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                    background: isInCascade ? (queuePos === 1 ? "#16a34a" : "#4f46e5") : "#f3f4f6",
                    color: isInCascade ? "#fff" : "#9ca3af",
                  }}>{isInCascade ? (queuePos === 1 ? "→" : queuePos) : "·"}</div>
                ) : (
                  <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: isSelected ? "none" : "1.5px solid #d1d5db", background: isSelected ? "#4f46e5" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isSelected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                  </div>
                )}

                <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", width: 16, textAlign: "center" }}>{idx + 1}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{f.name}</span>
                    {f.groups?.[0] && <Pill text={f.groups[0]} bg="#f0f9ff" c="#0369a1" />}
                    {cascade && isInCascade && <Pill text={queuePos === 1 ? "Invite first" : `Queue #${queuePos}`} bg={queuePos === 1 ? "#dcfce7" : "#eef2ff"} c={queuePos === 1 ? "#15803d" : "#4338ca"} />}
                    {!f.slotMatch && f.availSlots?.length > 0 && <Pill text="May not be free" bg="#fff7ed" c="#c2410c" />}
                    {f.distanceTier === "far" && <Pill text="Far" bg="#fff7ed" c="#c2410c" />}
                    {badge && <Pill text={badge.text} bg={badge.bg} c={badge.c} />}
                    {f.isBusyThisWeek && <Pill text="Busy" bg="#f3f4f6" c="#9ca3af" />}
                    {f.inCooldown && !f.isBusyThisWeek && <Pill text={`${f.daysUntilDue}d to go`} bg="#eff6ff" c="#2563eb" />}
                    {st?.flakeRate != null && st.flakeRate > 0.4 && <Pill text={`${Math.round(st.flakeRate * 100)}% flake`} bg="#fee2e2" c="#b91c1c" />}
                    {plusOneAllowed && f.comfortLvl === "needs-plus1" && <Pill text="+1 ↑ likely" bg="#f5f3ff" c="#6d28d9" />}
                    {plusOneAllowed && f.comfortLvl === "familiar"    && <Pill text="+1 ↑ helps"  bg="#f0fdf4" c="#15803d" />}
                    {!plusOneAllowed && f.comfortLvl === "needs-plus1" && <Pill text="wants +1"   bg="#fef3c7" c="#92400e" />}
                    {conflictNames.length > 0 && conflictNames.map(name => (
                      <Pill key={name} text={`Conflicts w/ ${name}`} bg="#fee2e2" c="#b91c1c" />
                    ))}
                    {bestSynergy && !conflictNames.length && (
                      <Pill text={`Good w/ ${bestSynergy.name} (${bestSynergy.syn.score}★)`} bg="#dcfce7" c="#15803d" />
                    )}
                  </div>
                  {f.email && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{f.email}</div>}
                </div>

                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <WATBars willing={f.willing} able={f.able} trust={f.trust} slotMatch={f.slotMatch} inCooldown={f.inCooldown} energyMod={f.energyMod} />
                  <ScoreDisplay
                    score={f.score} willing={f.willing} able={f.able} trust={f.trust}
                    inCooldown={f.inCooldown} daysUntilDue={f.daysUntilDue}
                    isBusyThisWeek={f.isBusyThisWeek}
                    targetFreqDays={f.targetFreqDays} ds={daysSince(lh)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compose + Action */}
      {(cascade ? queue.length > 0 : shuffleMode ? shuffleGroup.length > 0 : selected.size > 0) && (
        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Your message</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={`Hey! Want to ${actLabel?.toLowerCase() ?? "hang"} on ${new Date(effectiveDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}?`}
              rows={3}
              style={{
                width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 12, padding: "10px 12px",
                fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                resize: "vertical", color: "#111827", background: "#fff", lineHeight: 1.5,
              }}
              onFocus={e => { e.target.style.borderColor = "#4f46e5"; }}
              onBlur={e => { e.target.style.borderColor = "#e5e7eb"; }}
            />
            {!message.trim() && (
              <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 3 }}>Write a message — nothing gets sent without one</div>
            )}
          </div>

          {cascade ? (
            <>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8, textAlign: "center" }}>
                Will invite {queue[0]?.name} first · {queue.length - 1} queued · target {maxCap} total
              </div>
              {queue.some((a, i) => queue.some((b, j) => j > i && (
                (a.conflicts ?? []).includes(b.id) || (b.conflicts ?? []).includes(a.id)
              ))) && (
                <div style={{ fontSize: 11, color: "#b91c1c", background: "#fee2e2", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
                  Conflict in queue — some invitees may not get along if both say yes.
                </div>
              )}
              <button onClick={createCascade} disabled={!message.trim()} style={{
                width: "100%", padding: "12px", borderRadius: 14, border: "none",
                background: message.trim() ? "#4f46e5" : "#e5e7eb",
                color: message.trim() ? "#fff" : "#9ca3af",
                fontWeight: 700, fontSize: 14, cursor: message.trim() ? "pointer" : "default", fontFamily: "inherit",
              }}>Start cascade — invite {queue[0]?.name} now →</button>
            </>
          ) : (
            <button onClick={createNormal} disabled={!message.trim()} style={{
              width: "100%", padding: "12px", borderRadius: 14, border: "none",
              background: message.trim() ? "#4f46e5" : "#e5e7eb",
              color: message.trim() ? "#fff" : "#9ca3af",
              fontWeight: 700, fontSize: 14, cursor: message.trim() ? "pointer" : "default", fontFamily: "inherit",
            }}>Create "{actLabel}" hang with {selected.size} {selected.size === 1 ? "person" : "people"} →</button>
          )}
        </div>
      )}
    </div>
  );
}
