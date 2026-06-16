import { Router } from "express";
import { getAllFriends, getAllEvents, bulkUpsertFriends, createEvent } from "../db/queries.js";

const router = Router();

// GET /api/sync — React app pulls this on mount to get server state
router.get("/", (req, res) => {
  res.json({
    friends: getAllFriends(),
    events: getAllEvents(),
  });
});

// POST /api/sync — React app pushes its full local state on first connect.
// Server wins for any record that already exists (updated_at comparison in queries.js).
// New records are inserted.
router.post("/", (req, res) => {
  const { friends = [], events = [] } = req.body;

  bulkUpsertFriends(friends);

  const existing = new Set(getAllEvents().map((e) => e.id));
  for (const event of events) {
    if (!existing.has(event.id)) createEvent(event);
  }

  res.json({
    friends: getAllFriends(),
    events: getAllEvents(),
  });
});

export default router;
