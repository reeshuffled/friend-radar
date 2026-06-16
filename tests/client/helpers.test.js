import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  daysSince,
  getEventSlot,
  flakeStats,
  recencyBadge,
  effectiveLastHang,
  lastHangFromEvents,
  formatTime,
  synergyBetween,
} from "../../client/src/lib/helpers.js";

// ── daysSince ────────────────────────────────────────────────────────────────

describe("daysSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for null input", () => {
    expect(daysSince(null)).toBe(null);
  });

  it("returns 0 for today's date", () => {
    expect(daysSince("2026-06-15")).toBe(0);
  });

  it("returns correct days for past date", () => {
    expect(daysSince("2026-06-08")).toBe(7);
  });
});

// ── getEventSlot ─────────────────────────────────────────────────────────────

describe("getEventSlot", () => {
  it("weekday evening", () => {
    // 2025-01-06 is a Monday
    expect(getEventSlot("2025-01-06", "19:00")).toBe("weekday-evening");
  });

  it("weekday day", () => {
    expect(getEventSlot("2025-01-06", "14:00")).toBe("weekday-day");
  });

  it("weekend evening", () => {
    // 2025-01-04 is a Saturday
    expect(getEventSlot("2025-01-04", "20:00")).toBe("weekend-evening");
  });

  it("weekend day", () => {
    expect(getEventSlot("2025-01-04", "10:00")).toBe("weekend-day");
  });

  it("defaults to weekday-evening when no date provided", () => {
    expect(getEventSlot(null, null)).toBe("weekday-evening");
  });
});

// ── formatTime ───────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("converts 13:30 to 1:30 PM", () => {
    expect(formatTime("13:30")).toBe("1:30 PM");
  });

  it("converts 08:00 to 8:00 AM", () => {
    expect(formatTime("08:00")).toBe("8:00 AM");
  });

  it("converts 12:00 to 12:00 PM", () => {
    expect(formatTime("12:00")).toBe("12:00 PM");
  });

  it("returns empty string for null", () => {
    expect(formatTime(null)).toBe("");
  });
});

// ── flakeStats ───────────────────────────────────────────────────────────────

const makeEvent = (finalized, invites) => ({ finalized, invites });
const makeInvite = (friendId, response, inviteStatus = "invited", showed = null) => ({
  friendId,
  response,
  inviteStatus,
  showed,
});

describe("flakeStats", () => {
  it("returns null when friend has no invites", () => {
    const events = [makeEvent(true, [makeInvite("f2", "yes", "invited", true)])];
    expect(flakeStats("f1", events)).toBe(null);
  });

  it("computes yes rate correctly", () => {
    const events = [
      makeEvent(true, [makeInvite("f1", "yes", "invited", true)]),
      makeEvent(false, [makeInvite("f1", "pending")]),
      makeEvent(false, [makeInvite("f1", "no")]),
    ];
    const stats = flakeStats("f1", events);
    expect(stats.total).toBe(3);
    expect(stats.yesRate).toBeCloseTo(1 / 3);
  });

  it("computes flake rate from finalized events", () => {
    const events = [
      makeEvent(true, [makeInvite("f1", "yes", "invited", false)]), // said yes, didn't show
      makeEvent(true, [makeInvite("f1", "yes", "invited", true)]), // said yes, showed
    ];
    const stats = flakeStats("f1", events);
    expect(stats.flakeRate).toBe(0.5);
    expect(stats.flaked).toBe(1);
    expect(stats.showed).toBe(1);
  });

  it("computes ghost rate", () => {
    const events = [
      makeEvent(false, [makeInvite("f1", "ghosted")]),
      makeEvent(false, [makeInvite("f1", "yes")]),
    ];
    const stats = flakeStats("f1", events);
    expect(stats.ghostRate).toBe(0.5);
    expect(stats.ghostedN).toBe(1);
  });

  it("ignores queued invites", () => {
    const events = [
      makeEvent(false, [makeInvite("f1", "pending", "queued")]),
      makeEvent(false, [makeInvite("f1", "yes", "invited")]),
    ];
    const stats = flakeStats("f1", events);
    expect(stats.total).toBe(1); // queued is excluded
  });
});

// ── lastHangFromEvents ────────────────────────────────────────────────────────

