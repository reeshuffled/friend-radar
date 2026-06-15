import { Router } from "express";
import { getAllFriends, upsertFriend, deleteFriend, bulkUpsertFriends, getFriend } from "../db/queries.js";
import { syncAppleContacts } from "../imessage.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(getAllFriends());
});

router.put("/:id", (req, res) => {
  const incoming = { ...req.body, id: req.params.id };
  const previous = getFriend(req.params.id);

  upsertFriend(incoming);

  // Sync conflicts bidirectionally
  if (previous) {
    const prevConflicts = new Set(previous.conflicts ?? []);
    const newConflicts  = new Set(incoming.conflicts ?? []);

    // Newly added conflicts
    for (const otherId of newConflicts) {
      if (prevConflicts.has(otherId)) continue;
      const other = getFriend(otherId);
      if (!other) continue;
      if (!(other.conflicts ?? []).includes(incoming.id)) {
        upsertFriend({ ...other, conflicts: [...(other.conflicts ?? []), incoming.id] });
      }
    }

    // Removed conflicts
    for (const otherId of prevConflicts) {
      if (newConflicts.has(otherId)) continue;
      const other = getFriend(otherId);
      if (!other) continue;
      if ((other.conflicts ?? []).includes(incoming.id)) {
        upsertFriend({ ...other, conflicts: (other.conflicts ?? []).filter(id => id !== incoming.id) });
      }
    }
  }

  res.json(getFriend(req.params.id));
});

router.delete("/:id", (req, res) => {
  deleteFriend(req.params.id);
  res.json({ ok: true });
});


router.post("/sync-apple-contacts", async (req, res) => {
  try {
    const contacts = await syncAppleContacts();
    const friends  = getAllFriends();
    const normalize = s => s.toLowerCase().replace(/\s+/g, " ").trim();
    const byName    = new Map(contacts.map(c => [normalize(c.name), c]));

    const matched   = [];
    const unmatched = [];

    for (const contact of contacts) {
      const friend = friends.find(f => normalize(f.name) === normalize(contact.name));
      if (!friend) { unmatched.push(contact.name); continue; }

      const updates = {};
      if (!friend.phone && contact.phone)           updates.phone = contact.phone;
      if (!friend.email && contact.email)           updates.email = contact.email;
      if (!friend.appleContactId && contact.appleContactId) updates.appleContactId = contact.appleContactId;

      if (Object.keys(updates).length) {
        upsertFriend({ ...friend, ...updates });
      }
      matched.push({ friendId: friend.id, name: friend.name, phone: contact.phone, email: contact.email });
    }

    res.json({ matched: matched.length, unmatched: unmatched.length, matches: matched });
  } catch (err) {
    console.error("sync-apple-contacts error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
