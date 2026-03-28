/**
 * schengen.js — Pure Schengen 90/180-day rule calculation functions.
 * No DOM access. Works in both Node.js (CommonJS) and browser environments.
 */

/**
 * Truncate a Date to midnight UTC, returning a plain Date.
 * All calculations treat dates as UTC midnight values.
 */
function toDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Add `n` days to a Date (returns a new Date).
 */
function addDays(date, n) {
  const d = toDay(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Difference in whole days between two dates: (a - b) in days.
 * Both dates are normalised to UTC midnight before computing.
 */
function diffDays(a, b) {
  return Math.trunc((toDay(a) - toDay(b)) / 86400000);
}

// ---------------------------------------------------------------------------
// daysInWindow
// ---------------------------------------------------------------------------

/**
 * Returns the total number of Schengen days used by `person` within the
 * 180-day rolling window ending on (and including) `referenceDate`.
 *
 * Window: [referenceDate − 179 days, referenceDate]  (180 days inclusive)
 *
 * @param {Array}  stays         - Array of stay objects
 * @param {string} person        - "you" | "partner"
 * @param {Date}   referenceDate
 * @returns {number}
 */
function daysInWindow(stays, person, referenceDate) {
  const windowEnd   = toDay(referenceDate);
  const windowStart = addDays(windowEnd, -179);

  let total = 0;

  for (const stay of stays) {
    if (stay.person !== person) continue;

    const stayFrom = toDay(stay.from);
    const stayTo   = toDay(stay.to);

    // Overlap = [max(stayFrom, windowStart), min(stayTo, windowEnd)]
    const overlapStart = stayFrom > windowStart ? stayFrom : windowStart;
    const overlapEnd   = stayTo   < windowEnd   ? stayTo   : windowEnd;

    const days = diffDays(overlapEnd, overlapStart) + 1;
    if (days > 0) total += days;
  }

  return total;
}

// ---------------------------------------------------------------------------
// daysRemaining
// ---------------------------------------------------------------------------

/**
 * Returns days remaining (90 − daysInWindow) for `person` at `referenceDate`.
 *
 * @param {Array}  stays
 * @param {string} person
 * @param {Date}   referenceDate
 * @returns {number}
 */
function daysRemaining(stays, person, referenceDate) {
  return 90 - daysInWindow(stays, person, referenceDate);
}

// ---------------------------------------------------------------------------
// wouldExceedLimit
// ---------------------------------------------------------------------------

/**
 * Tests whether adding `newStay` for `person` would violate the 90/180 rule
 * on any day during that stay.
 *
 * CALLER CONTRACT: `existingStays` must NOT contain `newStay` (or any object
 * representing the same trip). The function constructs a synthetic stay for
 * `newStay` internally; if `newStay` is also present in `existingStays` those
 * days will be double-counted, producing an incorrect (too-high) result.
 *
 * @param {Object} newStay        - Stay to test (from/to/person fields used)
 * @param {Array}  existingStays  - Already-recorded stays (must not include newStay)
 * @param {string} person
 * @returns {{ exceeds: boolean, firstViolationDate: Date|null }}
 */
function wouldExceedLimit(newStay, existingStays, person) {
  const from = toDay(newStay.from);
  const to   = toDay(newStay.to);

  // Pre-filter existing stays to only the relevant person for performance.
  const personStays = existingStays.filter(s => s.person === person);

  let current = toDay(from);
  while (current <= to) {
    // Synthetic stay covers newStay.from → current day.
    const syntheticStay = {
      id: '__synthetic__',
      person,
      from: toDay(from),
      to:   toDay(current),
    };

    const tempStays = personStays.concat([syntheticStay]);
    const used = daysInWindow(tempStays, person, current);

    if (used > 90) {
      return { exceeds: true, firstViolationDate: toDay(current) };
    }

    current = addDays(current, 1);
  }

  return { exceeds: false, firstViolationDate: null };
}

// ---------------------------------------------------------------------------
// nextRolloffDate
// ---------------------------------------------------------------------------

/**
 * Returns the next date (after `referenceDate`) when at least one past
 * (non-planned) stay day for `person` exits the 180-day window, along with
 * how many days are freed on that exact date.
 *
 * A stay day at date X is inside the window for referenceDate when:
 *   referenceDate >= X  AND  referenceDate <= X + 179
 * It exits the window when referenceDate = X + 180.
 *
 * So the rolloff date for stay day X is X + 180.
 * For a contiguous stay [stayFrom, stayTo], all days in the stay roll off
 * together on stayTo + 180  (the last day of the stay determines when the
 * entire block exits).
 *
 * Actually, each individual day D rolls off on D + 180.  Days of stay
 * [stayFrom, stayTo] roll off on dates stayFrom+180 … stayTo+180.
 * We group by rolloff date and pick the earliest one > referenceDate.
 *
 * @param {Array}  stays
 * @param {string} person
 * @param {Date}   referenceDate
 * @returns {{ date: Date, daysFreed: number }|null}
 */
function nextRolloffDate(stays, person, referenceDate) {
  const ref = toDay(referenceDate);

  // Only non-planned stays for the person.
  const pastStays = stays.filter(s => s.person === person && !s.planned);

  if (pastStays.length === 0) return null;

  // Build a map of rolloffDate → count of days rolling off on that date.
  // Each day D within a stay rolls off on D + 180.
  // We only care about rolloff dates that are > referenceDate.
  const rolloffMap = new Map(); // key: time (ms), value: { date, count }

  for (const stay of pastStays) {
    const stayFrom = toDay(stay.from);
    const stayTo   = toDay(stay.to);

    // Iterate each day of the stay.
    let day = toDay(stayFrom);
    while (day <= stayTo) {
      const rolloff = addDays(day, 180);
      if (rolloff > ref) {
        const key = rolloff.getTime();
        if (!rolloffMap.has(key)) {
          rolloffMap.set(key, { date: rolloff, count: 0 });
        }
        rolloffMap.get(key).count += 1;
      }
      day = addDays(day, 1);
    }
  }

  if (rolloffMap.size === 0) return null;

  // Find the earliest rolloff date.
  let earliest = null;
  for (const entry of rolloffMap.values()) {
    if (earliest === null || entry.date < earliest.date) {
      earliest = entry;
    }
  }

  return { date: earliest.date, daysFreed: earliest.count };
}

// ---------------------------------------------------------------------------
// Exports (CommonJS for Node / test runner; no-op in browser)
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined') {
  module.exports = { daysInWindow, daysRemaining, wouldExceedLimit, nextRolloffDate };
}
