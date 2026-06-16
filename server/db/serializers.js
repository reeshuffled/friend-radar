// Converts between SQLite row format (snake_case, JSON strings) and
// the React app's camelCase Friend / Event / Invite shapes.
//
// Sensitive fields are encrypted/decrypted transparently via crypto.js.
// When DB_ENCRYPTION_KEY is unset, enc/dec are identity functions — no
// behaviour change for plaintext rows or existing tests.

import { encrypt as enc, decrypt as dec } from "./crypto.js";

// ── Friends ──────────────────────────────────────────────────────────────────

export function friendRowToShape(row) {
  return {
    id: row.id,
    name: row.name,
    email: dec(row.email),
    contact: dec(row.contact),
    notes: dec(row.notes),
    status: row.status,
    groups: JSON.parse(dec(row.groups_json)),
    tags: JSON.parse(dec(row.tags_json ?? "[]")),
    wantAround: row.want_around === "skip" ? "skip" : "active",
    busyUntil: row.busy_until ?? null,
    reliability: row.reliability,
    responsiveness: row.responsiveness,
    vibe: row.vibe,
    openness: row.openness,
    logistics: row.logistics,
    interests: JSON.parse(dec(row.interests_json)),
    availSlots: JSON.parse(dec(row.avail_slots_json)),
    targetFreqDays: row.target_freq_days,
    noticePreference: row.notice_preference,
    distanceTier: row.distance_tier,
    socialType: row.social_type,
    workDrain: row.work_drain,
    comfortLevel: row.comfort_level,
    lastHangDate: row.last_hang_date,
    homeLocation: dec(row.home_location),
    conflicts: JSON.parse(dec(row.conflicts_json ?? "[]")),
    synergies: JSON.parse(dec(row.synergies_json ?? "[]")),
    phone: dec(row.phone),
    appleContactId: dec(row.apple_contact_id),
    preferredChannel: row.preferred_channel,
    rankings: JSON.parse(dec(row.rankings_json ?? "{}")),
    manualFlakes: row.manual_flakes ?? 0,
  };
}

export function friendShapeToRow(f) {
  return {
    id: f.id,
    name: f.name,
    email: enc(f.email ?? ""),
    contact: enc(f.contact ?? ""),
    notes: enc(f.notes ?? ""),
    status: f.status ?? "Friend",
    groups_json: enc(JSON.stringify(f.groups ?? [])),
    tags_json: enc(JSON.stringify(f.tags ?? [])),
    want_around: f.wantAround ?? "active",
    busy_until: f.busyUntil ?? null,
    reliability: f.reliability ?? 3,
    responsiveness: f.responsiveness ?? 3,
    vibe: f.vibe ?? 3,
    openness: f.openness ?? 3,
    logistics: f.logistics ?? 3,
    interests_json: enc(JSON.stringify(f.interests ?? {})),
    avail_slots_json: enc(JSON.stringify(f.availSlots ?? [])),
    target_freq_days: f.targetFreqDays ?? null,
    notice_preference: f.noticePreference ?? "few-days",
    distance_tier: f.distanceTier ?? "nearby",
    social_type: f.socialType ?? "ambivert",
    work_drain: f.workDrain ?? "medium",
    comfort_level: f.comfortLevel ?? "solo",
    last_hang_date: f.lastHangDate ?? null,
    home_location: enc(f.homeLocation ?? null),
    conflicts_json: enc(JSON.stringify(f.conflicts ?? [])),
    synergies_json: enc(JSON.stringify(f.synergies ?? [])),
    phone: enc(f.phone ?? ""),
    apple_contact_id: enc(f.appleContactId ?? null),
    preferred_channel: f.preferredChannel ?? "imessage",
    rankings_json: enc(JSON.stringify(f.rankings ?? {})),
    manual_flakes: f.manualFlakes ?? 0,
    updated_at: Date.now(),
  };
}

// ── Events + Invites ──────────────────────────────────────────────────────────

export function eventRowToShape(row, inviteRows = []) {
  return {
    id: row.id,
    activityId: row.activity_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: dec(row.location),
    cascade: row.cascade === 1,
    maxCapacity: row.max_capacity,
    plusOneAllowed: row.plus_one_allowed === 1,
    soloAnchor: row.solo_anchor === 1,
    finalized: row.finalized === 1,
    rating: row.rating,
    notes: dec(row.notes),
    message: dec(row.message ?? ""),
    venueProximity: row.venue_proximity ?? "mine",
    gcalEventId: row.gcal_event_id,
    legs: row.legs_json ? JSON.parse(dec(row.legs_json)) : null,
    createdAt: row.created_at,
    invites: inviteRows.map(inviteRowToShape),
  };
}

export function eventShapeToRow(e) {
  return {
    id: e.id,
    activity_id: e.activityId,
    date: e.date,
    start_time: e.startTime,
    end_time: e.endTime,
    location: enc(e.location ?? ""),
    cascade: e.cascade ? 1 : 0,
    max_capacity: e.maxCapacity ?? null,
    plus_one_allowed: e.plusOneAllowed ? 1 : 0,
    solo_anchor: e.soloAnchor ? 1 : 0,
    finalized: e.finalized ? 1 : 0,
    rating: e.rating ?? null,
    notes: enc(e.notes ?? ""),
    message: enc(e.message ?? ""),
    venue_proximity: e.venueProximity ?? "mine",
    gcal_event_id: e.gcalEventId ?? null,
    legs_json: e.legs?.length ? enc(JSON.stringify(e.legs)) : null,
    created_at: e.createdAt,
  };
}

export function inviteRowToShape(row) {
  return {
    friendId: row.friend_id,
    response: row.response,
    showed: row.showed === null ? null : row.showed === 1,
    inviteStatus: row.invite_status,
    queuePosition: row.queue_position,
    inviteSentAt: row.invite_sent_at,
    inviteChannel: row.invite_channel,
    attendingLegs: row.attending_legs_json
      ? JSON.parse(dec(row.attending_legs_json))
      : null,
  };
}

export function inviteShapeToRow(eventId, inv, position) {
  return {
    event_id: eventId,
    friend_id: inv.friendId,
    response: inv.response ?? "pending",
    showed: inv.showed === null ? null : inv.showed ? 1 : 0,
    invite_status: inv.inviteStatus ?? "invited",
    queue_position: inv.queuePosition ?? position,
    invite_sent_at: inv.inviteSentAt ?? null,
    invite_channel: inv.inviteChannel ?? "imessage",
    attending_legs_json: inv.attendingLegs?.length
      ? enc(JSON.stringify(inv.attendingLegs))
      : null,
  };
}
