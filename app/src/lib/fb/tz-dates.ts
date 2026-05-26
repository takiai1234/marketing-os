// Timezone-aware date helpers for FB Insights pipeline.
//
// FB Graph Insights with `period=day` always reports in Pacific Time
// (America/Los_Angeles), regardless of the Page's timezone setting. But we
// store and display data in Asia/Ho_Chi_Minh (VN) calendar dates — that is
// the user's local context and the timezone Postgres session runs in.
//
// `Intl.DateTimeFormat` handles DST automatically for PT; VN has no DST so
// the offset is a stable +07:00.
//
// Convention:
// - PT helpers (`toPtDateKey`, `ptDateKeyFromEndTime`) — kept for debugging
//   and reasoning about raw FB boundary times. Not used in the write path
//   any more after the 2026-05-23 timezone migration.
// - VN helpers (`toVnDateKey`, `vnDateKeyFromEndTime`, `vnDateKeyNow`) —
//   authoritative for everything that lands in `account_metric_daily.date`.

const PT_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const VN_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// ─── PT helpers (legacy / debug) ──────────────────────────────────────────────

/**
 * Convert a Date or ISO timestamp string into the PT calendar date (YYYY-MM-DD).
 * Kept for debug parity with raw FB end_time semantics.
 */
export function toPtDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return PT_FORMATTER.format(date);
}

/**
 * Convert FB Insights `end_time` (PT-midnight string) into the PT date of
 * the report day it represents. Subtracts 1ms to land inside the day before
 * formatting — without this, the boundary moment maps to the next PT date.
 */
export function ptDateKeyFromEndTime(endTime: string): string {
  return toPtDateKey(new Date(new Date(endTime).getTime() - 1));
}

// ─── VN helpers (authoritative for DB writes) ─────────────────────────────────

/**
 * Convert a Date or ISO timestamp string into the VN calendar date (YYYY-MM-DD).
 * en-CA locale formats as "YYYY-MM-DD" which matches Postgres DATE on insert.
 */
export function toVnDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return VN_FORMATTER.format(date);
}

/**
 * Convert FB Insights `end_time` (PT-midnight string) into the VN calendar
 * date of the report day. -1ms keeps semantics symmetric with PT helper:
 * an end_time boundary maps into the report-day, not the day after.
 *
 * Example: end_time `2026-05-22T07:00:00+0000`
 *   = 2026-05-22 14:00 VN → VN date `2026-05-22`.
 * The same end_time in PT (PDT) = 2026-05-22 00:00 boundary → PT date 2026-05-21
 * (after -1ms). The VN mapping is +1 day vs the PT mapping for early-UTC end_times.
 */
export function vnDateKeyFromEndTime(endTime: string): string {
  return toVnDateKey(new Date(new Date(endTime).getTime() - 1));
}

/** Current VN calendar date. Use for "today" comparisons in the write path. */
export function vnDateKeyNow(): string {
  return toVnDateKey(new Date());
}

// ─── Shared FB API helper ─────────────────────────────────────────────────────

/**
 * Compute Unix timestamp (seconds) for `todayT08:00:00+0000`.
 *
 * Used as `until` parameter on every FB Graph request. Setting this explicitly
 * (instead of letting FB default to "now") ensures the request window covers
 * past the most recent PT-midnight boundary, so FB returns the latest finalised
 * daily insight row instead of cutting it off at the current moment.
 *
 * 08:00 UTC = midnight PST (winter) or 01:00 PDT (summer). Picking 08:00
 * covers both DST cases — FB has had its full PT-day rollover regardless of
 * which timezone offset is active.
 */
export function getTodayUntilUtcSec(): number {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
