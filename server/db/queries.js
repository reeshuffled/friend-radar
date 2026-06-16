// Prepared-statement wrappers — all DB access goes through here.

import { getDb } from "./db.js";
import {
  friendShapeToRow,
  friendRowToShape,
  eventShapeToRow,
  eventRowToShape,
  inviteShapeToRow,
} from "./serializers.js";

// node:sqlite returns null-prototype objects; spread into a plain object for serializer compat.
const plain = (row) => (row ? Object.assign({}, row) : null);

// ── Friends ───────────────────────────────────────────────────────────────────

export function getAllFriends() {
  return getDb()
    .prepare("SELECT * FROM friends ORDER BY name")
    .all()
    .map((r) => friendRowToShape(plain(r)));
}

export function getFriend(id) {
  const row = plain(getDb().prepare("SELECT * FROM friends WHERE id = ?").get(id));
  return row ? friendRowToShape(row) : null;
}

export function upsertFriend(friend) {
  const db = getDb();
  const row = friendShapeToRow(friend);
  db.prepare(
    `
    INSERT INTO friends (
      id, name, email, contact, notes, status, groups_json, tags_json, want_around,
      busy_until, reliability, responsiveness, vibe, openness, logistics,
      interests_json, avail_slots_json, target_freq_days, notice_preference,
      distance_tier, social_type, work_drain, comfort_level, last_hang_date,
      home_location, conflicts_json, synergies_json, phone, apple_contact_id,
      preferred_channel, rankings_json, manual_flakes, updated_at
    ) VALUES (
      @id, @name, @email, @contact, @notes, @status, @groups_json, @tags_json, @want_around,
      @busy_until, @reliability, @responsiveness, @vibe, @openness, @logistics,
      @interests_json, @avail_slots_json, @target_freq_days, @notice_preference,
      @distance_tier, @social_type, @work_drain, @comfort_level, @last_hang_date,
      @home_location, @conflicts_json, @synergies_json, @phone, @apple_contact_id,
      @preferred_channel, @rankings_json, @manual_flakes, @updated_at
    ) ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, email = excluded.email, contact = excluded.contact,
      notes = excluded.notes, status = excluded.status, groups_json = excluded.groups_json,
      tags_json = excluded.tags_json,
      want_around = excluded.want_around, busy_until = excluded.busy_until,
      reliability = excluded.reliability, responsiveness = excluded.responsiveness,
      vibe = excluded.vibe, openness = excluded.openness, logistics = excluded.logistics,
      interests_json = excluded.interests_json, avail_slots_json = excluded.avail_slots_json,
      target_freq_days = excluded.target_freq_days, notice_preference = excluded.notice_preference,
      distance_tier = excluded.distance_tier, social_type = excluded.social_type,
      work_drain = excluded.work_drain, comfort_level = excluded.comfort_level,
      last_hang_date = excluded.last_hang_date, home_location = excluded.home_location,
      conflicts_json = excluded.conflicts_json, synergies_json = excluded.synergies_json,
      phone = excluded.phone, apple_contact_id = excluded.apple_contact_id,
      preferred_channel = excluded.preferred_channel,
      rankings_json = excluded.rankings_json, manual_flakes = excluded.manual_flakes,
      updated_at = excluded.updated_at
  `
  ).run(row);
}

export function deleteFriend(id) {
  getDb().prepare("DELETE FROM friends WHERE id = ?").run(id);
}

// ── Events + Invites ──────────────────────────────────────────────────────────

function loadInvites(db, eventId) {
  return db
    .prepare("SELECT * FROM invites WHERE event_id = ? ORDER BY queue_position")
    .all(eventId)
    .map((r) => plain(r));
}

export function getAllEvents() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM events ORDER BY date DESC")
    .all()
    .map((r) => {
      const row = plain(r);
      return eventRowToShape(row, loadInvites(db, row.id));
    });
}

export function getEvent(id) {
  const db = getDb();
  const row = plain(db.prepare("SELECT * FROM events WHERE id = ?").get(id));
  return row ? eventRowToShape(row, loadInvites(db, id)) : null;
}

