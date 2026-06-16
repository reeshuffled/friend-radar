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
  upsertFriend(alice);
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

const eventWithInvite = {
  ...baseEvent,
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

describe("GET /api/events", () => {
  it("returns empty array on fresh DB", async () => {
    const res = await request(app).get("/api/events");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/events/:id", () => {
  it("returns 404 for unknown id", async () => {
    const res = await request(app).get("/api/events/nope");
    expect(res.status).toBe(404);
  });

  it("returns event after creation", async () => {
    await request(app).post("/api/events").send(baseEvent);
    const res = await request(app).get("/api/events/e1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("e1");
    expect(res.body.activityId).toBe("board-games");
  });
});

describe("POST /api/events", () => {
  it("creates event with no invites", async () => {
    const res = await request(app).post("/api/events").send(baseEvent);
    expect(res.status).toBe(201);
    expect(res.body.event.id).toBe("e1");
    expect(res.body.errors).toEqual([]);
  });

  it("creates event and records invite", async () => {
    const res = await request(app).post("/api/events").send(eventWithInvite);
    expect(res.status).toBe(201);
    expect(res.body.event.invites).toHaveLength(1);
    expect(res.body.event.invites[0].friendId).toBe("f1");
  });
});

describe("PUT /api/events/:id", () => {
  it("returns 404 for unknown id", async () => {
    const res = await request(app).put("/api/events/nope").send({ finalized: true });
    expect(res.status).toBe(404);
  });

  it("updates finalized flag", async () => {
    await request(app).post("/api/events").send(baseEvent);
    const res = await request(app).put("/api/events/e1").send({ finalized: true });
    expect(res.status).toBe(200);
    expect(res.body.finalized).toBe(true);
  });

  it("updates invite response via body.invites", async () => {
    await request(app).post("/api/events").send(eventWithInvite);
    const res = await request(app)
      .put("/api/events/e1")
      .send({ invites: [{ friendId: "f1", response: "yes" }] });
    expect(res.status).toBe(200);
    expect(res.body.invites[0].response).toBe("yes");
  });
});

describe("PATCH /api/events/:id/invites/:friendId/response", () => {
  it("returns 400 for invalid response value", async () => {
    await request(app).post("/api/events").send(eventWithInvite);
    const res = await request(app)
      .patch("/api/events/e1/invites/f1/response")
      .send({ response: "sure" });
    expect(res.status).toBe(400);
  });

  it("updates response to a valid value", async () => {
    await request(app).post("/api/events").send(eventWithInvite);
    const res = await request(app)
      .patch("/api/events/e1/invites/f1/response")
      .send({ response: "maybe" });
    expect(res.status).toBe(200);
    expect(res.body.invites[0].response).toBe("maybe");
  });

  it("returns 404 when event does not exist", async () => {
    const res = await request(app)
      .patch("/api/events/nope/invites/f1/response")
      .send({ response: "yes" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/events/:id/advance", () => {
  it("returns 404 for unknown event", async () => {
    const res = await request(app).post("/api/events/nope/advance");
    expect(res.status).toBe(404);
  });

  it("returns advanced=false when no queued invites", async () => {
    await request(app).post("/api/events").send(eventWithInvite);
    const res = await request(app).post("/api/events/e1/advance");
    expect(res.status).toBe(200);
    expect(res.body.advanced).toBe(false);
  });

  it("advances first queued invite to invited", async () => {
    const cascadeEvent = {
      ...baseEvent,
      cascade: true,
      invites: [
        { ...eventWithInvite.invites[0], inviteStatus: "invited" },
        {
          friendId: "f1",
          response: "pending",
          showed: null,
          inviteStatus: "queued",
          queuePosition: 2,
          inviteSentAt: null,
          inviteChannel: "email",
          attendingLegs: null,
        },
      ],
    };
    // Need a second friend for the queued slot
    upsertFriend({ ...alice, id: "f2", name: "Bob", email: "bob@example.com" });
    const cascadeWithBob = {
      ...cascadeEvent,
      invites: [
        { ...eventWithInvite.invites[0] },
        {
          friendId: "f2",
          response: "pending",
          showed: null,
          inviteStatus: "queued",
          queuePosition: 2,
          inviteSentAt: null,
          inviteChannel: "email",
          attendingLegs: null,
        },
      ],
    };
    await request(app).post("/api/events").send(cascadeWithBob);
    const res = await request(app).post("/api/events/e1/advance");
    expect(res.status).toBe(200);
    expect(res.body.advanced).toBe(true);
    expect(res.body.to).toBe("Bob");
  });
});
