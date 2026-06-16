// Beli-style pairwise ranking engine.
// Pure functions — no JSX, no DOM, no I/O.
//
// Ranking is attribute-generic: pass `attr` to target any friend attribute.
// Currently only "reliability" is wired up in FriendForm, but RANKED_ATTRS
// can be extended with one entry to enable ranking on other attributes.

// ── Config ────────────────────────────────────────────────────────────────────

export const RANKED_ATTRS = [
  { key: "reliability", prompt: "shows up when they say yes" },
  // Add more here, e.g.:
  // { key: "vibe", prompt: "is easier to reach out to" },
];

// ── Derived order ─────────────────────────────────────────────────────────────

/**
 * Returns best→worst array of friend IDs for the given attribute,
 * filtered to only friends who have a defined ranking for that attr.
 * Ties broken deterministically by id (asc) to keep sessions stable.
 */
export function rankedOrder(friends, attr) {
  return friends
    .filter((f) => typeof f.rankings?.[attr] === "number")
    .sort((a, b) => {
      const diff = b.rankings[attr] - a.rankings[attr]; // desc by rating
      return diff !== 0 ? diff : a.id < b.id ? -1 : 1; // asc by id as tie-break
    })
    .map((f) => f.id);
}

// ── Binary-insertion comparison session ───────────────────────────────────────

/**
 * Start a session to insert `newId` into `orderedIds` (best→worst).
 * If the list is empty, immediately done.
 * hintPos: optional predicted insertion index (0=best, hi=worst); skips the
 * standard midpoint for the first comparison, reducing expected comparisons
 * when a slider value predicts the final rank.
 */
export function startComparisonSession(orderedIds, newId, hintPos = null) {
  const lo = 0;
  const hi = orderedIds.length;
  if (hi === 0) {
    return { orderedIds, newId, lo: 0, hi: 0, mid: 0, done: true, finalOrder: [newId] };
  }
  const mid = hintPos != null ? Math.max(0, Math.min(hi - 1, Math.round(hintPos))) : (lo + hi) >> 1;
  return { orderedIds, newId, lo, hi, mid, done: false, finalOrder: null };
}

/**
 * Returns the current comparison probe: { a: newId, b: orderedIds[mid] }
 * or null if the session is done.
 */
export function nextComparison(session) {
  if (session.done) return null;
  return { a: session.newId, b: session.orderedIds[session.mid] };
}

/**
 * Apply the user's answer to the current probe (immutable session update).
 * newWins === true  → new friend ranks higher (goes above the probe)
 * newWins === false → probe stays above new friend
 * When lo === hi, splices newId into the correct position and marks done.
 */
export function applyComparison(session, newWins) {
  const { mid } = session;
  let { lo, hi } = session;
  if (newWins) {
    hi = mid;
  } else {
    lo = mid + 1;
  }
  if (lo === hi) {
    const finalOrder = [
      ...session.orderedIds.slice(0, lo),
      session.newId,
      ...session.orderedIds.slice(lo),
    ];
    return { ...session, lo, hi, done: true, finalOrder };
  }
  return { ...session, lo, hi, mid: (lo + hi) >> 1, done: false, finalOrder: null };
}

// ── Re-rank ───────────────────────────────────────────────────────────────────

/**
 * Start a re-rank session for a friend who already has a rating.
 * Removes movingId from the current order and begins a fresh comparison session.
 */
export function reRank(friends, attr, movingId) {
  const current = rankedOrder(friends, attr).filter((id) => id !== movingId);
  return startComparisonSession(current, movingId);
}

// ── Interpolation ─────────────────────────────────────────────────────────────

/**
 * Given a best→worst ordered array of friend IDs, assign each a 0.0–10.0 rating.
 * Endpoints: top = 10.0, bottom = 2.0, linearly spaced.
 * Single item → 6.0 (matches the legacy neutral 3/5 = 0.6 → 6.0 in scoring.js).
 * Ratings are rounded to one decimal place.
 */
export function interpolate(orderedIds) {
  const n = orderedIds.length;
  if (n === 0) return {};
  if (n === 1) return { [orderedIds[0]]: 6.0 };
  const result = {};
  for (let i = 0; i < n; i++) {
    result[orderedIds[i]] = Math.round((10 - (i / (n - 1)) * 8) * 10) / 10;
  }
  return result;
}

// ── Fan-out writes ────────────────────────────────────────────────────────────

/**
 * Given a new final order (best→worst IDs) after a comparison or drag,
 * produce the array of { id, rankings } patches to apply to affected friends.
 * Merges the new attr rating into each friend's existing rankings
 * without clobbering other attrs.
 *
 * Callers should:
 *   1. Apply all patches in one setFriends() batch.
 *   2. Fire-and-forget api.upsertFriend() for each affected friend.
 */
export function buildRankingWrites(friends, attr, finalOrder) {
  const ratings = interpolate(finalOrder);
  const friendMap = Object.fromEntries(friends.map((f) => [f.id, f]));
  return finalOrder.map((id) => {
    const existing = friendMap[id]?.rankings ?? {};
    return {
      id,
      rankings: { ...existing, [attr]: ratings[id] },
    };
  });
}

// ── Spread order ──────────────────────────────────────────────────────────────

/**
 * Reorder a pre-sorted array so items appear in binary-split order:
 * median first, then the midpoint of each half recursively.
 * Useful for displaying a balanced sample of a ranked list.
 * Note: does NOT reduce binary-insertion comparison counts —
 * each insertion takes ⌈log₂(k+1)⌉ comparisons regardless of queue order.
 */
export function spreadOrder(sortedArr) {
  const result = [];
  function split(lo, hi) {
    if (lo > hi) return;
    const mid = (lo + hi) >> 1;
    result.push(sortedArr[mid]);
    split(lo, mid - 1);
    split(mid + 1, hi);
  }
  split(0, sortedArr.length - 1);
  return result;
}

// ── Drag helper ───────────────────────────────────────────────────────────────

/**
 * Reorder an array by moving the item at `fromIndex` to `toIndex`.
 * Returns a new array. Used by the drag-override UI in RankSession.
 */
export function reorder(arr, fromIndex, toIndex) {
  const result = [...arr];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}
