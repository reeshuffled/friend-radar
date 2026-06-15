import { describe, it, expect } from "vitest";
import { scoreFor } from "../client/src/lib/scoring.js";

const baseFriend = {
  id: "f1",
  interests: { "board-games": 4 },
  openness: 3,
  vibe: 3,
  workDrain: "medium",
  socialType: "ambivert",
  comfortLevel: "solo",
  logistics: 3,
  distanceTier: "nearby",
  availSlots: [],
  noticePreference: "few-days",
  reliability: 3,
  responsiveness: 3,
  busyUntil: null,
};

const slot = "weekend-evening";
const events = [];

describe("scoreFor — basic structure", () => {
  it("returns score between 0 and 100", () => {
    const result = scoreFor(baseFriend, "board-games", slot, events);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns willing, able, trust components", () => {
    const result = scoreFor(baseFriend, "board-games", slot, events);
    expect(result.willing).toBeDefined();
    expect(result.able).toBeDefined();
    expect(result.trust).toBeDefined();
  });

  it("higher interest produces higher score", () => {
    const lowInterest  = { ...baseFriend, interests: { "board-games": 1 } };
    const highInterest = { ...baseFriend, interests: { "board-games": 5 } };
    const low  = scoreFor(lowInterest,  "board-games", slot, events).score;
    const high = scoreFor(highInterest, "board-games", slot, events).score;
    expect(high).toBeGreaterThan(low);
  });

  it("busyUntil collapses score to near-zero", () => {
    const future = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const busy = { ...baseFriend, busyUntil: future };
    const result = scoreFor(busy, "board-games", slot, events);
    // busy multiplier is 0.15 so score should be very low
    expect(result.score).toBeLessThan(20);
  });
});

describe("scoreFor — slot matching", () => {
  it("slot mismatch reduces able component", () => {
    const constrainedFriend = { ...baseFriend, availSlots: ["weekday-day"] };
    const match    = scoreFor(constrainedFriend, "board-games", "weekday-day", events);
    const mismatch = scoreFor(constrainedFriend, "board-games", "weekend-evening", events);
    expect(match.able).toBeGreaterThan(mismatch.able);
  });

  it("friend with no slots has no slot constraint", () => {
    const noSlots  = { ...baseFriend, availSlots: [] };
    const withSlot = { ...baseFriend, availSlots: ["weekend-evening"] };
    const r1 = scoreFor(noSlots,  "board-games", "weekend-evening", events);
    const r2 = scoreFor(withSlot, "board-games", "weekend-evening", events);
    expect(r1.able).toBe(r2.able);
  });
});

describe("scoreFor — distance", () => {
  it("local friend scores higher able than far friend", () => {
    const local = { ...baseFriend, distanceTier: "local" };
    const far   = { ...baseFriend, distanceTier: "far" };
    expect(scoreFor(local, "board-games", slot, events).able)
      .toBeGreaterThan(scoreFor(far, "board-games", slot, events).able);
  });
});

describe("scoreFor — trust", () => {
  it("uses slider-based trust when < 2 history points", () => {
    const highRel = { ...baseFriend, reliability: 5, responsiveness: 5 };
    const lowRel  = { ...baseFriend, reliability: 1, responsiveness: 1 };
    expect(scoreFor(highRel, "board-games", slot, events).trust)
      .toBeGreaterThan(scoreFor(lowRel, "board-games", slot, events).trust);
  });

  it("switches to history-based trust with ≥2 invite data points", () => {
    const eventsWithHistory = [
      {
        finalized: true,
        date: "2025-01-01",
        invites: [{ friendId: "f1", response: "yes", inviteStatus: "invited", showed: true }],
      },
      {
        finalized: true,
        date: "2025-02-01",
        invites: [{ friendId: "f1", response: "yes", inviteStatus: "invited", showed: true }],
      },
    ];
    const result = scoreFor(baseFriend, "board-games", slot, eventsWithHistory);
    // With perfect history (always showed), trust should be high
    expect(result.trust).toBeGreaterThan(60);
  });

  it("flaky friend has lower trust than reliable friend", () => {
    const makeHistory = (showed) =>
      [1, 2].map((i) => ({
        finalized: true,
        date: `2025-0${i}-01`,
        invites: [{ friendId: "f1", response: "yes", inviteStatus: "invited", showed }],
      }));

    const reliable = scoreFor(baseFriend, "board-games", slot, makeHistory(true)).trust;
    const flaky    = scoreFor(baseFriend, "board-games", slot, makeHistory(false)).trust;
    expect(reliable).toBeGreaterThan(flaky);
  });
});

describe("scoreFor — comfort level and plus one", () => {
  it("needs-plus1 friend scores higher willing when allowsPlusOne=true", () => {
    const needsPlus = { ...baseFriend, comfortLevel: "needs-plus1" };
    const withPlus    = scoreFor(needsPlus, "board-games", slot, events, true).willing;
    const withoutPlus = scoreFor(needsPlus, "board-games", slot, events, false).willing;
    expect(withPlus).toBeGreaterThan(withoutPlus);
  });
});

describe("scoreFor — notice preference", () => {
  it("short-notice event penalizes friend who needs advance planning", () => {
    const planner = { ...baseFriend, noticePreference: "planned" }; // needs 14 days
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const eventDate = tmrw.toISOString().split("T")[0];

    const withDate    = scoreFor(planner, "board-games", slot, events, false, eventDate).able;
    const withoutDate = scoreFor(planner, "board-games", slot, events, false, null).able;
    expect(withDate).toBeLessThan(withoutDate);
  });
});

describe("scoreFor — recency nudge", () => {
  it("overdue friend gets positive nudge", () => {
    const overdueFriend = { ...baseFriend, targetFreqDays: 14, lastHangDate: "2024-01-01" };
    const freshFriend   = { ...baseFriend, targetFreqDays: 14 };

    const overdue = scoreFor(overdueFriend, "board-games", slot, events).score;
    const noHang  = scoreFor(freshFriend,  "board-games", slot, events).score;

    // Overdue should get a boost (≤+2), fresh with no hang gets +0.8 nudge
    // Both get nudges but overdue should be higher
    expect(overdue).toBeGreaterThanOrEqual(noHang);
  });
});
