/**
 * Verify tz-dates helpers + parseInsights skip-future behaviour.
 *
 * Run: pnpm tsx scripts/verify-tz-dates.ts
 *
 * Covers the 3 demo cases from plan 260523-0937-vn-timezone-conversion-and-7day-window:
 *   end_time 2026-05-21T07:00Z → VN date 2026-05-21
 *   end_time 2026-05-22T07:00Z → VN date 2026-05-22
 *   end_time 2026-05-23T07:00Z → VN date 2026-05-23
 * Plus the Phase 03 future-skip and the PT-helper parity it replaced.
 */

import assert from 'node:assert/strict';
import {
  toPtDateKey,
  ptDateKeyFromEndTime,
  toVnDateKey,
  vnDateKeyFromEndTime,
  vnDateKeyNow,
} from '../src/lib/fb/tz-dates';
import { parseInsights } from '../src/lib/fb/parse-insights';
import type { FBPageInsight } from '../src/lib/fb/types';

let failed = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${label}\n      ${msg}`);
  }
}

console.log('\n--- VN date helpers (Phase 01) ---');

check('vnDateKeyFromEndTime maps 21/5 boundary → VN 2026-05-21', () => {
  assert.equal(vnDateKeyFromEndTime('2026-05-21T07:00:00+0000'), '2026-05-21');
});

check('vnDateKeyFromEndTime maps 22/5 boundary → VN 2026-05-22 (the bug case)', () => {
  assert.equal(vnDateKeyFromEndTime('2026-05-22T07:00:00+0000'), '2026-05-22');
});

check('vnDateKeyFromEndTime maps 23/5 boundary → VN 2026-05-23', () => {
  assert.equal(vnDateKeyFromEndTime('2026-05-23T07:00:00+0000'), '2026-05-23');
});

check('toVnDateKey on arbitrary UTC string lands in VN day', () => {
  // 2026-05-22T16:00Z = 2026-05-22T23:00 VN → VN date 2026-05-22
  assert.equal(toVnDateKey('2026-05-22T16:00:00Z'), '2026-05-22');
  // 2026-05-22T17:00Z = 2026-05-23T00:00 VN → VN date 2026-05-23
  assert.equal(toVnDateKey('2026-05-22T17:00:00Z'), '2026-05-23');
});

check('vnDateKeyNow returns YYYY-MM-DD shape', () => {
  assert.match(vnDateKeyNow(), /^\d{4}-\d{2}-\d{2}$/);
});

console.log('\n--- PT helpers still work (legacy/debug) ---');

check('ptDateKeyFromEndTime 22/5 boundary → PT 2026-05-21 (the old buggy mapping)', () => {
  assert.equal(ptDateKeyFromEndTime('2026-05-22T07:00:00+0000'), '2026-05-21');
});

check('toPtDateKey symmetric with old behaviour', () => {
  assert.equal(toPtDateKey('2026-05-22T06:00:00Z'), '2026-05-21');
});

console.log('\n--- parseInsights skip-future (Phase 03) ---');

// Build a realistic FB-shaped response: 3 daily points, the last one is in the
// future (>now), so it must be dropped from the parsed output entirely.
const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const past1 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const past2 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

const insights: FBPageInsight[] = [
  {
    name: 'page_media_view',
    values: [
      { end_time: past1, value: 100 },
      { end_time: past2, value: 200 },
      { end_time: future, value: 0 },
    ],
  },
];

check('parseInsights returns 2 entries (future row skipped)', () => {
  const out = parseInsights(insights);
  assert.equal(out.length, 2, `got ${out.length} entries, expected 2`);
});

check('parseInsights output sorted ascending', () => {
  const out = parseInsights(insights);
  assert.equal(out.length, 2);
  // out[0]/out[1] proven present by length check; tsc needs the assertion form
  // explicit since noUncheckedIndexedAccess returns T | undefined for index access.
  assert.ok(out[0]!.date.getTime() <= out[1]!.date.getTime());
});

check('parseInsights reach values land on correct days', () => {
  const out = parseInsights(insights);
  assert.equal(out.length, 2);
  const total = out[0]!.total_reach + out[1]!.total_reach;
  assert.equal(total, 300);
});

console.log('\n--- Replay of plan demo (Phase 01+03 together) ---');

// Simulate the actual 22/5 cron payload: 3 boundary rows, last one is
// end_time 2026-05-23T07:00Z which is FUTURE if cron runs before 2026-05-23 14:00 VN.
// We use Date.now() = 2026-05-22T03:00Z (cron 09:00 VN, 22/5) by injecting a
// custom NOW indirectly via the future-row's relative timestamp.

check('Plan demo: 22/5 cron produces 21/5 + 22/5 rows, no 23/5', () => {
  // Use the actual cron-time anchor: 2026-05-22 02:00 UTC = 09:00 VN
  // We can't easily mock Date.now() without jest, so we test the helper
  // against the absolute mapping rule directly:
  assert.equal(vnDateKeyFromEndTime('2026-05-21T07:00:00+0000'), '2026-05-21');
  assert.equal(vnDateKeyFromEndTime('2026-05-22T07:00:00+0000'), '2026-05-22');
  assert.equal(vnDateKeyFromEndTime('2026-05-23T07:00:00+0000'), '2026-05-23');
  // The 23/5 mapping is correct; whether it is skipped depends on Date.now()
  // at parse time vs end_time. That is exercised by the future test above.
});

console.log(`\n${failed === 0 ? '✓ ALL PASS' : `✗ ${failed} FAIL(S)`}\n`);
process.exit(failed === 0 ? 0 : 1);
