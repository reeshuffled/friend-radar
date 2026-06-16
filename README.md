# Friend Radar

A personal social CRM and hangout-planning tool. It removes coordination friction by ranking who to invite based on a computed score, running invite cascades automatically, and learning flake patterns from real history.

## Motivation

Social planning has a dirty secret: most of the effort is coordination overhead, not the actual event. You have to remember who's free, who'll actually show up, and who needs a week's notice vs. a day. Friend Radar automates this. You describe an event, it ranks your friends by how likely each one is to come and enjoy it, sends invites in order, and advances to the next person if someone ghosts or declines.

The end state is an autonomous outreach machine: you pick the event type and time, it handles the rest.

## Core Concepts

### WAT Score

Every friend gets a score (0–100) computed from three factors:

```
score = Willing×0.40 + Able×0.35 + Trust×0.25
```

- **Willing (0–10):** How much they want to come. Derived from activity interest, openness, vibe, plus modifiers for social energy cost, location preference, and comfort level (whether they need a +1).
- **Able (0–10):** Whether they can make it. Derived from slot match, logistics score, distance tier, and notice preference vs. how far out the event is.
- **Trust (0–10):** How reliable they are. Uses real invite history once ≥2 finalized data points exist; otherwise uses reliability/responsiveness sliders. Includes a response-velocity bonus for people who respond quickly and clearly.

Recency nudge: ±2 points if `targetFreqDays` is set and they're overdue/recently seen.
`isBusyThisWeek = true` collapses the score by 85% (soft deprioritize, not exclude).
`wantAround = false` is a hard exclusion — never appears in the ranking.

### Cascade Engine

When cascade mode is on for an event:
1. The ranked invite list is frozen at creation time (scores never re-rank mid-cascade).
2. Every 36 hours, the worker checks pending-invited slots. Anyone who hasn't responded is marked ghosted and the next person in the queue is invited.
3. The cascade stops when `yesCount >= maxCapacity`.

The worker runs every 15 minutes as a separate Node process.

### RSVP Flow

Each invite email contains a unique `/rsvp/:token?r=yes|maybe|no` link. Clicking it updates the invite response in the database and renders a browser-friendly confirmation page.

## Deployment Modes

Friend Radar supports two backends selected at **client build time** via `VITE_BACKEND`.

### Local mode (default — no server required)

Data lives in the browser's IndexedDB. Works as a fully static site (GitHub Pages, Netlify, etc.). No Google credentials, no API fees, no server to run.

**Limitations:** no calendar integration, no email/iMessage invites, no Apple Contacts import, no cross-device sync. Data is lost if the user clears browser storage — use **Export backup** (Friends tab) regularly.

```bash
cd client && npm run build          # VITE_BACKEND defaults to "local"
# Deploy dist/ anywhere as a static site
```

### Server mode (self-hosted, full features)

Each operator runs their own Express server with their own Google OAuth credentials. The original author pays no API fees.

```bash
cp .env.example .env                # fill in Google OAuth credentials
VITE_BACKEND=server npm run build --prefix client
npm run dev                         # server (3001) + cascade worker + Vite (5173)
```

## Architecture

```
client/          React + Vite frontend (port 5173)
  src/
    lib/
      api/       Backend abstraction layer
        index.js   Selector — reads VITE_BACKEND, exports api + capabilities
        server.js  Fetch-based impl (Express REST API)
        local.js   IndexedDB impl (no server)
        db.js      idb setup + built-in activity seed
      scoring.js, helpers.js, constants.js, seed.js
    components/  UI components (tabs: Plan, Events, Friends, Add)

server/          Node.js + Express API (port 3001)
  db/            SQLite layer (node:sqlite)
    db.js        Singleton connection, schema init
    schema.js    DDL — friends, events, invites, auth tables
    queries.js   All DB reads/writes (prepared statements)
    serializers.js  Row ↔ shape conversions (snake_case ↔ camelCase)
  routes/        Express routers — auth, calendar, events, friends, sync
  worker.js      Cascade engine (poll every 15 min)
  email.js       Gmail invite dispatch (Gmail API via googleapis)
  google.js      Google Calendar / Contacts API wrappers

data/            SQLite database file (gitignored, created on startup)
tests/           Vitest test suite
```

The `capabilities` object exported from `client/src/lib/api/index.js` controls which server-only UI elements are shown (`capabilities.calendar`, `capabilities.contacts`, `capabilities.invites`).

## Quick Start

### Local mode (no prerequisites)

```bash
npm run setup             # installs root + client deps
cd client && npm run dev  # Vite only, no server needed
```

Open [http://localhost:5173](http://localhost:5173). Data persists in IndexedDB.

### Server mode

**Prerequisites:** Node.js 22+ (for `node:sqlite`), a Google Cloud project with Calendar, Gmail, and People APIs enabled.

```bash
cp .env.example .env      # fill in Google OAuth credentials
npm run setup             # installs root + client deps
VITE_BACKEND=server npm run dev   # server (3001), cascade worker, and Vite (5173)
```

Then open [http://localhost:5173](http://localhost:5173).

**First run:**
1. Click the Google login link at `http://localhost:3001/api/auth/google`
2. After OAuth, go to Friends → Sync Apple Contacts
3. Create an event on the Plan tab

### Environment Variables

**Server (`server/.env` or `.env`):**

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from GCP |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Must match GCP — `http://localhost:3001/api/auth/google/callback` |
| `PORT` | Server port (default: 3001) |
| `RSVP_SECRET` | Random string for signing RSVP tokens |
| `DB_PATH` | SQLite file path (default: `data/friend-radar.db`; set to `:memory:` in tests) |

**Client build (`client/.env.local`):**

| Variable | Description |
|----------|-------------|
| `VITE_BACKEND` | `local` (default) or `server` |
| `VITE_SERVER_URL` | Base URL of the Express server (empty = same-origin; only needed in server mode when client and server run on different origins) |

See `client/.env.example` for annotated examples.

## Development

```bash
npm test          # run all tests (Vitest)
npm run test:watch  # watch mode
npm run lint      # ESLint (server/ + tests/)
npm run format    # Prettier (server/ + tests/ + client/src/)
```

## Key Invariants

- `wantAround = false` is a hard exclusion — enforced at the UI layer before scoring.
- Cascade queue order is frozen at event creation; scores are never re-ranked mid-cascade.
- Trust uses real history only once ≥2 finalized invite data points exist.
- Flake rate counts only finalized events where `showed !== null`.
- `loadInvites` returns plain rows; `eventRowToShape` applies `inviteRowToShape` — never double-map.
