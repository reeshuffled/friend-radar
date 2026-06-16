import { google } from "googleapis";
import { getAuth, saveAuth } from "./db/queries.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = makeOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = makeOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Fetch the user's email address and primary calendar id
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  saveAuth({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: tokens.expiry_date,
    gmailAddress: profile.email,
    gcalId: profile.email, // primary calendar is always the Gmail address
  });

  return profile.email;
}

// Returns an authorized OAuth2 client, refreshing the access token if needed.
async function getAuthorizedClient() {
  const auth = getAuth();
  if (!auth) throw new Error("Not authenticated. Visit /api/auth/google to connect.");

  const client = makeOAuth2Client();
  client.setCredentials({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expiry_date: auth.token_expiry,
  });

  // googleapis handles token refresh automatically, but we persist the new token
  client.on("tokens", (tokens) => {
    if (tokens.access_token) {
      saveAuth({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? auth.refresh_token,
        tokenExpiry: tokens.expiry_date,
        gmailAddress: auth.gmail_address,
        gcalId: auth.gcal_id,
      });
    }
  });

  return client;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function fetchCalendarEvents(syncToken = null) {
  const client = await getAuthorizedClient();
  const auth = getAuth();
  const cal = google.calendar({ version: "v3", auth: client });

  const allItems = [];
  let pageToken = undefined;
  let nextSyncToken = null;

  const baseParams = syncToken
    ? { calendarId: auth.gcal_id, syncToken, showDeleted: true }
    : {
        calendarId: auth.gcal_id,
        timeMin: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
        maxResults: 2500,
        singleEvents: true,
        orderBy: "startTime",
      };

  do {
    const params = { ...baseParams, ...(pageToken ? { pageToken } : {}) };
    const { data } = await cal.events.list(params);
    allItems.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events: allItems, nextSyncToken };
}

export async function checkFreeBusy(dateStr, startTime, endTime, friendEmails = []) {
  const client = await getAuthorizedClient();
  const auth = getAuth();

  const timeMin = new Date(`${dateStr}T${startTime}:00`).toISOString();
  const timeMax = new Date(`${dateStr}T${endTime}:00`).toISOString();

  const cal = google.calendar({ version: "v3", auth: client });
  const items = [{ id: auth.gcal_id }, ...friendEmails.map((e) => ({ id: e }))];
  const { data } = await cal.freebusy.query({ requestBody: { timeMin, timeMax, items } });

  const busy = data.calendars?.[auth.gcal_id]?.busy ?? [];

  const friends = {};
  for (const email of friendEmails) {
    const fb = data.calendars?.[email];
    if (fb) {
      friends[email] = {
        free: (fb.busy ?? []).length === 0,
        error: fb.errors?.[0]?.reason ?? null,
      };
    }
  }

  return {
    free: busy.length === 0,
    conflicts: busy.map((b) => ({ start: b.start, end: b.end })),
    friends,
  };
}

function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export async function createCalendarEvent({ event, friendNames: _friendNames, friendEmails }) {
  const client = await getAuthorizedClient();
  const auth = getAuth();

  const cal = google.calendar({ version: "v3", auth: client });
  const activityLabel = event.activityId.replace(/-/g, " ");

  const attendees = friendEmails.filter(Boolean).map((email) => ({ email }));

  const hasLegs = Array.isArray(event.legs) && event.legs.length > 0;
  const startDateTime = hasLegs
    ? `${event.date}T${event.legs[0].startTime}:00`
    : `${event.date}T${event.startTime}:00`;
  const endDateTime = hasLegs
    ? `${event.date}T${event.legs[event.legs.length - 1].endTime}:00`
    : `${event.date}T${event.endTime}:00`;

  const legsLines = hasLegs
    ? event.legs.map(
        (leg) =>
          `${leg.label} — ${fmtTime(leg.startTime)} – ${fmtTime(leg.endTime)} @ ${leg.location}`
      )
    : [];

  const description = [
    event.notes,
    event.soloAnchor ? "Going regardless — come through if you want." : "",
    event.plusOneAllowed ? "+1 welcome." : "",
    legsLines.length ? legsLines.join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data } = await cal.events.insert({
    calendarId: auth.gcal_id,
    sendUpdates: "all",
    requestBody: {
      summary: activityLabel.charAt(0).toUpperCase() + activityLabel.slice(1),
      location: event.location,
      description,
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
      attendees,
    },
  });

  return data.id;
}

export async function addAttendeesToCalendarEvent(gcalEventId, emails) {
  const client = await getAuthorizedClient();
  const auth = getAuth();
  const cal = google.calendar({ version: "v3", auth: client });

  const { data: existing } = await cal.events.get({
    calendarId: auth.gcal_id,
    eventId: gcalEventId,
  });

  const currentEmails = new Set((existing.attendees ?? []).map((a) => a.email));
  const newAttendees = emails.filter((e) => e && !currentEmails.has(e)).map((e) => ({ email: e }));
  if (!newAttendees.length) return;

  await cal.events.patch({
    calendarId: auth.gcal_id,
    eventId: gcalEventId,
    sendUpdates: "all",
    requestBody: {
      attendees: [...(existing.attendees ?? []), ...newAttendees],
    },
  });
}

export async function pollGcalAttendeeStatus(gcalEventId) {
  const client = await getAuthorizedClient();
  const auth = getAuth();
  const cal = google.calendar({ version: "v3", auth: client });
  const { data } = await cal.events.get({ calendarId: auth.gcal_id, eventId: gcalEventId });
  const MAP = { accepted: "yes", tentative: "maybe", declined: "no", needsAction: "pending" };
  const result = {};
  for (const a of data.attendees ?? []) {
    if (a.self) continue; // skip the organizer
    result[a.email] = MAP[a.responseStatus] ?? "pending";
  }
  return result; // { "email@x.com": "yes"|"maybe"|"no"|"pending" }
}

// ── Gmail ─────────────────────────────────────────────────────────────────────

export async function sendGmailMessage({ to, subject, html, text: _text }) {
  const client = await getAuthorizedClient();
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth: client });

  const body = [
    `From: ${auth.gmail_address}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");

  const encoded = Buffer.from(body).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}
