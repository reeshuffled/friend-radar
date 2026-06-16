import {
  VENUE_DIST_MULTS,
  SOCIAL_ENERGY_COSTS,
  NOTICE_PREFS,
  ACTIVITY_LOCATION_TYPE,
} from "./constants.js";
import { flakeStats, effectiveLastHang, daysSince } from "./helpers.js";

// 0–1 normalized value for an attribute; prefers ranking rating (0–10), falls back to legacy 1–5 slider.
function attrNorm(friend, attr, legacyDefault = 3) {
  const r = friend.rankings?.[attr];
  return typeof r === "number" ? r / 10 : (friend[attr] ?? legacyDefault) / 5;
}

export function scoreFor(
  friend,
  actId,
  eventSlot,
  events,
  allowsPlusOne = false,
  eventDate = null,
  activities = [],
  venueProximity = "mine",
  calBusy = null
) {
  const actMap = Object.fromEntries(activities.map((a) => [a.id, a]));
  const st = flakeStats(friend.id, events);
  const lh = effectiveLastHang(friend, events);

  // WILLING (0–10): interest × openness × vibe
  const interest = friend.interests?.[actId] ?? 1;
  let willing =
    (interest / 5) * 5 + attrNorm(friend, "openness") * 2.5 + attrNorm(friend, "vibe") * 2.5;

  // +1 comfort modifier
  const comfortLvl = friend.comfortLevel ?? "solo";
  let plusBoost = 1.0;
  if (allowsPlusOne) {
    if (comfortLvl === "needs-plus1") plusBoost = 1.35;
    if (comfortLvl === "familiar") plusBoost = 1.15;
  }

  // Location preference modifier: if event type mismatches friend's preference, reduce Willing
  const actLocType = actMap[actId]?.locationType ?? ACTIVITY_LOCATION_TYPE[actId] ?? "either";
  const friendLocPref = friend.locationPref ?? "either";
  let locationMod = 1.0;
  if (actLocType !== "either" && friendLocPref !== "either" && actLocType !== friendLocPref) {
    locationMod = 0.65;
  }

  // Social energy modifier
  const isWeekdayTime = eventSlot?.startsWith("weekday");
  const drainRate = { low: 0.1, medium: 0.25, high: 0.42 }[friend.workDrain ?? "medium"] ?? 0.25;
  const socialMod =
    { introvert: -0.12, ambivert: 0, extrovert: 0.1 }[friend.socialType ?? "ambivert"] ?? 0;
  const battery = Math.max(0.15, 1 - (isWeekdayTime ? drainRate + socialMod : 0));
  const eventCost = actMap[actId]?.energyCost ?? SOCIAL_ENERGY_COSTS[actId] ?? 0.35;
  const energyMod = eventCost <= battery ? 1.0 : Math.max(0.45, battery / eventCost);

  willing = Math.min(10, willing * plusBoost * energyMod * locationMod);

  // ABLE (0–10): schedule match × logistics × distance
  // calBusy overrides the manual availSlots check when real calendar data is available
  const hasAvail = friend.availSlots?.length > 0;
  const slotMatch =
    calBusy !== null ? !calBusy : !hasAvail || friend.availSlots.includes(eventSlot);
  const multTable = VENUE_DIST_MULTS[venueProximity] ?? VENUE_DIST_MULTS.mine;
  const distMult = multTable[friend.distanceTier ?? "nearby"] ?? 0.85;
  let able = (slotMatch ? 1.0 : 0.3) * attrNorm(friend, "logistics") * distMult * 10;

  // Notice modifier
  if (eventDate) {
    const noticeDays = Math.max(0, (new Date(eventDate + "T12:00:00") - Date.now()) / 86400000);
    const needsDays =
      NOTICE_PREFS.find((n) => n.id === (friend.noticePreference ?? "few-days"))?.days ?? 3;
    const noticeMod = noticeDays >= needsDays ? 1.0 : Math.max(0.25, noticeDays / (needsDays + 1));
    able = Math.min(10, able * noticeMod);
  }

  // TRUST (0–10): from history if ≥2 data points, else manual sliders
  // Response velocity: fast responders with clear yes/no get a Trust bonus
  let trust;
  if (st && st.total >= 2) {
    trust =
      (1 - (st.flakeRate ?? 0)) * 5 + (1 - (st.ghostRate ?? 0)) * 2.5 + (st.yesRate ?? 0.5) * 2.5;

    // Response velocity bonus: average responseVelocityScore if available
    const velocityBonus = computeVelocityBonus(friend.id, events);
    if (velocityBonus !== null) {
      trust = trust * 0.8 + velocityBonus * 10 * 0.2;
    }
  } else {
    trust = attrNorm(friend, "reliability") * 6 + attrNorm(friend, "responsiveness") * 4;
  }

  // Flake penalty: event-derived flakes + signed manual adjustment → bounded Trust reduction
  const derivedFlakes = st?.flaked ?? 0;
  const effectiveFlakes = Math.max(0, derivedFlakes + (friend.manualFlakes ?? 0));
  const flakePenalty = Math.max(0.3, 1 - 0.12 * effectiveFlakes);
  trust *= flakePenalty;

  let raw = willing * 0.4 + able * 0.35 + trust * 0.25;

  // Recency: overdue → additive boost; in cooldown → multiplicative penalty
  let inCooldown = false;
  let daysUntilDue = null;
  if (friend.targetFreqDays) {
    const ds = daysSince(lh);
    if (ds !== null) {
      if (ds >= friend.targetFreqDays) {
        raw += Math.min(2, ((ds - friend.targetFreqDays) / friend.targetFreqDays) * 2);
      } else {
        inCooldown = true;
        daysUntilDue = friend.targetFreqDays - ds;
        raw *= Math.max(0.15, ds / friend.targetFreqDays);
      }
    } else {
      raw += 0.8; // never hung: slight boost
    }
  }
  const isBusyThisWeek = !!(
    friend.busyUntil &&
    new Date(friend.busyUntil) >= new Date(new Date().toISOString().split("T")[0])
  );
  if (isBusyThisWeek) raw *= 0.15;

  return {
    score: Math.max(0, Math.min(100, Math.round(raw * 10))),
    willing: Math.round(willing * 10),
    able: Math.round(Math.min(100, able * 10)),
    trust: Math.round(trust * 10),
    slotMatch,
    distMult,
    plusBoost,
    comfortLvl,
    battery: Math.round(battery * 100),
    energyMod,
    locationMod,
    inCooldown,
    daysUntilDue,
    isBusyThisWeek,
    effectiveFlakes,
    flakePenalty,
  };
}

// Compute a 0–1 velocity score from invite history.
// Returns null if no velocity data exists yet.
function computeVelocityBonus(friendId, events) {
  const dataPoints = [];
  for (const e of events) {
    for (const inv of e.invites) {
      if (inv.friendId !== friendId) continue;
      if (!inv.inviteSentAt || !inv.respondedAt) continue;
      const advanceNoticeMs = new Date(e.date + "T12:00:00") - inv.inviteSentAt;
      const responseMs = inv.respondedAt - inv.inviteSentAt;
      const advanceNoticeDays = advanceNoticeMs / 86400000;
      const responseHours = responseMs / 3600000;

      // velocity: 1 = instant response, 0 = took all available time
      const window = Math.max(1, advanceNoticeDays * 24);
      const velocity = Math.max(0, 1 - responseHours / window);

      // commitment: yes=1, maybe=0.5, no=0 (no penalizes less — declining is clear)
      const commitment =
        inv.response === "yes"
          ? 1.0
          : inv.response === "maybe"
            ? 0.5
            : inv.response === "no"
              ? 0.7
              : 0;

      dataPoints.push(velocity * 0.6 + commitment * 0.4);
    }
  }
  if (!dataPoints.length) return null;
  return dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
}
