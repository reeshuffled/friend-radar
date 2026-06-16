import { Router } from "express";
import {
  getAllEvents,
  getEvent,
  createEvent,
  updateEventFields,
  updateInviteResponse,
  updateInviteStatus,
  updateInviteShowed,
  getFriend,
  getAuth,
} from "../db/queries.js";
import { getDb } from "../db/db.js";
import { createCalendarEvent, addAttendeesToCalendarEvent } from "../google.js";
import { sendInviteEmail } from "../email.js";
import { sendIMessage } from "../imessage.js";

const router = Router();

// Dispatch invite send by channel. Returns any errors encountered.
async function dispatchInvite(event, friend, channel) {
  const errors = [];
  if (channel === "email" && friend.email) {
    try {
      await sendInviteEmail({ event, friendName: friend.name, friendEmail: friend.email });
    } catch (err) {
      errors.push({ type: "email", error: err.message });
    }
  } else if (channel === "imessage" && friend.phone) {
    try {
      await sendIMessage(friend.phone, event.message);
    } catch (err) {
      errors.push({ type: "imessage", error: err.message });
    }
  }
  // gcal and manual: no direct message send (gcal invite comes from GCal itself)
  return errors;
}

router.get("/", (req, res) => {
  res.json(getAllEvents());
});

router.get("/:id", (req, res) => {
  const event = getEvent(req.params.id);
  if (!event) return res.status(404).json({ error: "Not found" });
  res.json(event);
});

// POST /api/events — create event, send first invite, create GCal event
router.post("/", async (req, res) => {
  const event = req.body;
  createEvent(event);

  const auth = getAuth();
  const errors = [];

  // Send to the first "invited" person based on their channel
  const firstInvited = event.invites?.find((i) => i.inviteStatus === "invited");
  if (firstInvited) {
    const friend = getFriend(firstInvited.friendId);
    const channel = firstInvited.inviteChannel ?? friend?.preferredChannel ?? "email";
    if (friend) {
      const errs = await dispatchInvite(event, friend, channel);
      errors.push(...errs);
      updateInviteStatus(event.id, friend.id, "invited", Date.now());
    }
  }

  // Always create a GCal event if authenticated (so it appears on your calendar)
  if (auth) {
    const invitedFriends = (event.invites ?? [])
      .filter((i) => i.inviteStatus === "invited" && (i.inviteChannel ?? "email") === "gcal")
      .map((i) => getFriend(i.friendId))
      .filter(Boolean);

    try {
      const gcalId = await createCalendarEvent({
        event,
        friendNames: invitedFriends.map((f) => f.name),
        friendEmails: invitedFriends.map((f) => f.email).filter(Boolean),
      });
      updateEventFields(event.id, { gcal_event_id: gcalId });
    } catch (err) {
      errors.push({ type: "gcal", error: err.message });
    }
  }

  res.status(201).json({ event: getEvent(event.id), errors });
});

// PUT /api/events/:id — update event fields
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const event = getEvent(id);
  if (!event) return res.status(404).json({ error: "Not found" });

  const { invites, ...fields } = req.body;
  const allowed = {
    finalized: fields.finalized != null ? (fields.finalized ? 1 : 0) : undefined,
    rating: fields.rating,
    notes: fields.notes,
    location: fields.location,
    plus_one_allowed: fields.plusOneAllowed != null ? (fields.plusOneAllowed ? 1 : 0) : undefined,
    solo_anchor: fields.soloAnchor != null ? (fields.soloAnchor ? 1 : 0) : undefined,
    gcal_event_id: fields.gcalEventId,
  };
  const toSet = Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined));
  if (Object.keys(toSet).length) updateEventFields(id, toSet);

  if (invites?.length) {
    for (const inv of invites) {
      if (inv.response != null) updateInviteResponse(id, inv.friendId, inv.response);
      if (inv.showed != null) updateInviteShowed(id, inv.friendId, inv.showed);
    }
  }

  res.json(getEvent(id));
});

// POST /api/events/:id/advance — manually advance cascade to next queued person
router.post("/:id/advance", async (req, res) => {
  const event = getEvent(req.params.id);
  if (!event) return res.status(404).json({ error: "Not found" });

  const nextQueued = event.invites.find((i) => i.inviteStatus === "queued");
  if (!nextQueued) return res.json({ advanced: false, reason: "No queued invites" });

  const friend = getFriend(nextQueued.friendId);
  const channel = nextQueued.inviteChannel ?? friend?.preferredChannel ?? "email";
  updateInviteStatus(event.id, nextQueued.friendId, "invited");

  const errors = [];
  if (friend) {
    const errs = await dispatchInvite(event, friend, channel);
    errors.push(...errs);
    updateInviteStatus(event.id, friend.id, "invited", Date.now());

    if (event.gcalEventId && channel === "gcal" && friend.email) {
      await addAttendeesToCalendarEvent(event.gcalEventId, [friend.email]).catch((e) =>
        errors.push({ type: "gcal", error: e.message })
      );
    }
  }

  res.json({ advanced: true, to: friend?.name, errors });
});

// PATCH /api/events/:id/invites/:friendId/attending-legs — update which legs an invitee is attending
router.patch("/:id/invites/:friendId/attending-legs", (req, res) => {
  const { id, friendId } = req.params;
  const { attendingLegs } = req.body; // null or string[]
  const event = getEvent(id);
  if (!event) return res.status(404).json({ error: "Not found" });
  getDb()
    .prepare("UPDATE invites SET attending_legs_json = ? WHERE event_id = ? AND friend_id = ?")
    .run(attendingLegs?.length ? JSON.stringify(attendingLegs) : null, id, friendId);
  res.json(getEvent(id));
});

// PATCH /api/events/:id/invites/:friendId/response — manual response tracking
router.patch("/:id/invites/:friendId/response", (req, res) => {
  const { id, friendId } = req.params;
  const { response } = req.body;

  if (!["yes", "maybe", "no", "pending", "ghosted"].includes(response)) {
    return res.status(400).json({ error: "Invalid response" });
  }

  const event = getEvent(id);
  if (!event) return res.status(404).json({ error: "Not found" });

  updateInviteResponse(id, friendId, response);
  res.json(getEvent(id));
});

export default router;
