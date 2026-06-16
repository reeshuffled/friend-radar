import { describe, it, expect } from "vitest";
import {
  RANKED_ATTRS,
  rankedOrder,
  startComparisonSession,
  nextComparison,
  applyComparison,
  reRank,
  interpolate,
  buildRankingWrites,
  reorder,
} from "../../client/src/lib/ranking.js";

// ── Config ────────────────────────────────────────────────────────────────────

describe("RANKED_ATTRS", () => {
  it("includes reliability", () => {
    expect(RANKED_ATTRS.some((a) => a.key === "reliability")).toBe(true);
  });
  it("each entry has key and prompt", () => {
    for (const a of RANKED_ATTRS) {
      expect(typeof a.key).toBe("string");
      expect(typeof a.prompt).toBe("string");
    }
  });
});

// ── rankedOrder ───────────────────────────────────────────────────────────────

describe("rankedOrder", () => {
  const friends = [
    { id: "a", rankings: { reliability: 8.0 } },
    { id: "b", rankings: { reliability: 6.0 } },
    { id: "c", rankings: { reliability: 10.0 } },
    { id: "d", rankings: {} }, // no reliability ranking yet
  ];

  it("returns ids sorted best→worst", () => {
    expect(rankedOrder(friends, "reliability")).toEqual(["c", "a", "b"]);
  });

  it("excludes friends with no ranking for that attr", () => {
    const order = rankedOrder(friends, "reliability");
    expect(order).not.toContain("d");
  });

  it("breaks ties by id ascending (deterministic)", () => {
    const tied = [
      { id: "z", rankings: { reliability: 5.0 } },
      { id: "a", rankings: { reliability: 5.0 } },
      { id: "m", rankings: { reliability: 5.0 } },
    ];
    expect(rankedOrder(tied, "reliability")).toEqual(["a", "m", "z"]);
  });

  it("returns empty array when no friends have rankings", () => {
    expect(rankedOrder([{ id: "x", rankings: {} }], "reliability")).toEqual([]);
  });
});

// ── comparison session ────────────────────────────────────────────────────────

describe("startComparisonSession", () => {
  it("empty list → done immediately with single-item finalOrder", () => {
    const s = startComparisonSession([], "new");
    expect(s.done).toBe(true);
    expect(s.finalOrder).toEqual(["new"]);
  });

  it("non-empty list → not done, lo=0, hi=length", () => {
    const s = startComparisonSession(["a", "b", "c"], "new");
    expect(s.done).toBe(false);
    expect(s.lo).toBe(0);
    expect(s.hi).toBe(3);
    expect(s.finalOrder).toBeNull();
  });
});

describe("nextComparison", () => {
  it("returns { a: newId, b: midId } when not done", () => {
    const s = startComparisonSession(["a", "b", "c"], "new");
    const cmp = nextComparison(s);
    expect(cmp.a).toBe("new");
    expect(cmp.b).toBe("b"); // mid = (0+3)>>1 = 1 → orderedIds[1] = "b"
  });

  it("returns null when session is done", () => {
    const s = startComparisonSession([], "new");
    expect(nextComparison(s)).toBeNull();
  });
});

// ── applyComparison ───────────────────────────────────────────────────────────

describe("applyComparison — insertion positions", () => {
  // Helper: run a scripted sequence of newWins answers and return finalOrder
  function runSession(orderedIds, newId, answers) {
    let s = startComparisonSession(orderedIds, newId);
    for (const ans of answers) {
      expect(s.done).toBe(false);
      s = applyComparison(s, ans);
    }
    expect(s.done).toBe(true);
    return s.finalOrder;
  }

  it("inserts at front when new always wins", () => {
    // 3-item list, always beats probe → ends up at position 0
    const result = runSession(["a", "b", "c"], "new", [true, true]);
    expect(result[0]).toBe("new");
  });

  it("inserts at end when new never wins", () => {
    const result = runSession(["a", "b", "c"], "new", [false, false]);
    expect(result[result.length - 1]).toBe("new");
  });

  it("inserts in middle correctly (3-item list, position 1)", () => {
    // list: [a, b, c], new beats b (mid=1) → hi=1; then lo=hi=0 wait...
    // actually: lo=0,hi=3, mid=1, new wins → hi=1; lo=0,hi=1, mid=0, new loses → lo=1; lo=hi=1 → done
    const result = runSession(["a", "b", "c"], "new", [true, false]);
    expect(result).toEqual(["a", "new", "b", "c"]);
  });

  it("single-item list: new wins → position 0", () => {
    const result = runSession(["a"], "new", [true]);
    expect(result).toEqual(["new", "a"]);
  });

  it("single-item list: new loses → position 1", () => {
    const result = runSession(["a"], "new", [false]);
    expect(result).toEqual(["a", "new"]);
  });

  it("does not mutate original orderedIds", () => {
    const orig = ["a", "b", "c"];
    const copy = [...orig];
    let s = startComparisonSession(orig, "new");
    while (!s.done) s = applyComparison(s, true);
    expect(orig).toEqual(copy);
  });
});

// ── minimal comparison count ──────────────────────────────────────────────────

