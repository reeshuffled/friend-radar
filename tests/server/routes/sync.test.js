import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { resetDb } from "../../../server/db/db.js";
import { upsertFriend } from "../../../server/db/queries.js";

vi.mock("../../../server/imessage.js", () => ({
  syncAppleContacts: vi.fn().mockResolvedValue([]),
  sendIMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../server/google.js", () => ({
  createCalendarEvent: vi.fn().mockResolvedValue("gcal-id-123"),
  addAttendeesToCalendarEvent: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../server/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

const { default: app } = await import("../../../server/app.js");

beforeEach(() => {
  resetDb();
});

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
  interests: {},
  availSlots: [],
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

const baseEvent = {
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
  invites: [],
};

describe("GET /api/sync", () => {
  it("returns empty friends and events on fresh DB", async () => {
    const res = await request(app).get("/api/sync");
    expect(res.status).toBe(200);
    expect(res.body.friends).toEqual([]);
    expect(res.body.events).toEqual([]);
  });

  it("returns existing data", async () => {
    upsertFriend(alice);
    const res = await request(app).get("/api/sync");
    expect(res.body.friends).toHaveLength(1);
    expect(res.body.friends[0].name).toBe("Alice");
  });
});

describe("POST /api/sync", () => {
  it("inserts new friends and events from client state", async () => {
    const res = await request(app)
      .post("/api/sync")
      .send({ friends: [alice], events: [baseEvent] });
    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(1);
    expect(res.body.events).toHaveLength(1);
  });

  it("is idempotent — posting same data twice does not duplicate", async () => {
    await request(app).post("/api/sync").send({ friends: [alice], events: [baseEvent] });
    const res = await request(app)
      .post("/api/sync")
      .send({ friends: [alice], events: [baseEvent] });
    expect(res.body.friends).toHaveLength(1);
    expect(res.body.events).toHaveLength(1);
  });

  it("updates an existing friend with incoming data", async () => {
    upsertFriend({ ...alice, notes: "old note" });
    const res = await request(app)
      .post("/api/sync")
      .send({ friends: [{ ...alice, notes: "new note" }], events: [] });
    expect(res.body.friends[0].notes).toBe("new note");
  });

  it("accepts empty payload gracefully", async () => {
    const res = await request(app).post("/api/sync").send({});
    expect(res.status).toBe(200);
    expect(res.body.friends).toEqual([]);
    expect(res.body.events).toEqual([]);
  });
});
