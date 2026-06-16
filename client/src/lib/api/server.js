/**
 * Server backend — all requests go to the Express API.
 * Base URL: VITE_SERVER_URL (empty = same-origin /api, covers production self-host
 * where Express serves dist/ as well as the Vite dev proxy).
 */
const BASE = (import.meta.env.VITE_SERVER_URL ?? "") + "/api";

async function req(url, opts = {}) {
  const { body, ...rest } = opts;
  const r = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json" },
    ...rest,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const e = new Error(`${r.status} ${url}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export const serverApi = {
  getFriends: () => req("/friends"),
  upsertFriend: (f) => req(`/friends/${f.id}`, { method: "PUT", body: f }),
  deleteFriend: (id) => req(`/friends/${id}`, { method: "DELETE" }),

  getEvents: () => req("/events"),
  createEvent: (event) => req("/events", { method: "POST", body: event }),
  updateEvent: (id, data) => req(`/events/${id}`, { method: "PUT", body: data }),
  advanceCascade: (id) => req(`/events/${id}/advance`, { method: "POST" }),

  getActivities: () => req("/activities"),
  createActivity: (act) => req("/activities", { method: "POST", body: act }),
  updateActivity: (act) => req(`/activities/${act.id}`, { method: "PUT", body: act }),
  deleteActivity: (id) => req(`/activities/${id}`, { method: "DELETE" }),

  checkFreeBusy: (date, startTime, endTime, friendEmails = []) => {
    const params = new URLSearchParams({ date, startTime, endTime });
    if (friendEmails.length) params.set("friendEmails", friendEmails.join(","));
    return req(`/calendar/freebusy?${params}`);
  },

  syncAppleContacts: () => req("/friends/sync-apple-contacts", { method: "POST" }),
  syncCalendarHangs: () => req("/calendar/sync-hangs"),
  importCalendarHangs: () => req("/calendar/sync-hangs", { method: "POST" }),
  confirmCalendarHang: (friendId, date) =>
    req("/calendar/manual-hang", { method: "POST", body: { friendId, date } }),
  recordResponse: (eventId, friendId, response) =>
    req(`/events/${eventId}/invites/${friendId}/response`, { method: "PATCH", body: { response } }),
  updateInviteAttendingLegs: (eventId, friendId, attendingLegs) =>
    req(`/events/${eventId}/invites/${friendId}/attending-legs`, {
      method: "PATCH",
      body: { attendingLegs },
    }),

  // Data portability (server mode version — calls the /sync endpoint for export)
  exportData: async () => {
    const data = await req("/sync");
    return { version: 1, ...data };
  },
  // No-op import in server mode (use the /sync endpoint directly)
  importData: async () => {
    throw Object.assign(new Error("Use the server sync endpoint to import data in server mode"), {
      noServer: false,
    });
  },
};
