import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../../server/db/db.js";
import {
  getAllFriends,
  getFriend,
  upsertFriend,
  deleteFriend,
  bulkUpsertFriends,
  getAllEvents,
  getEvent,
  createEvent,
  updateEventFields,
  updateInviteResponse,
  updateInviteStatus,
  updateInviteShowed,
  getActiveCascadeEvents,
} from "../../server/db/queries.js";

// Each test gets a fresh in-memory database (DB_PATH=':memory:' set in setup.js).
beforeEach(() => {
  resetDb();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const alice = {
  id: "f1",
  name: "Alice",
  email: "alice@example.com",
  contact: "",
  notes: "",
  status: "Friend",
  groups: [],
  wantAround: "active",
  busyUntil: null,
  reliability: 3,
  responsiveness: 3,
  vibe: 4,
  openness: 3,
  logistics: 3,
  interests: { "board-games": 5 },
  availSlots: ["weekend-evening"],
  targetFreqDays: null,
  noticePreference: "few-days",
  distanceTier: "nearby",
  socialType: "ambivert",
  workDrain: "medium",
  comfortLevel: "solo",
  lastHangDate: null,
  homeLocation: null,
  conflicts: [],
  synergies: [],
};

const bob = { ...alice, id: "f2", name: "Bob", email: "bob@example.com" };

const boardGamesEvent = {
  id: "e1",
  activityId: "board-games",
  date: "2025-06-20",
  startTime: "19:00",
  endTime: "22:00",
  location: "My place",
  cascade: false,
  maxCapacity: null,
  plusOneAllowed: false,
  soloAnchor: false,
  finalized: false,
  rating: null,
  notes: "",
  gcalEventId: null,
  createdAt: "2025-06-14",
  legs: null,
  invites: [
    {
      friendId: "f1",
      response: "pending",
      showed: null,
      inviteStatus: "invited",
      queuePosition: 1,
      inviteSentAt: null,
      inviteChannel: "email",
      attendingLegs: null,
    },
  ],
};

// ── Friends ───────────────────────────────────────────────────────────────────

describe("friends queries", () => {
  it("getAllFriends returns empty array on fresh DB", () => {
    expect(getAllFriends()).toEqual([]);
  });

  it("upsertFriend + getFriend round-trips correctly", () => {
    upsertFriend(alice);
    const fetched = getFriend("f1");
    expect(fetched.name).toBe("Alice");
    expect(fetched.email).toBe("alice@example.com");
    expect(fetched.interests).toEqual({ "board-games": 5 });
    expect(fetched.availSlots).toEqual(["weekend-evening"]);
    expect(fetched.wantAround).toBe("active");
    expect(fetched.busyUntil).toBe(null);
  });

  it("upsertFriend updates existing friend", () => {
    upsertFriend(alice);
    upsertFriend({ ...alice, name: "Alice Updated", email: "new@example.com" });
    const fetched = getFriend("f1");
    expect(fetched.name).toBe("Alice Updated");
    expect(fetched.email).toBe("new@example.com");
  });

  it("getFriend returns null for missing id", () => {
    expect(getFriend("nonexistent")).toBe(null);
  });

  it("deleteFriend removes friend", () => {
    upsertFriend(alice);
    deleteFriend("f1");
    expect(getFriend("f1")).toBe(null);
    expect(getAllFriends()).toEqual([]);
  });

  it("getAllFriends returns all inserted friends ordered by name", () => {
    upsertFriend(bob);
    upsertFriend(alice);
    const all = getAllFriends();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Alice");
    expect(all[1].name).toBe("Bob");
  });

  it("bulkUpsertFriends inserts multiple friends", () => {
    bulkUpsertFriends([alice, bob]);
    expect(getAllFriends()).toHaveLength(2);
  });

  it("bulkUpsertFriends is idempotent", () => {
    bulkUpsertFriends([alice, bob]);
    bulkUpsertFriends([alice, bob]); // second call must not throw or corrupt data
    const all = getAllFriends();
    expect(all).toHaveLength(2);
    expect(all.find((f) => f.id === "f1").name).toBe("Alice");
  });

  it("upsertFriend persists conflicts and synergies", () => {
    upsertFriend({ ...alice, conflicts: ["f2"], synergies: [] });
    upsertFriend(bob);
    const fetched = getFriend("f1");
    expect(fetched.conflicts).toEqual(["f2"]);
    expect(fetched.synergies).toEqual([]);
  });
});

// ── Events ────────────────────────────────────────────────────────────────────

describe("events queries", () => {
  beforeEach(() => {
    upsertFriend(alice);
    upsertFriend(bob);
  });

  it("getAllEvents returns empty array on fresh DB", () => {
    expect(getAllEvents()).toEqual([]);
  });

  it("createEvent + getEvent round-trips correctly", () => {
    createEvent(boardGamesEvent);
    const fetched = getEvent("e1");
    expect(fetched.id).toBe("e1");
    expect(fetched.activityId).toBe("board-games");
    expect(fetched.cascade).toBe(false);
    expect(fetched.invites).toHaveLength(1);
    expect(fetched.invites[0].friendId).toBe("f1");
    expect(fetched.invites[0].response).toBe("pending");
  });

  it("getEvent returns null for missing event", () => {
    expect(getEvent("nonexistent")).toBe(null);
  });

  it("updateEventFields updates specific columns", () => {
    createEvent(boardGamesEvent);
    updateEventFields("e1", { finalized: 1, rating: 4 });
    const updated = getEvent("e1");
    expect(updated.finalized).toBe(true);
    expect(updated.rating).toBe(4);
  });

  it("updateInviteResponse changes response", () => {
    createEvent(boardGamesEvent);
    updateInviteResponse("e1", "f1", "yes");
    const event = getEvent("e1");
    expect(event.invites[0].response).toBe("yes");
  });

  it("updateInviteStatus changes status and sentAt", () => {
    createEvent(boardGamesEvent);
    const sentAt = Date.now();
    updateInviteStatus("e1", "f1", "invited", sentAt);
    const event = getEvent("e1");
    expect(event.invites[0].inviteStatus).toBe("invited");
    expect(event.invites[0].inviteSentAt).toBe(sentAt);
  });

  it("updateInviteShowed sets showed flag", () => {
    createEvent(boardGamesEvent);
    updateInviteShowed("e1", "f1", true);
    expect(getEvent("e1").invites[0].showed).toBe(true);

    updateInviteShowed("e1", "f1", false);
    expect(getEvent("e1").invites[0].showed).toBe(false);

    updateInviteShowed("e1", "f1", null);
    expect(getEvent("e1").invites[0].showed).toBe(null);
  });

  it("createEvent persists legs correctly", () => {
    const legs = [
      { id: "leg-1", label: "Pre-drinks", startTime: "18:00", endTime: "19:30", location: "" },
      { id: "leg-2", label: "Main", startTime: "19:30", endTime: "22:00", location: "" },
    ];
    const eventWithLegs = {
      ...boardGamesEvent,
      id: "e-legs",
      legs,
      invites: [{ ...boardGamesEvent.invites[0], attendingLegs: ["leg-2"] }],
    };
    createEvent(eventWithLegs);
    const fetched = getEvent("e-legs");
    expect(fetched.legs).toEqual(legs);
    expect(fetched.invites[0].attendingLegs).toEqual(["leg-2"]);
  });
});

// ── getActiveCascadeEvents ────────────────────────────────────────────────────

describe("getActiveCascadeEvents", () => {
  beforeEach(() => {
    upsertFriend(alice);
  });

  it("returns only non-finalized cascade events", () => {
    const cascadeEvent = { ...boardGamesEvent, id: "e-cascade", cascade: true };
    const normalEvent = { ...boardGamesEvent, id: "e-normal", cascade: false };
    const finalizedCascade = {
      ...boardGamesEvent,
      id: "e-finalized",
      cascade: true,
      finalized: true,
      invites: [{ ...boardGamesEvent.invites[0] }],
    };

    createEvent(cascadeEvent);
    createEvent(normalEvent);
    createEvent(finalizedCascade);
    updateEventFields("e-finalized", { finalized: 1 });

    const active = getActiveCascadeEvents();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("e-cascade");
  });

  it("returns empty array when no active cascade events", () => {
    createEvent(boardGamesEvent); // cascade: false
    expect(getActiveCascadeEvents()).toHaveLength(0);
  });
});
