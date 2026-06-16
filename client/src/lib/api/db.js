/**
 * IndexedDB setup for local (no-server) mode.
 * Three object stores keyed by string id, matching the shapes the server serializes.
 *
 * Built-in activities are seeded from constants.js so they stay in sync with the
 * server-side seed in server/db/schema.js.
 */
import { openDB } from "idb";
import { ACTIVITIES, SOCIAL_ENERGY_COSTS, ACTIVITY_LOCATION_TYPE } from "../constants.js";

const DB_NAME = "friend-radar";
const DB_VERSION = 2; // v2 adds "meta" store for encryption salt/verifier

let _db = null;

export async function getLocalDb() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("friends")) {
        db.createObjectStore("friends", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("activities")) {
        db.createObjectStore("activities", { keyPath: "id" });
      }
      // v2: encryption metadata { id: "enc", salt, verifier }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "id" });
      }
    },
  });
  return _db;
}

/** Read the encryption meta record, or null if not set. */
export async function getEncMeta() {
  const db = await getLocalDb();
  return (await db.get("meta", "enc")) ?? null;
}

/** Persist the encryption meta record (salt + verifier). */
export async function saveEncMeta(meta) {
  const db = await getLocalDb();
  await db.put("meta", meta);
}

/** Remove the encryption meta record (disabling encryption). */
export async function deleteEncMeta() {
  const db = await getLocalDb();
  await db.delete("meta", "enc");
}

/** Built-in activities derived from constants.js — mirrors server/db/schema.js seed. */
export const BUILTIN_ACTIVITIES = ACTIVITIES.map((act, i) => ({
  id: act.id,
  label: act.label,
  energyCost: SOCIAL_ENERGY_COSTS[act.id] ?? 0.35,
  locationType: ACTIVITY_LOCATION_TYPE[act.id] ?? "either",
  sortOrder: i,
  isBuiltin: true,
}));

/** Seed built-in activities if the store is empty. */
export async function seedActivitiesIfEmpty(db) {
  const all = await db.getAll("activities");
  if (all.length > 0) return;
  const tx = db.transaction("activities", "readwrite");
  for (const act of BUILTIN_ACTIVITIES) {
    tx.store.put(act);
  }
  await tx.done;
}
