/**
 * One-time migration: encrypt all existing plaintext rows in the DB.
 *
 * Run AFTER setting DB_ENCRYPTION_KEY in .env:
 *   node server/scripts/encrypt-existing.js
 *
 * Safe to run multiple times — already-encrypted values (enc:v1: prefix)
 * are decrypted first and then re-encrypted, so the result is always the
 * current key. Run again if you rotate DB_ENCRYPTION_KEY.
 *
 * Does NOT touch: name, status, scalar scores, dates, enums (cleartext by design).
 */

import "dotenv/config";
import { encryptionEnabled } from "../db/crypto.js";
import { getDb } from "../db/db.js";
import {
  getAllFriends,
  upsertFriend,
  getAllEvents,
} from "../db/queries.js";
import { eventShapeToRow, inviteShapeToRow } from "../db/serializers.js";

if (!encryptionEnabled()) {
  console.error("DB_ENCRYPTION_KEY is not set. Aborting.");
  process.exit(1);
}

const db = getDb();

// ── Friends ────────────────────────────────────────────────────────────────────
// getAllFriends() already decrypts via serializers; upsertFriend() re-encrypts.
const friends = getAllFriends();
console.log(`Migrating ${friends.length} friend(s)...`);
for (const f of friends) {
  upsertFriend(f);
}

// ── Events + invites ──────────────────────────────────────────────────────────
// getAllEvents() returns decrypted shapes; we re-insert via eventShapeToRow.
const events = getAllEvents();
console.log(`Migrating ${events.length} event(s) (+ their invites)...`);
const updateEvent = db.prepare(
  `UPDATE events SET location=@location, notes=@notes, message=@message, legs_json=@legs_json
   WHERE id=@id`
);
const updateInvite = db.prepare(
  `UPDATE invites SET attending_legs_json=@attending_legs_json
   WHERE event_id=@event_id AND friend_id=@friend_id`
);

db.exec("BEGIN");
try {
  for (const ev of events) {
    const row = eventShapeToRow(ev);
    updateEvent.run({
      id: ev.id,
      location: row.location,
      notes: row.notes,
      message: row.message,
      legs_json: row.legs_json,
    });
    for (const inv of ev.invites ?? []) {
      const invRow = inviteShapeToRow(ev.id, inv, inv.queuePosition);
      updateInvite.run({
        event_id: ev.id,
        friend_id: inv.friendId,
        attending_legs_json: invRow.attending_legs_json,
      });
    }
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

// ── Auth tokens ───────────────────────────────────────────────────────────────
// getAuth() already decrypts; saveAuth() re-encrypts. But saveAuth() requires
// all fields, so we re-save the whole row.
import { getAuth, saveAuth } from "../db/queries.js";
const auth = getAuth();
if (auth) {
  console.log("Migrating auth tokens...");
  saveAuth({
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    tokenExpiry: auth.token_expiry,
    gmailAddress: auth.gmail_address,
    gcalId: auth.gcal_id,
  });
}

// cal_sync_token
import { getCalSyncToken, saveCalSyncToken } from "../db/queries.js";
const calSyncToken = getCalSyncToken();
if (calSyncToken) {
  console.log("Migrating cal_sync_token...");
  saveCalSyncToken(calSyncToken);
}

console.log("Done. All existing rows are now encrypted.");
