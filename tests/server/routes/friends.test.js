import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { resetDb } from "../../../server/db/db.js";
import { upsertFriend } from "../../../server/db/queries.js";

// Stub out the Apple Contacts integration — not available in test env
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

// Import app after mocks are registered
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

describe("GET /api/friends", () => {
  it("returns empty array on fresh DB", async () => {
    const res = await request(app).get("/api/friends");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns all friends ordered by name", async () => {
    upsertFriend(bob);
    upsertFriend(alice);
    const res = await request(app).get("/api/friends");
    expect(res.status).toBe(200);
    expect(res.body.map((f) => f.name)).toEqual(["Alice", "Bob"]);
  });
});

describe("PUT /api/friends/:id", () => {
  it("creates friend when it does not exist", async () => {
    const res = await request(app).put("/api/friends/f1").send(alice);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alice");
  });

  it("updates existing friend", async () => {
    upsertFriend(alice);
    const res = await request(app)
      .put("/api/friends/f1")
      .send({ ...alice, notes: "updated" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("updated");
  });

  it("syncs bidirectional conflicts when conflict is added", async () => {
    upsertFriend(alice);
    upsertFriend(bob);

    await request(app)
      .put("/api/friends/f1")
      .send({ ...alice, conflicts: ["f2"] });

    const res = await request(app).get("/api/friends");
    const bobFetched = res.body.find((f) => f.id === "f2");
    expect(bobFetched.conflicts).toContain("f1");
  });

  it("removes conflict from other side when conflict is removed", async () => {
    upsertFriend({ ...alice, conflicts: ["f2"] });
    upsertFriend({ ...bob, conflicts: ["f1"] });

    await request(app)
      .put("/api/friends/f1")
      .send({ ...alice, conflicts: [] });

    const res = await request(app).get("/api/friends");
    const bobFetched = res.body.find((f) => f.id === "f2");
    expect(bobFetched.conflicts).not.toContain("f1");
  });
});

describe("DELETE /api/friends/:id", () => {
  it("removes the friend", async () => {
    upsertFriend(alice);
    const del = await request(app).delete("/api/friends/f1");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const res = await request(app).get("/api/friends");
    expect(res.body).toEqual([]);
  });

  it("returns ok even for non-existent id", async () => {
    const res = await request(app).delete("/api/friends/nope");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