describe("comparison count = ⌈log₂(N+1)⌉", () => {
  function countComparisons(n) {
    // Use a scripted sequence that always says "new loses" to reach the max depth
    const orderedIds = Array.from({ length: n }, (_, i) => `f${i}`);
    let s = startComparisonSession(orderedIds, "new");
    let count = 0;
    while (!s.done) {
      s = applyComparison(s, false); // always loses → worst case path
      count++;
    }
    return count;
  }

  for (const [n, expected] of [
    [1, 1],
    [3, 2],
    [7, 3],
    [15, 4],
  ]) {
    it(`N=${n} → ${expected} comparison(s)`, () => {
      expect(countComparisons(n)).toBe(expected);
    });
  }
});

// ── reRank ────────────────────────────────────────────────────────────────────

describe("reRank", () => {
  it("removes movingId from the order before starting a new session", () => {
    const friends = [
      { id: "a", rankings: { reliability: 10.0 } },
      { id: "b", rankings: { reliability: 6.0 } },
      { id: "c", rankings: { reliability: 2.0 } },
    ];
    const s = reRank(friends, "reliability", "b");
    expect(s.orderedIds).toEqual(["a", "c"]);
    expect(s.newId).toBe("b");
    expect(s.done).toBe(false);
  });

  it("re-inserts at new position correctly", () => {
    const friends = [
      { id: "a", rankings: { reliability: 10.0 } },
      { id: "b", rankings: { reliability: 6.0 } },
      { id: "c", rankings: { reliability: 2.0 } },
    ];
    // Move "a" (best) to bottom: it always loses
    let s = reRank(friends, "reliability", "a");
    while (!s.done) s = applyComparison(s, false);
    expect(s.finalOrder).toEqual(["b", "c", "a"]);
  });
});

// ── interpolate ───────────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("empty → empty object", () => {
    expect(interpolate([])).toEqual({});
  });

  it("single item → 6.0", () => {
    expect(interpolate(["a"])).toEqual({ a: 6.0 });
  });

  it("two items → 10.0 and 2.0", () => {
    expect(interpolate(["a", "b"])).toEqual({ a: 10.0, b: 2.0 });
  });

  it("five items → [10, 8, 6, 4, 2]", () => {
    const result = interpolate(["a", "b", "c", "d", "e"]);
    expect(result).toEqual({ a: 10.0, b: 8.0, c: 6.0, d: 4.0, e: 2.0 });
  });

  it("all ratings are in [2.0, 10.0]", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const result = interpolate(ids);
    for (const v of Object.values(result)) {
      expect(v).toBeGreaterThanOrEqual(2.0);
      expect(v).toBeLessThanOrEqual(10.0);
    }
  });

  it("ratings are rounded to one decimal place", () => {
    const result = interpolate(["a", "b", "c"]);
    for (const v of Object.values(result)) {
      expect(String(v).replace(/^-?\d+\.?/, "").length).toBeLessThanOrEqual(1);
    }
  });
});

// ── buildRankingWrites ────────────────────────────────────────────────────────

describe("buildRankingWrites", () => {
  it("returns one patch per friend in finalOrder", () => {
    const friends = [
      { id: "a", rankings: {} },
      { id: "b", rankings: {} },
    ];
    const writes = buildRankingWrites(friends, "reliability", ["a", "b"]);
    expect(writes).toHaveLength(2);
    expect(writes[0].id).toBe("a");
    expect(writes[1].id).toBe("b");
  });

  it("merges new attr rating without clobbering existing rankings", () => {
    const friends = [
      { id: "a", rankings: { vibe: 7.5 } },
      { id: "b", rankings: { vibe: 4.0 } },
    ];
    const writes = buildRankingWrites(friends, "reliability", ["a", "b"]);
    // 'vibe' should be preserved
    expect(writes[0].rankings.vibe).toBe(7.5);
    expect(writes[1].rankings.vibe).toBe(4.0);
    // 'reliability' should be set by interpolation (10.0 for top, 2.0 for bottom)
    expect(writes[0].rankings.reliability).toBe(10.0);
    expect(writes[1].rankings.reliability).toBe(2.0);
  });

  it("handles friends not yet in the map (new friend being ranked first time)", () => {
    const friends = [{ id: "a", rankings: {} }];
    const writes = buildRankingWrites(friends, "reliability", ["a"]);
    expect(writes[0].rankings.reliability).toBe(6.0); // single-item neutral
  });

  it("drag case: any reordering re-interpolates correctly", () => {
    const friends = [
      { id: "a", rankings: { reliability: 10.0 } },
      { id: "b", rankings: { reliability: 6.0 } },
      { id: "c", rankings: { reliability: 2.0 } },
    ];
    // Drag c to top
    const newOrder = ["c", "a", "b"];
    const writes = buildRankingWrites(friends, "reliability", newOrder);
    const byId = Object.fromEntries(writes.map((w) => [w.id, w.rankings.reliability]));
    expect(byId.c).toBe(10.0);
    expect(byId.a).toBe(6.0);
    expect(byId.b).toBe(2.0);
  });
});

// ── reorder (drag helper) ─────────────────────────────────────────────────────

describe("reorder", () => {
  it("moves item from one index to another", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(reorder(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]); // no-op
  });

  it("does not mutate the original array", () => {
    const orig = ["a", "b", "c"];
    reorder(orig, 0, 2);
    expect(orig).toEqual(["a", "b", "c"]);
  });
});