describe("lastHangFromEvents", () => {
  it("returns null when no finalized events", () => {
    const events = [makeEvent(false, [makeInvite("f1", "yes", "invited", true)])];
    expect(lastHangFromEvents("f1", events)).toBe(null);
  });

  it("returns the most recent date where friend showed", () => {
    const events = [
      { finalized: true, date: "2025-01-01", invites: [makeInvite("f1", "yes", "invited", true)] },
      { finalized: true, date: "2025-03-01", invites: [makeInvite("f1", "yes", "invited", true)] },
      { finalized: true, date: "2025-02-01", invites: [makeInvite("f1", "yes", "invited", true)] },
    ];
    expect(lastHangFromEvents("f1", events)).toBe("2025-03-01");
  });

  it("excludes events where friend did not show", () => {
    const events = [
      { finalized: true, date: "2025-01-01", invites: [makeInvite("f1", "yes", "invited", false)] },
    ];
    expect(lastHangFromEvents("f1", events)).toBe(null);
  });
});

// ── effectiveLastHang ─────────────────────────────────────────────────────────

describe("effectiveLastHang", () => {
  it("returns manual date when no event history", () => {
    const friend = { id: "f1", lastHangDate: "2025-01-01" };
    expect(effectiveLastHang(friend, [])).toBe("2025-01-01");
  });

  it("returns most recent of manual and event-derived date", () => {
    const friend = { id: "f1", lastHangDate: "2025-01-01" };
    const events = [
      { finalized: true, date: "2025-06-01", invites: [makeInvite("f1", "yes", "invited", true)] },
    ];
    expect(effectiveLastHang(friend, events)).toBe("2025-06-01");
  });

  it("prefers manual date if more recent", () => {
    const friend = { id: "f1", lastHangDate: "2025-12-01" };
    const events = [
      { finalized: true, date: "2025-06-01", invites: [makeInvite("f1", "yes", "invited", true)] },
    ];
    expect(effectiveLastHang(friend, events)).toBe("2025-12-01");
  });
});

// ── recencyBadge ──────────────────────────────────────────────────────────────

describe("recencyBadge", () => {
  it("returns null when no targetFreqDays and recently seen", () => {
    const recent = new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0];
    expect(recencyBadge(null, recent)).toBe(null);
  });

  it("returns 'Never hung' badge when no lastHang", () => {
    const badge = recencyBadge(30, null);
    expect(badge.text).toBe("Never hung");
  });

  it("returns overdue badge when significantly past due", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 50);
    const badge = recencyBadge(30, pastDate.toISOString().split("T")[0]);
    expect(badge.text).toMatch(/overdue/);
  });

  it("returns 'Due now' when just past frequency", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 31);
    const badge = recencyBadge(30, pastDate.toISOString().split("T")[0]);
    expect(badge.text).toBe("Due now");
  });
});

// ── synergyBetween ────────────────────────────────────────────────────────────

describe("synergyBetween", () => {
  const makeCoEvent = (id, friendIds, rating, finalized = true) => ({
    id,
    finalized,
    rating,
    invites: friendIds.map((fid) => ({ friendId: fid, showed: true })),
  });

  it("returns null when no co-attended events", () => {
    const events = [makeCoEvent("e1", ["f1"], 5), makeCoEvent("e2", ["f2"], 4)];
    expect(synergyBetween("f1", "f2", events)).toBe(null);
  });

  it("returns null when co-attended but event not finalized", () => {
    const events = [{ ...makeCoEvent("e1", ["f1", "f2"], 5), finalized: false }];
    expect(synergyBetween("f1", "f2", events)).toBe(null);
  });

  it("returns count with null score when co-attended but no rating", () => {
    const events = [makeCoEvent("e1", ["f1", "f2"], null)];
    const result = synergyBetween("f1", "f2", events);
    expect(result).not.toBe(null);
    expect(result.count).toBe(1);
    expect(result.score).toBe(null);
  });

  it("returns averaged score from rated co-attended events", () => {
    const events = [makeCoEvent("e1", ["f1", "f2"], 4), makeCoEvent("e2", ["f1", "f2"], 5)];
    const result = synergyBetween("f1", "f2", events);
    expect(result.score).toBe(4.5);
    expect(result.count).toBe(2);
  });

  it("ignores showed=false invites", () => {
    const events = [
      {
        id: "e1",
        finalized: true,
        rating: 5,
        invites: [
          { friendId: "f1", showed: true },
          { friendId: "f2", showed: false },
        ],
      },
    ];
    expect(synergyBetween("f1", "f2", events)).toBe(null);
  });
});
