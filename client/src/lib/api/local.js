/**
 * Local (IndexedDB) backend — no server required.
 * Implements the same api.* surface as server.js, returning identical camelCase
 * shapes so the rest of the app is unaware of the difference.
 *
 * Server-only features (calendar, invites, contacts) throw a NoServerError so
 * callers can swallow them the same way they swallow network errors.
 */
import { getLocalDb, seedActivitiesIfEmpty, BUILTIN_ACTIVITIES } from "./db.js";

export class NoServerError extends Error {
  constructor(feature) {
    super(`${feature} requires a server (local mode)`);
    this.noServer = true;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Advance a friend's lastHangDate only forward, never backward. */
function advanceHangDate(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

// ─── friends ────────────────────────────────────────────────────────────────

async function getFriends() {
  const db = await getLocalDb();
  return db.getAll("friends");
}

async function upsertFriend(f) {
  const db = await getLocalDb();
  const now = Date.now();
  const existing = await db.get("friends", f.id);

  // Last-write-wins: only replace if incoming updatedAt is >= existing.
  // If no updatedAt provided, always write (first save).
  if (existing && f.updatedAt != null && f.updatedAt < existing.updatedAt) {
    return existing;
  }

  const record = { ...f, updatedAt: now };
  await db.put("friends", record);
  return record;
}

async function deleteFriend(id) {
  const db = await getLocalDb();
  await db.delete("friends", id);
  // Also scrub this friend from all event invites
  const events = await db.getAll("events");
  const tx = db.transaction("events", "readwrite");
  for (const ev of events) {
    if (ev.invites?.some(i => i.friendId === id)) {
      tx.store.put({ ...ev, invites: ev.invites.filter(i => i.friendId !== id) });
    }
  }
  await tx.done;
  return {};
}

// ─── events ─────────────────────────────────────────────────────────────────

async function getEvents() {
  const db = await getLocalDb();
  return db.getAll("events");
}

async function createEvent(event) {
  const db = await getLocalDb();
  // Assign queue_position by invite array order (mirrors server/db/queries.js:createEvent)
  const record = {
    ...event,
    invites: (event.invites ?? []).map((inv, i) => ({
      ...inv,
      queuePosition: i + 1,
    })),
  };
  await db.put("events", record);
  return { event: record };
}

async function updateEvent(id, data) {
  const db = await getLocalDb();
  const existing = (await db.get("events", id)) ?? { id };
  const updated  = { ...existing, ...data, id };
  await db.put("events", updated);
  return updated;
}

async function advanceCascade(id) {
  const db = await getLocalDb();
  const ev = await db.get("events", id);
  if (!ev) return {};
  const nextQueued = ev.invites?.find(i => i.inviteStatus === "queued");
  if (!nextQueued) return { event: ev };
  const updated = {
    ...ev,
    invites: ev.invites.map(i =>
      i.friendId === nextQueued.friendId
        ? { ...i, inviteStatus: "invited", inviteSentAt: Date.now() }
        : i
    ),
  };
  await db.put("events", updated);
  return { event: updated };
}

async function recordResponse(eventId, friendId, response) {
  const db = await getLocalDb();
  const ev = await db.get("events", eventId);
  if (!ev) return {};
  const updated = {
    ...ev,
    invites: ev.invites.map(i =>
      i.friendId === friendId ? { ...i, response } : i
    ),
  };
  await db.put("events", updated);
  return updated;
}

async function updateInviteAttendingLegs(eventId, friendId, attendingLegs) {
  const db = await getLocalDb();
  const ev = await db.get("events", eventId);
  if (!ev) return {};
  const updated = {
    ...ev,
    invites: ev.invites.map(i =>
      i.friendId === friendId ? { ...i, attendingLegs } : i
    ),
  };
  await db.put("events", updated);
  return updated;
}

// ─── activities ─────────────────────────────────────────────────────────────

async function getActivities() {
  const db = await getLocalDb();
  await seedActivitiesIfEmpty(db);
  return db.getAll("activities");
}

async function createActivity({ label }) {
  const db  = await getLocalDb();
  const all = await db.getAll("activities");
  const id  = slugify(label);
  const maxSort = all.reduce((m, a) => Math.max(m, a.sortOrder ?? 0), 0);
  const act = {
    id,
    label,
    energyCost:   0.35,
    locationType: "either",
    sortOrder:    maxSort + 1,
    isBuiltin:    false,
  };
  await db.put("activities", act);
  return act;
}

async function updateActivity(act) {
  const db = await getLocalDb();
  const existing = await db.get("activities", act.id);
  // Preserve isBuiltin flag — never overwrite (mirrors queries.js:upsertActivity)
  const updated = { ...existing, ...act, isBuiltin: existing?.isBuiltin ?? false };
  await db.put("activities", updated);
  return updated;
}

async function deleteActivity(id) {
  const db = await getLocalDb();
  const existing = await db.get("activities", id);
  // Guard: built-ins cannot be deleted (mirrors queries.js:deleteActivity)
  if (existing?.isBuiltin) return {};
  await db.delete("activities", id);
  return {};
}

// ─── calendar hang (pure CRUD — works locally) ────────────────────────────

async function confirmCalendarHang(friendId, date) {
  const db  = await getLocalDb();
  const f   = await db.get("friends", friendId);
  if (!f) throw new Error(`Friend ${friendId} not found`);
  const updated = { ...f, lastHangDate: advanceHangDate(f.lastHangDate, date), updatedAt: Date.now() };
  await db.put("friends", updated);
  return updated;
}

// ─── data portability ────────────────────────────────────────────────────────

async function exportData() {
  const db = await getLocalDb();
  const [friends, events, activities] = await Promise.all([
    db.getAll("friends"),
    db.getAll("events"),
    db.getAll("activities"),
  ]);
  return { version: 1, friends, events, activities };
}

async function importData(json) {
  if (!json || json.version !== 1) throw new Error("Invalid backup format (expected version 1)");
  const db = await getLocalDb();
  const tx = db.transaction(["friends", "events", "activities"], "readwrite");

  for (const f of json.friends ?? [])     tx.objectStore("friends").put(f);
  for (const e of json.events ?? [])      tx.objectStore("events").put(e);
  for (const a of json.activities ?? [])  tx.objectStore("activities").put(a);

  // Always ensure built-ins exist after import
  for (const builtin of BUILTIN_ACTIVITIES) {
    const existing = await tx.objectStore("activities").get(builtin.id);
    if (!existing) tx.objectStore("activities").put(builtin);
  }

  await tx.done;
}

// ─── server-only stubs ───────────────────────────────────────────────────────

function noServer(feature) {
  return () => Promise.reject(new NoServerError(feature));
}

// ─── export ──────────────────────────────────────────────────────────────────

export const localApi = {
  getFriends,
  upsertFriend,
  deleteFriend,

  getEvents,
  createEvent,
  updateEvent,
  advanceCascade,
  recordResponse,
  updateInviteAttendingLegs,

  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,

  confirmCalendarHang,

  exportData,
  importData,

  // Server-only — throw NoServerError so callers can swallow or gate
  checkFreeBusy:       noServer("Google Calendar freebusy"),
  syncAppleContacts:   noServer("Apple Contacts sync"),
  syncCalendarHangs:   noServer("Google Calendar hang sync"),
  importCalendarHangs: noServer("Google Calendar hang import"),
};
