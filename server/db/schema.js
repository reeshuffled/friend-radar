// Applies schema migrations to the SQLite database.
// All JSON columns store the full sub-object as a JSON string.
// Run once on startup via db.js.

export function applySchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- ── Auth ──────────────────────────────────────────────────────────────────
    -- One row per user (single-user app for now; user_id = 1 always)
    CREATE TABLE IF NOT EXISTS auth (
      user_id        INTEGER PRIMARY KEY,
      access_token   TEXT,
      refresh_token  TEXT NOT NULL,
      token_expiry   INTEGER,   -- unix ms
      gmail_address  TEXT,
      gcal_id        TEXT        -- primary calendar id, usually same as gmail
    );

    -- Per-friend calendar consent (Phase 4)
    CREATE TABLE IF NOT EXISTS friend_auth (
      friend_id      TEXT PRIMARY KEY,
      refresh_token  TEXT NOT NULL,
      gmail_address  TEXT,
      granted_at     INTEGER NOT NULL
    );

    -- ── Friends ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS friends (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      email             TEXT NOT NULL DEFAULT '',
      contact           TEXT NOT NULL DEFAULT '',
      notes             TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'Friend',
      groups_json       TEXT NOT NULL DEFAULT '[]',    -- string[]
      want_around       TEXT NOT NULL DEFAULT 'active', -- 'active' | 'skip'
      busy_until        TEXT,                           -- ISO date; null = not busy

      -- Propensity sliders (1–5)
      reliability       INTEGER NOT NULL DEFAULT 3,
      responsiveness    INTEGER NOT NULL DEFAULT 3,
      vibe              INTEGER NOT NULL DEFAULT 3,
      openness          INTEGER NOT NULL DEFAULT 3,
      logistics         INTEGER NOT NULL DEFAULT 3,
      interests_json    TEXT NOT NULL DEFAULT '{}',   -- Record<ActivityId, 1-5>

      -- Scheduling
      avail_slots_json  TEXT NOT NULL DEFAULT '[]',   -- string[]
      target_freq_days  INTEGER,
      notice_preference TEXT NOT NULL DEFAULT 'few-days',
      distance_tier     TEXT NOT NULL DEFAULT 'nearby',

      -- Social energy
      social_type       TEXT NOT NULL DEFAULT 'ambivert',
      work_drain        TEXT NOT NULL DEFAULT 'medium',
      comfort_level     TEXT NOT NULL DEFAULT 'solo',

      -- Social dynamics
      conflicts_json    TEXT NOT NULL DEFAULT '[]',  -- friend IDs they can't be with
      synergies_json    TEXT NOT NULL DEFAULT '[]',  -- friend IDs with explicit good chemistry

      -- Contact channels
      phone             TEXT NOT NULL DEFAULT '',
      apple_contact_id  TEXT,
      preferred_channel TEXT NOT NULL DEFAULT 'imessage',  -- email|gcal|imessage|manual

      -- Beli-style rankings & flake override
      rankings_json     TEXT NOT NULL DEFAULT '{}',  -- Record<attr, 0.0-10.0>
      manual_flakes     INTEGER NOT NULL DEFAULT 0,  -- signed delta on top of event-derived flake count

      -- Legacy / override
      last_hang_date    TEXT,     -- ISO date, manual override
      home_location     TEXT,     -- Phase 4: address or "lat,lng"

      updated_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- ── Events ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS events (
      id              TEXT PRIMARY KEY,
      activity_id     TEXT NOT NULL,
      date            TEXT NOT NULL,       -- YYYY-MM-DD
      start_time      TEXT NOT NULL,       -- HH:MM 24hr
      end_time        TEXT NOT NULL,
      location        TEXT NOT NULL DEFAULT '',
      cascade         INTEGER NOT NULL DEFAULT 0,    -- bool
      max_capacity    INTEGER,
      plus_one_allowed INTEGER NOT NULL DEFAULT 0,  -- bool
      solo_anchor     INTEGER NOT NULL DEFAULT 0,   -- bool
      finalized       INTEGER NOT NULL DEFAULT 0,   -- bool
      rating          INTEGER,            -- 1–5
      notes           TEXT NOT NULL DEFAULT '',
      gcal_event_id   TEXT,               -- set after GCal event created
      legs_json       TEXT,               -- [{id,label,startTime,endTime,location}] null = single block
      message         TEXT NOT NULL DEFAULT '',  -- user-written invite message
      created_at      TEXT NOT NULL       -- ISO date
    );

    -- ── Invites ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS invites (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      friend_id       TEXT NOT NULL REFERENCES friends(id),
      response        TEXT NOT NULL DEFAULT 'pending',  -- pending|yes|maybe|no|ghosted
      showed          INTEGER,          -- null|0|1, set on finalize
      invite_status   TEXT NOT NULL DEFAULT 'invited',  -- invited|queued
      queue_position  INTEGER,
      invite_sent_at      INTEGER,          -- unix ms, set when invite goes out
      invite_channel      TEXT NOT NULL DEFAULT 'email',  -- email|gcal|imessage|manual
      attending_legs_json TEXT,             -- null = all legs, else ["leg-id",...]
      UNIQUE(event_id, friend_id)
    );

    -- ── Activities ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS activities (
      id            TEXT PRIMARY KEY,
      label         TEXT NOT NULL,
      energy_cost   REAL NOT NULL DEFAULT 0.35,
      location_type TEXT NOT NULL DEFAULT 'either',
      sort_order    INTEGER NOT NULL DEFAULT 99,
      is_builtin    INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_invites_event   ON invites(event_id);
    CREATE INDEX IF NOT EXISTS idx_invites_friend  ON invites(friend_id);
    CREATE INDEX IF NOT EXISTS idx_events_date     ON events(date);
  `);

  // Migrate want_around from INTEGER (0/1) to TEXT enum
  db.exec(`
    UPDATE friends SET want_around = 'active' WHERE want_around = 1 OR want_around = '1';
    UPDATE friends SET want_around = 'skip'   WHERE want_around = 0 OR want_around = '0';
  `);

  // Add tags column if it doesn't exist yet
  try { db.exec(`ALTER TABLE friends ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE friends ADD COLUMN rankings_json TEXT NOT NULL DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE friends ADD COLUMN manual_flakes INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE events ADD COLUMN message TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE friends ADD COLUMN busy_until TEXT`); } catch {}
  try { db.exec(`ALTER TABLE auth ADD COLUMN cal_sync_token TEXT`); } catch {}
  try { db.exec(`ALTER TABLE events ADD COLUMN venue_proximity TEXT NOT NULL DEFAULT 'mine'`); } catch {}

  // Seed built-in activities if table is empty
  const actCount = db.prepare("SELECT COUNT(*) as n FROM activities").get();
  if (Object.assign({}, actCount).n === 0) {
    const stmt = db.prepare(
      "INSERT INTO activities (id, label, energy_cost, location_type, sort_order, is_builtin) VALUES (@id, @label, @energyCost, @locationType, @sortOrder, 1)"
    );
    const DEFAULTS = [
      { id: "board-games", label: "Board games",      energyCost: 0.35, locationType: "home",   sortOrder: 1  },
      { id: "movies",      label: "Movies",            energyCost: 0.20, locationType: "home",   sortOrder: 2  },
      { id: "bars-drinks", label: "Bars / drinks",     energyCost: 0.55, locationType: "out",    sortOrder: 3  },
      { id: "hiking",      label: "Hiking",            energyCost: 0.40, locationType: "either", sortOrder: 4  },
      { id: "concerts",    label: "Concerts / shows",  energyCost: 0.50, locationType: "out",    sortOrder: 5  },
      { id: "food",        label: "Food / restaurant", energyCost: 0.30, locationType: "out",    sortOrder: 6  },
      { id: "house-party", label: "House party",       energyCost: 0.80, locationType: "home",   sortOrder: 7  },
      { id: "sports",      label: "Sports",            energyCost: 0.45, locationType: "either", sortOrder: 8  },
      { id: "coffee",      label: "Coffee",            energyCost: 0.15, locationType: "out",    sortOrder: 9  },
      { id: "just-hang",   label: "Just a hang",       energyCost: 0.30, locationType: "either", sortOrder: 10 },
    ];
    db.exec("BEGIN");
    try {
      DEFAULTS.forEach(a => stmt.run(a));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
