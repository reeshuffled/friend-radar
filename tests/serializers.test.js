import { describe, it, expect } from "vitest";
import {
  friendShapeToRow,
  friendRowToShape,
  eventShapeToRow,
  eventRowToShape,
  inviteShapeToRow,
  inviteRowToShape,
} from "../server/db/serializers.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseFriendShape = {
  id: "f1",
  name: "Alice",
  email: "alice@example.com",
  phone: "",
  preferredChannel: "email",
  contact: "555-1234",
  notes: "Loves board games",
  status: "Friend",
  groups: ["College"],
  wantAround: 'active',
  busyUntil: null,
  reliability: 4,
  responsiveness: 3,
  vibe: 5,
  openness: 3,
  logistics: 2,
  interests: { "board-games": 5, hiking: 3 },
  availSlots: ["weekend-evening"],
  targetFreqDays: 14,
  noticePreference: "few-days",
  distanceTier: "nearby",
  socialType: "introvert",
  workDrain: "high",
  comfortLevel: "solo",
  lastHangDate: "2025-01-15",
  homeLocation: null,
  conflicts: [],
  synergies: [],
};

const baseEventShape = {
  id: "e1",
  activityId: "board-games",
  date: "2025-06-20",
  startTime: "19:00",
  endTime: "22:00",
  location: "My place",
  cascade: true,
  maxCapacity: 4,
  plusOneAllowed: false,
  soloAnchor: true,
  finalized: false,
  rating: null,
  notes: "",
  gcalEventId: null,
  createdAt: "2025-06-14",
  legs: null,
};

const baseInviteShape = {
  friendId: "f1",
  response: "pending",
  showed: null,
  inviteStatus: "invited",
  queuePosition: 1,
  inviteSentAt: 1718300000000,
  inviteChannel: "email",
  attendingLegs: null,
};

// ── Friends ───────────────────────────────────────────────────────────────────

describe("friendShapeToRow / friendRowToShape", () => {
  it("round-trips without data loss", () => {
    const row   = friendShapeToRow(baseFriendShape);
    const shape = friendRowToShape(row);

    expect(shape.id).toBe(baseFriendShape.id);
    expect(shape.name).toBe(baseFriendShape.name);
    expect(shape.email).toBe(baseFriendShape.email);
    expect(shape.groups).toEqual(baseFriendShape.groups);
    expect(shape.interests).toEqual(baseFriendShape.interests);
    expect(shape.availSlots).toEqual(baseFriendShape.availSlots);
    expect(shape.wantAround).toBe('active');
    expect(shape.busyUntil).toBe(null);
    expect(shape.targetFreqDays).toBe(14);
    expect(shape.lastHangDate).toBe("2025-01-15");
    expect(shape.phone).toBe("");
    expect(shape.preferredChannel).toBe("email");
    expect(shape.conflicts).toEqual([]);
    expect(shape.synergies).toEqual([]);
  });

  it("serializes wantAround and busyUntil", () => {
    const row = friendShapeToRow(baseFriendShape);
    expect(row.want_around).toBe('active');
    expect(row.busy_until).toBe(null);
  });

  it("round-trips busyUntil date string", () => {
    const row   = friendShapeToRow({ ...baseFriendShape, busyUntil: "2026-12-31" });
    const shape = friendRowToShape(row);
    expect(row.busy_until).toBe("2026-12-31");
    expect(shape.busyUntil).toBe("2026-12-31");
  });

  it("serializes arrays and objects as JSON strings", () => {
    const row = friendShapeToRow(baseFriendShape);
    expect(typeof row.groups_json).toBe("string");
    expect(typeof row.interests_json).toBe("string");
    expect(typeof row.avail_slots_json).toBe("string");
    expect(JSON.parse(row.groups_json)).toEqual(["College"]);
  });

  it("applies defaults for missing fields", () => {
    const minimal = { id: "f2", name: "Bob" };
    const row = friendShapeToRow(minimal);
    expect(row.email).toBe("");
    expect(row.want_around).toBe('active');
    expect(row.reliability).toBe(3);
    expect(JSON.parse(row.groups_json)).toEqual([]);
    expect(JSON.parse(row.interests_json)).toEqual({});
  });

  it("round-trips conflicts and synergies", () => {
    const shape = { ...baseFriendShape, conflicts: ["f2", "f3"], synergies: ["f4"] };
    const row = friendShapeToRow(shape);
    expect(typeof row.conflicts_json).toBe("string");
    const back = friendRowToShape(row);
    expect(back.conflicts).toEqual(["f2", "f3"]);
    expect(back.synergies).toEqual(["f4"]);
  });
});

