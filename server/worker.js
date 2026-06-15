import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(__dirname, "../data"), { recursive: true });

import { getActiveCascadeEvents, getFriend, updateInviteStatus, updateInviteResponse, getEvent } from "./db/queries.js";
import { addAttendeesToCalendarEvent, pollGcalAttendeeStatus } from "./google.js";
import { sendInviteEmail } from "./email.js";
import { sendIMessage } from "./imessage.js";

const GRACE_PERIOD_MS  = 36 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 60 * 1000;

async function dispatchInvite(event, friend, channel) {
  if (channel === "email" && friend.email) {
    await sendInviteEmail({ event, friendName: friend.name, friendEmail: friend.email });
  } else if (channel === "imessage" && friend.phone) {
    await sendIMessage(friend.phone, event.message);
  }
}

async function runCascade() {
  const events = getActiveCascadeEvents();
  if (!events.length) return;

  console.log(`[cascade] checking ${events.length} active event(s)`);

  for (const event of events) {
    // Sync GCal attendee responses for gcal-channel invites
    if (event.gcalEventId) {
      try {
        const statusMap = await pollGcalAttendeeStatus(event.gcalEventId);
        for (const inv of event.invites) {
          if (inv.inviteChannel !== "gcal") continue;
          const friend = getFriend(inv.friendId);
          if (!friend?.email) continue;
          const gcalResponse = statusMap[friend.email];
          if (gcalResponse && gcalResponse !== inv.response && inv.response === "pending") {
            console.log(`[cascade] GCal response for ${friend.name}: ${gcalResponse}`);
            updateInviteResponse(event.id, inv.friendId, gcalResponse);
          }
        }
      } catch (err) {
        console.error(`[cascade] GCal poll failed for event ${event.id}:`, err.message);
      }
    }

    const yesCount = event.invites.filter(i => i.response === "yes").length;
    if (event.maxCapacity && yesCount >= event.maxCapacity) {
      console.log(`[cascade] event ${event.id} full (${yesCount}/${event.maxCapacity}) — skipping`);
      continue;
    }

    // Ghost anyone invited >36hrs ago with no response (non-gcal channels)
    const now = Date.now();
    for (const inv of event.invites) {
      if (inv.inviteStatus !== "invited")        continue;
      if (inv.response !== "pending")            continue;
      if (inv.inviteChannel === "gcal")          continue; // GCal handles its own reminders
      if (!inv.inviteSentAt)                     continue;
      if (now - inv.inviteSentAt < GRACE_PERIOD_MS) continue;

      console.log(`[cascade] marking ${inv.friendId} ghosted on event ${event.id}`);
      updateInviteResponse(event.id, inv.friendId, "ghosted");
    }

    // Advance next queued person if slot open
    const refreshed  = getEvent(event.id);
    const currentYes = refreshed.invites.filter(i => i.response === "yes").length;
    const slotsLeft  = (event.maxCapacity ?? Infinity) - currentYes;
    if (slotsLeft <= 0) continue;

    const nextQueued = refreshed.invites.find(i => i.inviteStatus === "queued");
    if (!nextQueued) continue;

    const candidateFriend = getFriend(nextQueued.friendId);
    if (!candidateFriend) continue;

    // Skip if this friend conflicts with anyone who already said yes
    const yesFriendIds = refreshed.invites
      .filter(i => i.response === "yes")
      .map(i => i.friendId);

    const candidateConflicts = candidateFriend.conflicts ?? [];
    const conflictsWithYes = yesFriendIds.some(id =>
      candidateConflicts.includes(id) ||
      (getFriend(id)?.conflicts ?? []).includes(candidateFriend.id)
    );

    if (conflictsWithYes) {
      console.log(`[cascade] skipping ${candidateFriend.name} — conflicts with a confirmed attendee`);
      updateInviteStatus(event.id, candidateFriend.id, "queued"); // leave queued, try next
      // Try advancing to the person after them instead
      const afterNext = refreshed.invites.find(i => i.inviteStatus === "queued" && i.friendId !== candidateFriend.id);
      if (afterNext) {
        // Re-run the advance logic for afterNext on next poll cycle (don't recurse)
        console.log(`[cascade] will try ${getFriend(afterNext.friendId)?.name} next poll`);
      }
      continue;
    }

    const friend = candidateFriend;
    const channel = nextQueued.inviteChannel ?? friend.preferredChannel ?? "email";
    console.log(`[cascade] advancing to ${friend.name} via ${channel} on event ${event.id}`);
    updateInviteStatus(event.id, friend.id, "invited");

    try {
      await dispatchInvite(event, friend, channel);
      updateInviteStatus(event.id, friend.id, "invited", Date.now());
      console.log(`[cascade] invite sent to ${friend.name}`);

      if (event.gcalEventId && channel === "gcal" && friend.email) {
        await addAttendeesToCalendarEvent(event.gcalEventId, [friend.email])
          .catch(err => console.error(`[cascade] gcal update failed:`, err.message));
      }
    } catch (err) {
      console.error(`[cascade] failed to invite ${friend.name}:`, err.message);
    }
  }
}

runCascade().catch(console.error);
setInterval(() => runCascade().catch(console.error), POLL_INTERVAL_MS);
console.log(`[cascade] worker started — polling every ${POLL_INTERVAL_MS / 60000} minutes`);
