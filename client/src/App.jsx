import { useState, useEffect, useRef, useCallback } from "react";
import { api, capabilities } from "./lib/api/index.js";
import { todayStr } from "./lib/helpers.js";
import { EMPTY_FRIEND } from "./lib/constants.js";
import { PlanTab } from "./components/planning/PlanTab.jsx";
import { EventsTab } from "./components/events/EventsTab.jsx";
import { FriendsTab } from "./components/friends/FriendsTab.jsx";
import { FriendForm } from "./components/friends/FriendForm.jsx";

export default function App() {
  const [friends, setFriends] = useState([]);
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tab, setTabRaw] = useState(() => localStorage.getItem("fr:tab") ?? "plan");
  const setTab = (t) => {
    localStorage.setItem("fr:tab", t);
    setTabRaw(t);
  };
  const [editing, setEditing] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const scrollRestoreRef = useRef(0);

  const friendsRef = useRef(friends);
  const eventsRef = useRef(events);
  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    (async () => {
      try {
        const [fs, evts, acts] = await Promise.all([
          api.getFriends(),
          api.getEvents(),
          api.getActivities(),
        ]);
        setFriends(fs);
        setEvents(evts);
        setActivities(acts);

        // Delta-sync calendar hang dates in the background (server mode + Google connected only)
        if (capabilities.calendar) {
          api
            .syncCalendarHangs()
            .then((result) => {
              if (result?.matched > 0) applyCalendarUpdates(result.updated);
            })
            .catch(() => {}); // 401 = not connected yet; swallow silently
        }
      } catch (err) {
        if (capabilities.server) {
          console.error("Failed to connect to server:", err);
          setError("Can't reach server — is it running? (npm run dev)");
        }
        setFriends([]);
        setEvents([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const applyCalendarUpdates = useCallback((updated) => {
    setFriends((prev) =>
      prev.map((f) => {
        const u = updated.find((x) => x.id === f.id);
        return u ? { ...f, lastHangDate: u.lastHangDate } : f;
      })
    );
  }, []);

  const updateFriend = useCallback((id, fn) => {
    const current = friendsRef.current.find((f) => f.id === id);
    if (!current) return;
    const updated = fn(current);
    setFriends((prev) => prev.map((f) => (f.id === id ? updated : f)));
    api.upsertFriend(updated).catch(console.error);
  }, []);

  const openEditor = useCallback((f) => {
    scrollRestoreRef.current = window.scrollY;
    setEditing(f);
    window.scrollTo(0, 0);
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    requestAnimationFrame(() => window.scrollTo(0, scrollRestoreRef.current));
  }, []);

  const saveFriend = useCallback(
    (data) => {
      const isNew = !data.id;
      const friend = isNew ? { ...EMPTY_FRIEND, ...data, id: `u-${Date.now()}` } : data;
      setFriends((prev) =>
        isNew ? [...prev, friend] : prev.map((f) => (f.id === friend.id ? friend : f))
      );
      api.upsertFriend(friend).catch(console.error);
      closeEditor();
      setTab("friends");
    },
    [closeEditor]
  );

  const deleteFriend = useCallback((id) => {
    setFriends((prev) => prev.filter((f) => f.id !== id));
    api.deleteFriend(id).catch(console.error);
  }, []);

  // Batch-update rankings for multiple friends after a pairwise ranking session.
  // patches: [{ id, rankings }] — merged into each friend's existing shape.
  const batchUpdateFriends = useCallback((patches) => {
    setFriends((prev) =>
      prev.map((f) => {
        const patch = patches.find((p) => p.id === f.id);
        return patch ? { ...f, rankings: patch.rankings } : f;
      })
    );
    patches.forEach((patch) => {
      const current = friendsRef.current.find((f) => f.id === patch.id);
      if (current) {
        api.upsertFriend({ ...current, rankings: patch.rankings }).catch(console.error);
      }
    });
  }, []);

  const addEvent = useCallback((evt) => {
    setEvents((prev) => [...prev, evt]);
    api
      .createEvent(evt)
      .then((result) => {
        if (result?.event) {
          setEvents((prev) => prev.map((e) => (e.id === evt.id ? result.event : e)));
        }
      })
      .catch(console.error);
  }, []);

  const updateEvent = useCallback((id, fn) => {
    const current = eventsRef.current.find((e) => e.id === id);
    if (!current) return;
    const updated = fn(current);
    setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
    api.updateEvent(id, updated).catch(console.error);
  }, []);

  const addActivity = useCallback((label) => {
    api
      .createActivity({ label })
      .then((act) => {
        setActivities((prev) => [...prev, act]);
      })
      .catch(console.error);
  }, []);

  const deleteActivity = useCallback((id) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
    api.deleteActivity(id).catch(console.error);
  }, []);

  const advanceCascade = useCallback((eventId) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const nextQueued = e.invites.find((i) => i.inviteStatus === "queued");
        if (!nextQueued) return e;
        return {
          ...e,
          invites: e.invites.map((i) =>
            i.friendId === nextQueued.friendId ? { ...i, inviteStatus: "invited" } : i
          ),
        };
      })
    );
    api.advanceCascade(eventId).catch(console.error);
  }, []);

  if (!loaded)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#9ca3af",
          fontFamily: "sans-serif",
        }}
      >
        Loading...
      </div>
    );

  const activeCount = friends.filter((f) => f.wantAround === "active").length;
  const needsFinalize = events.filter((e) => !e.finalized && e.date < todayStr()).length;
  const noEmail = friends.filter((f) => f.wantAround === "active" && !f.email).length;

  const TABS = [
    { id: "plan", label: "Plan" },
    { id: "events", label: needsFinalize > 0 ? `Events (${needsFinalize}✱)` : "Events" },
    { id: "friends", label: `Friends (${activeCount})` },
    { id: "add", label: "+ Add" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #f0f0ee",
          paddingTop: 20,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#111827",
              margin: 0,
              letterSpacing: -0.5,
            }}
          >
            📡 Friend Radar
          </h1>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 16px" }}>
            Able × Willing × Trusted
          </p>
          {!capabilities.server && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                background: "#fefce8",
                borderRadius: 10,
                border: "1px solid #fde68a",
                fontSize: 12,
                color: "#92400e",
              }}
            >
              📦 Local mode — data is stored in this browser only and will be lost if you clear
              storage. Use <strong>Export backup</strong> regularly.
            </div>
          )}
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                background: "#fef2f2",
                borderRadius: 10,
                border: "1px solid #fecaca",
                fontSize: 12,
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          )}
          {noEmail > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                background: "#fff7ed",
                borderRadius: 10,
                border: "1px solid #fed7aa",
                fontSize: 12,
                color: "#9a3412",
              }}
            >
              {noEmail} friends missing emails — add them to enable calendar invites
            </div>
          )}
          <div style={{ display: "flex", borderTop: "1px solid #f3f4f6" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  if (t.id !== "add") closeEditor();
                }}
                style={{
                  flex: 1,
                  paddingTop: 11,
                  paddingBottom: 11,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderBottom: tab === t.id ? "2px solid #4f46e5" : "2px solid transparent",
                  color: tab === t.id ? "#4f46e5" : "#9ca3af",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px" }}>
        {tab === "plan" && (
          <PlanTab
            friends={friends}
            events={events}
            activities={activities}
            onCreate={addEvent}
            onAddActivity={addActivity}
            goToEvents={() => setTab("events")}
          />
        )}
        {tab === "events" && (
          <EventsTab
            events={events}
            friends={friends}
            activities={activities}
            onUpdate={updateEvent}
            onAdvanceCascade={advanceCascade}
            goToPlan={() => setTab("plan")}
          />
        )}
        {tab === "friends" && !editing && (
          <FriendsTab
            friends={friends}
            events={events}
            activities={activities}
            onUpdate={updateFriend}
            onEdit={openEditor}
            onDelete={deleteFriend}
            onCalendarSync={applyCalendarUpdates}
            onBatchRankUpdate={batchUpdateFriends}
          />
        )}
        {tab === "friends" && editing && (
          <FriendForm
            initial={editing}
            isEditing={true}
            onSave={saveFriend}
            onCancel={closeEditor}
            onRankingUpdate={batchUpdateFriends}
            friends={friends}
            activities={activities}
            onAddActivity={addActivity}
            onDeleteActivity={deleteActivity}
          />
        )}
        {tab === "add" && (
          <FriendForm
            initial={EMPTY_FRIEND}
            isEditing={false}
            onSave={saveFriend}
            onCancel={() => setTab(friends.length ? "friends" : "plan")}
            onRankingUpdate={batchUpdateFriends}
            friends={friends}
            activities={activities}
            onAddActivity={addActivity}
            onDeleteActivity={deleteActivity}
          />
        )}
      </div>
    </div>
  );
}
