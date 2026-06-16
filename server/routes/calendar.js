import { Router } from "express";
import { checkFreeBusy, fetchCalendarEvents } from "../google.js";
import {
  getAuth,
  getAllFriends,
  getCalSyncToken,
  saveCalSyncToken,
  bulkUpdateLastHangDate,
  getFriendLastHangDatesByIds,
} from "../db/queries.js";

const router = Router();

// GET /api/calendar/freebusy?date=YYYY-MM-DD&startTime=HH:MM&endTime=HH:MM&friendEmails=a@b.com,c@d.com
router.get("/freebusy", async (req, res) => {
  const { date, startTime, endTime, friendEmails } = req.query;
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "date, startTime, endTime are required" });
  }
  const emails = friendEmails ? friendEmails.split(",").filter(Boolean) : [];
  try {
    const result = await checkFreeBusy(date, startTime, endTime, emails);
    res.json(result);
  } catch (err) {
    console.error("freebusy error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Returns friend IDs whose name parts appear as whole words in text.
function fuzzyMatchFriends(text, friends) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return friends
    .filter((f) => {
      const parts = f.name
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length >= 3);
      return parts.some((part) => new RegExp(`\\b${part}\\b`).test(lower));
    })
    .map((f) => f.id);
}

// Fetch calendar events, email-match to friends, update last_hang_date.
// includeAudit=true adds matchedEvents and unmatchedEvents for the UI.
async function syncHangs(syncToken, includeAudit = false) {
  const friends = getAllFriends();
  const emailMap = Object.fromEntries(
    friends.filter((f) => f.email).map((f) => [f.email.toLowerCase(), f.id])
  );
  const today = new Date().toISOString().slice(0, 10);

  let calEvents, nextSyncToken;
  try {
    ({ events: calEvents, nextSyncToken } = await fetchCalendarEvents(syncToken));
  } catch (err) {
    if (err.code === 410 && syncToken) {
      ({ events: calEvents, nextSyncToken } = await fetchCalendarEvents(null));
    } else throw err;
  }

  const best = {};
  const matchedEvents = [];
  const unmatchedEvents = [];
  const reviewEvents = [];

  for (const event of calEvents) {
    if (event.status === "cancelled") continue;
    const dateStr = event.start?.date ?? event.start?.dateTime?.slice(0, 10);
    if (!dateStr || dateStr > today) continue;

    const selfAtt = (event.attendees ?? []).find((a) => a.self);
    if (selfAtt?.responseStatus === "declined") continue;

    const others = (event.attendees ?? []).filter(
      (a) => !a.self && a.responseStatus !== "declined"
    );
    const title = event.summary ?? "";

    const emailMatches = [];
    for (const att of others) {
      const fId = emailMap[att.email?.toLowerCase()];
      if (fId) {
        emailMatches.push(fId);
        if (!best[fId] || dateStr > best[fId]) best[fId] = dateStr;
      }
    }

    if (includeAudit) {
      if (emailMatches.length > 0) {
        matchedEvents.push({ title, date: dateStr, friendIds: [...new Set(emailMatches)] });
      } else {
        const text = `${title} ${event.description ?? ""}`;
        const fuzzy = fuzzyMatchFriends(text, friends);
        if (others.length > 0 || fuzzy.length > 0) {
          unmatchedEvents.push({
            title,
            date: dateStr,
            attendeeCount: others.length,
            fuzzyMatches: fuzzy,
          });
        } else if (title) {
          reviewEvents.push({ title, date: dateStr });
        }
      }
    }
  }

  const updates = Object.entries(best).map(([friendId, date]) => ({ friendId, date }));
  if (updates.length) bulkUpdateLastHangDate(updates);
  if (nextSyncToken) saveCalSyncToken(nextSyncToken);

  const friendIds = updates.map((u) => u.friendId);
  const actualDates = getFriendLastHangDatesByIds(friendIds);
  const updated = friendIds.map((id) => ({ id, lastHangDate: actualDates[id] ?? null }));

  const byDateDesc = (a, b) => b.date.localeCompare(a.date);
  return {
    updated,
    scanned: calEvents.length,
    matched: updates.length,
    matchedEvents: matchedEvents.sort(byDateDesc).slice(0, 200),
    unmatchedEvents: unmatchedEvents.sort(byDateDesc).slice(0, 200),
    reviewEvents: reviewEvents.sort(byDateDesc).slice(0, 200),
  };
}

function requireGoogleAuth(res) {
  const auth = getAuth();
  if (!auth?.refresh_token) {
    res
      .status(401)
      .json({
        error: "not_authenticated",
        message: "Connect Google first — visit /api/auth/google",
      });
    return false;
  }
  return true;
}

// POST /api/calendar/sync-hangs — full 12-month import with audit data
router.post("/sync-hangs", async (req, res) => {
  if (!requireGoogleAuth(res)) return;
  try {
    const result = await syncHangs(null, true);
    res.json(result);
  } catch (err) {
    console.error("calendar import error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendar/sync-hangs — silent delta sync, no audit data
router.get("/sync-hangs", async (req, res) => {
  if (!requireGoogleAuth(res)) return;
  try {
    const token = getCalSyncToken();
    const result = await syncHangs(token, false);
    res.json(result);
  } catch (err) {
    console.error("calendar sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar/manual-hang — record a user-confirmed hang for one friend
router.post("/manual-hang", (req, res) => {
  const { friendId, date } = req.body;
  if (!friendId || !date) return res.status(400).json({ error: "friendId and date required" });
  bulkUpdateLastHangDate([{ friendId, date }]);
  const dates = getFriendLastHangDatesByIds([friendId]);
  res.json({ id: friendId, lastHangDate: dates[friendId] ?? null });
});

export default router;
