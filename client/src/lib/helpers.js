export const todayStr = () => new Date().toISOString().split("T")[0];

export const daysSince = d =>
  d ? Math.floor((Date.now() - new Date(d + "T12:00:00Z").getTime()) / 86400000) : null;

export function getEventSlot(dateStr, startTime) {
  if (!dateStr) return "weekday-evening";
  const d = new Date(dateStr + "T12:00:00");
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  let isEvening = true;
  if (startTime) {
    const hour = parseInt(startTime.split(":")[0], 10);
    isEvening = hour >= 17;
  }
  return `${isWeekend ? "weekend" : "weekday"}-${isEvening ? "evening" : "day"}`;
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function lastHangFromEvents(friendId, events) {
  return events
    .filter(e => e.finalized && e.invites.some(i => i.friendId === friendId && i.showed))
    .map(e => e.date).sort().pop() || null;
}

export function effectiveLastHang(friend, events) {
  const fromEvts = lastHangFromEvents(friend.id, events);
  const manual   = friend.lastHangDate;
  if (!fromEvts && !manual) return null;
  if (!fromEvts) return manual;
  if (!manual)   return fromEvts;
  return fromEvts > manual ? fromEvts : manual;
}

export function flakeStats(friendId, events) {
  const invites = events.flatMap(e =>
    e.invites
      .filter(i => i.friendId === friendId && i.inviteStatus !== "queued")
      .map(i => ({ ...i, finalized: e.finalized }))
  );
  if (!invites.length) return null;
  const yeses   = invites.filter(i => i.response === "yes");
  const ghosted = invites.filter(i => i.response === "ghosted");
  const finYes  = yeses.filter(i => i.finalized && i.showed !== null);
  const showed  = finYes.filter(i => i.showed).length;
  const flaked  = finYes.filter(i => !i.showed).length;
  return {
    total:      invites.length,
    yesRate:    invites.length ? yeses.length  / invites.length : null,
    flakeRate:  finYes.length  ? flaked        / finYes.length  : null,
    ghostRate:  invites.length ? ghosted.length / invites.length : null,
    showed, flaked, ghostedN: ghosted.length, finYesTotal: finYes.length,
    pending: invites.filter(i => i.response === "pending").length,
  };
}

export function recencyBadge(targetFreqDays, lastHang) {
  const ds = daysSince(lastHang);
  if (!targetFreqDays) {
    if (ds === null) return { text: "Never hung",    c: "#6d28d9", bg: "#f5f3ff" };
    if (ds >= 90)    return { text: `${ds}d since last hang`, c: "#6b7280", bg: "#f3f4f6" };
    return null;
  }
  if (ds === null)  return { text: "Never hung",        c: "#6d28d9", bg: "#f5f3ff" };
  const ov = ds - targetFreqDays;
  if (ov >= 14)     return { text: `${ov}d overdue`,    c: "#b45309", bg: "#fef3c7" };
  if (ov >= 0)      return { text: "Due now",            c: "#d97706", bg: "#fff7ed" };
  if (ov >= -3)     return { text: "Due soon",           c: "#059669", bg: "#ecfdf5" };
  return { text: `Saw ${ds}d ago · ${-ov}d left`, c: "#2563eb", bg: "#eff6ff" };
}

export function synergyBetween(friendAId, friendBId, events) {
  const coAttended = events.filter(e =>
    e.finalized &&
    e.invites.some(i => i.friendId === friendAId && i.showed) &&
    e.invites.some(i => i.friendId === friendBId && i.showed)
  );
  if (!coAttended.length) return null;
  const rated = coAttended.filter(e => e.rating != null);
  if (!rated.length) return { score: null, count: coAttended.length };
  const avg = rated.reduce((s, e) => s + e.rating, 0) / rated.length;
  return { score: Math.round(avg * 10) / 10, count: coAttended.length };
}

export function isInCooldown(friend, events) {
  if (!friend.targetFreqDays) return { inCooldown: false, daysUntilDue: null };
  const lh = effectiveLastHang(friend, events);
  if (!lh) return { inCooldown: false, daysUntilDue: null };
  const ds = daysSince(lh);
  if (ds === null || ds >= friend.targetFreqDays) return { inCooldown: false, daysUntilDue: null };
  return { inCooldown: true, daysUntilDue: friend.targetFreqDays - ds };
}
