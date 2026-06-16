import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";
import { applySchema } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, "../../data/friend-radar.db");

let _db;

export function getDb() {
  if (!_db) {
    const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
    _db = new DatabaseSync(dbPath);
    applySchema(_db);
  }
  return _db;
}

export function resetDb() {
  _db?.close();
  _db = null;
}