export function getActiveCascadeEvents() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM events WHERE finalized = 0 AND cascade = 1")
    .all()
    .map((r) => {
      const row = plain(r);
      return eventRowToShape(row, loadInvites(db, row.id));
    });
}

export function createEvent(event) {
  const db = getDb();
  const row = eventShapeToRow(event);
  const invites = event.invites ?? [];

  const insertEventStmt = db.prepare(`
    INSERT OR REPLACE INTO events (
      id, activity_id, date, start_time, end_time, location, cascade,
      max_capacity, plus_one_allowed, solo_anchor, finalized, rating, notes,
      message, venue_proximity, gcal_event_id, legs_json, created_at
    ) VALUES (
      @id, @activity_id, @date, @start_time, @end_time, @location, @cascade,
      @max_capacity, @plus_one_allowed, @solo_anchor, @finalized, @rating, @notes,
      @message, @venue_proximity, @gcal_event_id, @legs_json, @created_at
    )
  `);

  const insertInviteStmt = db.prepare(`
    INSERT OR REPLACE INTO invites (
      event_id, friend_id, response, showed, invite_status,
      queue_position, invite_sent_at, invite_channel, attending_legs_json
    ) VALUES (
      @event_id, @friend_id, @response, @showed, @invite_status,
      @queue_position, @invite_sent_at, @invite_channel, @attending_legs_json
    )
  `);

  db.exec("BEGIN");
  try {
    insertEventStmt.run(row);
    invites.forEach((inv, i) => insertInviteStmt.run(inviteShapeToRow(event.id, inv, i + 1)));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function updateEventFields(id, fields) {
  const db = getDb();
  const cols = Object.keys(fields)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  db.prepare(`UPDATE events SET ${cols} WHERE id = @id`).run({ ...fields, id });
}

export function updateInviteResponse(eventId, friendId, response) {
  getDb()
    .prepare("UPDATE invites SET response = ? WHERE event_id = ? AND friend_id = ?")
    .run(response, eventId, friendId);
}

export function updateInviteStatus(eventId, friendId, status, sentAt = null) {
  getDb()
    .prepare(
      "UPDATE invites SET invite_status = ?, invite_sent_at = ? WHERE event_id = ? AND friend_id = ?"
    )
    .run(status, sentAt, eventId, friendId);
}

export function updateInviteShowed(eventId, friendId, showed) {
  getDb()
    .prepare("UPDATE invites SET showed = ? WHERE event_id = ? AND friend_id = ?")
    .run(showed === null ? null : showed ? 1 : 0, eventId, friendId);
}

// ── Activities ────────────────────────────────────────────────────────────────

function actRowToShape(row) {
  return {
    id: row.id,
    label: row.label,
    energyCost: row.energy_cost,
    locationType: row.location_type,
    sortOrder: row.sort_order,
    isBuiltin: row.is_builtin === 1,
  };
}

export function getAllActivities() {
  return getDb()
    .prepare("SELECT * FROM activities ORDER BY sort_order, label")
    .all()
    .map((r) => actRowToShape(plain(r)));
}

export function upsertActivity({
  id,
  label,
  energyCost = 0.35,
  locationType = "either",
  sortOrder = 99,
  isBuiltin = false,
}) {
  getDb()
    .prepare(
      `
    INSERT INTO activities (id, label, energy_cost, location_type, sort_order, is_builtin)
    VALUES (@id, @label, @energyCost, @locationType, @sortOrder, @isBuiltin)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      energy_cost = excluded.energy_cost,
      location_type = excluded.location_type,
      sort_order = excluded.sort_order
  `
    )
    .run({ id, label, energyCost, locationType, sortOrder, isBuiltin: isBuiltin ? 1 : 0 });
  return getAllActivities().find((a) => a.id === id);
}

export function deleteActivity(id) {
  getDb().prepare("DELETE FROM activities WHERE id = ? AND is_builtin = 0").run(id);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getAuth() {
  return plain(getDb().prepare("SELECT * FROM auth WHERE user_id = 1").get()) ?? null;
}

export function saveAuth({ accessToken, refreshToken, tokenExpiry, gmailAddress, gcalId }) {
  getDb()
    .prepare(
      `
    INSERT INTO auth (user_id, access_token, refresh_token, token_expiry, gmail_address, gcal_id)
    VALUES (1, @accessToken, @refreshToken, @tokenExpiry, @gmailAddress, @gcalId)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expiry  = excluded.token_expiry,
      gmail_address = excluded.gmail_address,
      gcal_id       = excluded.gcal_id
  `
    )
    .run({ accessToken, refreshToken, tokenExpiry, gmailAddress, gcalId });
}

// ── Calendar hang sync ────────────────────────────────────────────────────────

export function getFriendEmailMap() {
  const rows = getDb().prepare("SELECT id, email FROM friends WHERE email != ''").all();
  const map = {};
  for (const r of rows) {
    const row = plain(r);
    if (row.email) map[row.email.toLowerCase()] = row.id;
  }
  return map;
}

export function getCalSyncToken() {
  const row = plain(getDb().prepare("SELECT cal_sync_token FROM auth WHERE user_id = 1").get());
  return row?.cal_sync_token ?? null;
}

export function saveCalSyncToken(token) {
  getDb().prepare("UPDATE auth SET cal_sync_token = ? WHERE user_id = 1").run(token);
}

export function bulkUpdateLastHangDate(updates) {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE friends SET last_hang_date = @date WHERE id = @friendId AND (last_hang_date IS NULL OR last_hang_date < @date)"
  );
  db.exec("BEGIN");
  try {
    updates.forEach((u) => stmt.run(u));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getFriendLastHangDatesByIds(ids) {
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT id, last_hang_date FROM friends WHERE id IN (${placeholders})`)
    .all(...ids);
  const result = {};
  for (const r of rows) {
    const row = plain(r);
    result[row.id] = row.last_hang_date ?? null;
  }
  return result;
}

// ── Bulk sync (React app → server on first connect) ───────────────────────────

export function bulkUpsertFriends(friends) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO friends (
      id, name, email, contact, notes, status, groups_json, tags_json, want_around,
      busy_until, reliability, responsiveness, vibe, openness, logistics,
      interests_json, avail_slots_json, target_freq_days, notice_preference,
      distance_tier, social_type, work_drain, comfort_level, last_hang_date,
      home_location, conflicts_json, synergies_json, phone, apple_contact_id,
      preferred_channel, rankings_json, manual_flakes, updated_at
    ) VALUES (
      @id, @name, @email, @contact, @notes, @status, @groups_json, @tags_json, @want_around,
      @busy_until, @reliability, @responsiveness, @vibe, @openness, @logistics,
      @interests_json, @avail_slots_json, @target_freq_days, @notice_preference,
      @distance_tier, @social_type, @work_drain, @comfort_level, @last_hang_date,
      @home_location, @conflicts_json, @synergies_json, @phone, @apple_contact_id,
      @preferred_channel, @rankings_json, @manual_flakes, @updated_at
    ) ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, email = excluded.email, contact = excluded.contact,
      notes = excluded.notes, status = excluded.status, groups_json = excluded.groups_json,
      tags_json = excluded.tags_json,
      want_around = excluded.want_around, busy_until = excluded.busy_until,
      reliability = excluded.reliability, responsiveness = excluded.responsiveness,
      vibe = excluded.vibe, openness = excluded.openness, logistics = excluded.logistics,
      interests_json = excluded.interests_json, avail_slots_json = excluded.avail_slots_json,
      target_freq_days = excluded.target_freq_days, notice_preference = excluded.notice_preference,
      distance_tier = excluded.distance_tier, social_type = excluded.social_type,
      work_drain = excluded.work_drain, comfort_level = excluded.comfort_level,
      last_hang_date = CASE WHEN excluded.last_hang_date IS NOT NULL THEN excluded.last_hang_date ELSE friends.last_hang_date END,
      home_location = excluded.home_location,
      conflicts_json = excluded.conflicts_json, synergies_json = excluded.synergies_json,
      phone = excluded.phone, apple_contact_id = excluded.apple_contact_id,
      preferred_channel = excluded.preferred_channel,
      rankings_json = excluded.rankings_json, manual_flakes = excluded.manual_flakes,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= friends.updated_at
  `);

  db.exec("BEGIN");
  try {
    friends.forEach((f) => stmt.run(friendShapeToRow(f)));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