// ── Events ────────────────────────────────────────────────────────────────────

describe("eventShapeToRow / eventRowToShape", () => {
  it("round-trips without data loss", () => {
    const row   = eventShapeToRow(baseEventShape);
    const shape = eventRowToShape(row);

    expect(shape.id).toBe("e1");
    expect(shape.activityId).toBe("board-games");
    expect(shape.date).toBe("2025-06-20");
    expect(shape.cascade).toBe(true);
    expect(shape.soloAnchor).toBe(true);
    expect(shape.finalized).toBe(false);
    expect(shape.maxCapacity).toBe(4);
    expect(shape.invites).toEqual([]);
    expect(shape.legs).toBe(null);
  });

  it("round-trips event with legs", () => {
    const legs = [
      { id: "leg-1", label: "Pre-drinks", startTime: "18:00", endTime: "19:30", location: "Bar X" },
      { id: "leg-2", label: "Concert",    startTime: "19:30", endTime: "22:00", location: "Venue Y" },
    ];
    const row   = eventShapeToRow({ ...baseEventShape, legs });
    expect(typeof row.legs_json).toBe("string");
    const shape = eventRowToShape(row);
    expect(shape.legs).toEqual(legs);
  });

  it("converts cascade/finalized booleans to 0/1", () => {
    const row = eventShapeToRow(baseEventShape);
    expect(row.cascade).toBe(1);
    expect(row.finalized).toBe(0);
    expect(row.solo_anchor).toBe(1);
    expect(row.plus_one_allowed).toBe(0);
  });
});

// ── Invites ───────────────────────────────────────────────────────────────────

describe("inviteShapeToRow / inviteRowToShape", () => {
  it("round-trips without data loss", () => {
    const row   = inviteShapeToRow("e1", baseInviteShape, 1);
    const shape = inviteRowToShape(row);

    expect(shape.friendId).toBe("f1");
    expect(shape.response).toBe("pending");
    expect(shape.showed).toBe(null);
    expect(shape.inviteStatus).toBe("invited");
    expect(shape.inviteChannel).toBe("email");
  });

  it("converts showed null correctly", () => {
    const row = inviteShapeToRow("e1", { ...baseInviteShape, showed: null }, 1);
    expect(row.showed).toBe(null);
    expect(inviteRowToShape(row).showed).toBe(null);
  });

  it("converts showed true/false to 1/0", () => {
    const rowTrue  = inviteShapeToRow("e1", { ...baseInviteShape, showed: true }, 1);
    const rowFalse = inviteShapeToRow("e1", { ...baseInviteShape, showed: false }, 1);
    expect(rowTrue.showed).toBe(1);
    expect(rowFalse.showed).toBe(0);
    expect(inviteRowToShape(rowTrue).showed).toBe(true);
    expect(inviteRowToShape(rowFalse).showed).toBe(false);
  });

  it("round-trips attendingLegs", () => {
    const inv = { ...baseInviteShape, attendingLegs: ["leg-1"] };
    const row = inviteShapeToRow("e1", inv, 1);
    expect(typeof row.attending_legs_json).toBe("string");
    const shape = inviteRowToShape(row);
    expect(shape.attendingLegs).toEqual(["leg-1"]);
  });

  it("stores null attendingLegs as null", () => {
    const row = inviteShapeToRow("e1", baseInviteShape, 1);
    expect(row.attending_legs_json).toBe(null);
    expect(inviteRowToShape(row).attendingLegs).toBe(null);
  });
});
