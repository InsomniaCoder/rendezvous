/**
 * schengen.test.js — Tests for schengen.js
 * Run with: node schengen.test.js
 */

'use strict';

const assert = require('assert');
const { daysInWindow, daysRemaining, wouldExceedLimit, nextRolloffDate } = require('./schengen');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a UTC midnight Date from "YYYY-MM-DD". */
function d(str) {
  return new Date(str + 'T00:00:00.000Z');
}

let passed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS:', name);
    passed++;
  } catch (err) {
    console.error('  FAIL:', name);
    console.error('       ', err.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Reference date for most tests: 2024-03-01
// Window: 2023-09-04 → 2024-03-01  (180 days)

const REF = d('2024-03-01');
// windowStart = REF - 179 days = 2023-09-02
// windowEnd   = REF             = 2024-03-01

// ---------------------------------------------------------------------------
// 1. daysInWindow: stay fully inside window → correct count
// ---------------------------------------------------------------------------
test('daysInWindow: stay fully inside window → correct count', () => {
  const stays = [
    { id: '1', person: 'you', from: d('2024-01-10'), to: d('2024-01-19'), planned: false },
  ];
  // 10 days inclusive (Jan 10 – Jan 19)
  assert.strictEqual(daysInWindow(stays, 'you', REF), 10);
});

// ---------------------------------------------------------------------------
// 2. daysInWindow: stay fully outside window → 0
// ---------------------------------------------------------------------------
test('daysInWindow: stay fully outside window → 0', () => {
  // Stay entirely before window start (2023-09-02)
  const stays = [
    { id: '1', person: 'you', from: d('2023-07-01'), to: d('2023-08-31'), planned: false },
  ];
  assert.strictEqual(daysInWindow(stays, 'you', REF), 0);
});

// ---------------------------------------------------------------------------
// 3. daysInWindow: stay partially overlapping window start → clamped count
// ---------------------------------------------------------------------------
test('daysInWindow: stay partially overlapping window start → clamped count', () => {
  // Window starts 2023-09-04 (REF 2024-03-01 − 179 days).
  // Stay: 2023-08-28 – 2023-09-06 (spans window start)
  // Inside window: 2023-09-04 – 2023-09-06 = 3 days
  const stays = [
    { id: '1', person: 'you', from: d('2023-08-28'), to: d('2023-09-06'), planned: false },
  ];
  assert.strictEqual(daysInWindow(stays, 'you', REF), 3);
});

// ---------------------------------------------------------------------------
// 4. daysInWindow: stay partially overlapping window end → clamped count
// ---------------------------------------------------------------------------
test('daysInWindow: stay partially overlapping window end → clamped count', () => {
  // Window ends 2024-03-01.
  // Stay: 2024-02-27 – 2024-03-05 (spans window end)
  // Inside window: 2024-02-27 – 2024-03-01 = 4 days
  const stays = [
    { id: '1', person: 'you', from: d('2024-02-27'), to: d('2024-03-05'), planned: false },
  ];
  assert.strictEqual(daysInWindow(stays, 'you', REF), 4);
});

// ---------------------------------------------------------------------------
// 5. daysInWindow: two stays for same person → summed correctly
// ---------------------------------------------------------------------------
test('daysInWindow: two stays for same person → summed correctly', () => {
  const stays = [
    { id: '1', person: 'you', from: d('2024-01-01'), to: d('2024-01-10'), planned: false }, // 10 days
    { id: '2', person: 'you', from: d('2024-02-01'), to: d('2024-02-15'), planned: false }, // 15 days
  ];
  assert.strictEqual(daysInWindow(stays, 'you', REF), 25);
});

// ---------------------------------------------------------------------------
// 6. daysInWindow: stays from different persons → only counts requested person
// ---------------------------------------------------------------------------
test('daysInWindow: stays from different persons → only counts requested person', () => {
  const stays = [
    { id: '1', person: 'you',     from: d('2024-01-01'), to: d('2024-01-10'), planned: false }, // 10 days
    { id: '2', person: 'partner', from: d('2024-01-01'), to: d('2024-01-20'), planned: false }, // 20 days
  ];
  assert.strictEqual(daysInWindow(stays, 'you',     REF), 10);
  assert.strictEqual(daysInWindow(stays, 'partner', REF), 20);
});

// ---------------------------------------------------------------------------
// 7. daysRemaining: 42 days used → returns 48
// ---------------------------------------------------------------------------
test('daysRemaining: 42 days used → returns 48', () => {
  // Build a stay that exactly covers 42 days inside the window.
  // 42 days ending on referenceDate: from 2024-01-19 to 2024-03-01
  //   Jan: 19..31 = 13 days, Feb: 1..29 = 29 days (2024 is leap), Mar: 1 = 1 day → 43 days
  //   Start one day later: 2024-01-20 → Jan 20-31=12, Feb=29, Mar 1=1 → 42 days
  const stays = [
    { id: '1', person: 'you', from: d('2024-01-20'), to: d('2024-03-01'), planned: false },
  ];
  assert.strictEqual(daysInWindow(stays, 'you', REF), 42);
  assert.strictEqual(daysRemaining(stays, 'you', REF), 48);
});

// ---------------------------------------------------------------------------
// 8. wouldExceedLimit: planned stay that won't exceed → { exceeds: false }
// ---------------------------------------------------------------------------
test('wouldExceedLimit: planned stay that will not exceed → { exceeds: false }', () => {
  // 30 existing days used; planned stay adds 30 more → 60 total, under 90.
  const existing = [
    { id: '1', person: 'you', from: d('2024-01-01'), to: d('2024-01-30'), planned: false }, // 30 days
  ];
  const newStay = { from: d('2024-02-01'), to: d('2024-02-29'), person: 'you', planned: true }; // 29 days

  const result = wouldExceedLimit(newStay, existing, 'you');
  assert.strictEqual(result.exceeds, false);
  assert.strictEqual(result.firstViolationDate, null);
});

// ---------------------------------------------------------------------------
// 9. wouldExceedLimit: planned stay that will exceed → { exceeds: true, firstViolationDate }
// ---------------------------------------------------------------------------
test('wouldExceedLimit: planned stay that will exceed → { exceeds: true, firstViolationDate }', () => {
  // 80 days already used in window ending around the new stay's dates.
  // Existing: 80-day stay ending 2024-02-20
  // from: 2024-02-20 - 79 days = 2023-12-03
  const existing = [
    { id: '1', person: 'you', from: d('2023-12-03'), to: d('2024-02-20'), planned: false }, // 80 days
  ];
  // New stay starting 2024-02-21; violation should occur on day 11 of new stay
  // = 2024-02-21 + 10 = 2024-03-02  (since 80 + 11 = 91 > 90)
  const newStay = { from: d('2024-02-21'), to: d('2024-03-31'), person: 'you', planned: true };

  const result = wouldExceedLimit(newStay, existing, 'you');
  assert.strictEqual(result.exceeds, true);
  assert.ok(result.firstViolationDate instanceof Date, 'firstViolationDate should be a Date');

  // On 2024-03-02 (day 11 of new stay):
  // window = [2023-09-04, 2024-03-02]
  // existing stay inside window: 2023-12-03 – 2024-02-20 = 80 days
  // synthetic stay: 2024-02-21 – 2024-03-02 = 11 days
  // total = 91 → exceeds 90
  const expectedViolation = d('2024-03-02');
  assert.strictEqual(
    result.firstViolationDate.getTime(),
    expectedViolation.getTime(),
    `Expected first violation on ${expectedViolation.toISOString().slice(0,10)}, got ${result.firstViolationDate.toISOString().slice(0,10)}`
  );
});

// ---------------------------------------------------------------------------
// 10. nextRolloffDate: past stay exists → returns correct rolloff date and daysFreed
// ---------------------------------------------------------------------------
test('nextRolloffDate: past stay exists → returns correct rolloff date and daysFreed', () => {
  // Stay: 2024-01-01 – 2024-01-05 (5 days)
  // Rolloff dates: Jan 1+180=Jun 29, Jan 2+180=Jun 30, Jan 3+180=Jul 1,
  //               Jan 4+180=Jul 2, Jan 5+180=Jul 3
  // With referenceDate = 2024-03-01, all rolloffs are in the future.
  // Earliest rolloff: 2024-06-29 (Jan 1 + 180), daysFreed = 1
  const stays = [
    { id: '1', person: 'you', from: d('2024-01-01'), to: d('2024-01-05'), planned: false },
  ];
  const ref = d('2024-03-01');
  const result = nextRolloffDate(stays, 'you', ref);

  assert.ok(result !== null, 'should return a result');
  const expectedDate = new Date(d('2024-01-01'));
  expectedDate.setUTCDate(expectedDate.getUTCDate() + 180);
  assert.strictEqual(
    result.date.getTime(),
    expectedDate.getTime(),
    `Expected rolloff ${expectedDate.toISOString().slice(0,10)}, got ${result.date.toISOString().slice(0,10)}`
  );
  assert.strictEqual(result.daysFreed, 1, 'Only one day (Jan 1) rolls off on the earliest date');
});

// ---------------------------------------------------------------------------
// 10b. nextRolloffDate: multi-day stay where multiple days roll off together
// ---------------------------------------------------------------------------
test('nextRolloffDate: multi-day stay rolls off daysFreed correctly for a single-day stay', () => {
  // Stay: 2024-01-10 – 2024-01-10 (1 day only)
  // Rolloff: 2024-01-10 + 180 = 2024-07-08, daysFreed = 1
  const stays = [
    { id: '1', person: 'you', from: d('2024-01-10'), to: d('2024-01-10'), planned: false },
  ];
  const ref = d('2024-03-01');
  const result = nextRolloffDate(stays, 'you', ref);
  assert.ok(result !== null);
  const expected = new Date(d('2024-01-10'));
  expected.setUTCDate(expected.getUTCDate() + 180);
  assert.strictEqual(result.date.getTime(), expected.getTime());
  assert.strictEqual(result.daysFreed, 1);
});

// ---------------------------------------------------------------------------
// 11. nextRolloffDate: no past stays → returns null
// ---------------------------------------------------------------------------
test('nextRolloffDate: no past stays → returns null', () => {
  // Only planned stays — should return null
  const stays = [
    { id: '1', person: 'you', from: d('2024-04-01'), to: d('2024-04-10'), planned: true },
  ];
  const result = nextRolloffDate(stays, 'you', d('2024-03-01'));
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// 11b. nextRolloffDate: stays all already rolled off → returns null
// ---------------------------------------------------------------------------
test('nextRolloffDate: stays whose rolloff dates are in the past → returns null', () => {
  // Stay 2023-01-01 – 2023-01-05; rolloff dates 2023-06-30 – 2023-07-04
  // referenceDate = 2024-03-01 → all rolloffs are past → null
  const stays = [
    { id: '1', person: 'you', from: d('2023-01-01'), to: d('2023-01-05'), planned: false },
  ];
  const result = nextRolloffDate(stays, 'you', d('2024-03-01'));
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = 13; // update this number when adding tests
if (process.exitCode !== 1) {
  console.log(`\nAll ${passed} tests passed.`);
} else {
  console.log(`\n${passed}/${total} tests passed.`);
}
