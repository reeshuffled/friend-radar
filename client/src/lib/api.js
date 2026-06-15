async function req(url, opts = {}) {
  const { body, ...rest } = opts;
  const r = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) { const e = new Error(`${r.status} ${url}`); e.status = r.status; throw e; }
  return r.json();
}

export const api = {
  getFriends:      ()         => req('/friends'),
  upsertFriend:    (f)        => req(`/friends/${f.id}`, { method: 'PUT', body: f }),
  deleteFriend:    (id)       => req(`/friends/${id}`, { method: 'DELETE' }),

  getEvents:       ()         => req('/events'),
  createEvent:     (event)    => req('/events', { method: 'POST', body: event }),
  updateEvent:     (id, data) => req(`/events/${id}`, { method: 'PUT', body: data }),
  advanceCascade:  (id)       => req(`/events/${id}/advance`, { method: 'POST' }),

  getActivities:   ()      => req('/activities'),
  createActivity:  (act)   => req('/activities', { method: 'POST', body: act }),
  updateActivity:  (act)   => req(`/activities/${act.id}`, { method: 'PUT', body: act }),
  deleteActivity:  (id)    => req(`/activities/${id}`, { method: 'DELETE' }),

  syncAppleContacts:        ()                                    => req('/friends/sync-apple-contacts', { method: 'POST' }),
  syncCalendarHangs:        ()                                    => req('/calendar/sync-hangs'),
  importCalendarHangs:      ()                                    => req('/calendar/sync-hangs', { method: 'POST' }),
  confirmCalendarHang:      (friendId, date)                      => req('/calendar/manual-hang', { method: 'POST', body: { friendId, date } }),
  recordResponse:           (eventId, friendId, response)         => req(`/events/${eventId}/invites/${friendId}/response`, { method: 'PATCH', body: { response } }),
  updateInviteAttendingLegs:(eventId, friendId, attendingLegs)   => req(`/events/${eventId}/invites/${friendId}/attending-legs`, { method: 'PATCH', body: { attendingLegs } }),
};
