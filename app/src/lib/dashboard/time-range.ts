// Time-range options for dashboard widgets.
// All windows EXCLUDE today (today's data is still syncing, incomplete).
// SQL pattern: date >= CURRENT_DATE - $1::int AND date < CURRENT_DATE
//
// Hỗ trợ 2 mode:
//   1. Preset (?range=7|14|30|90): N ngày qua, until = hôm qua
//   2. Custom (?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD): khoảng ngày bất kỳ

export const TIME_RANGE_OPTIONS = [7, 14, 30, 90] as const;
export type TimeRangeDays = (typeof TIME_RANGE_OPTIONS)[number];
export const DEFAULT_RANGE_DAYS: TimeRangeDays = 7;

/** Max ngày cho custom range — defensive guard tránh query khổng lồ. */
export const MAX_CUSTOM_DAYS = 365;

/** Parse a raw query-string value into a valid TimeRangeDays. Falls back to default on invalid. */
export function parseRangeParam(raw: unknown): TimeRangeDays {
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  return (TIME_RANGE_OPTIONS as readonly number[]).includes(n)
    ? (n as TimeRangeDays)
    : DEFAULT_RANGE_DAYS;
}

export interface ResolvedRange {
  /** 'preset' | 'custom' — UI hiển thị badge khác nhau */
  mode: 'preset' | 'custom';
  /** Số ngày trong range (≥1). Dùng cho window comparison previous period. */
  days: number;
  /** Ngày bắt đầu range (Date), inclusive. */
  sinceDate: Date;
  /** Ngày kết thúc range (Date), inclusive. */
  untilDate: Date;
  /** Display preset (7/14/30/90) — null khi custom. */
  preset: TimeRangeDays | null;
  /** ISO YYYY-MM-DD for URL persist (custom mode). */
  fromIso: string;
  toIso: string;
}

/** Today (UTC date, no time) — anchor cho preset calc. */
function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Format Date → YYYY-MM-DD. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute previous period đúng size cho compare delta.
 * Vd current = [10/06 → 16/06] (7 ngày) → prev = [03/06 → 09/06].
 */
export function previousPeriodOf(
  sinceDate: Date,
  untilDate: Date
): { prevSinceDate: Date; prevUntilDate: Date } {
  const daysInRange =
    Math.floor((untilDate.getTime() - sinceDate.getTime()) / 86_400_000) + 1;
  const prevUntilDate = new Date(sinceDate.getTime() - 86_400_000);
  const prevSinceDate = new Date(
    prevUntilDate.getTime() - (daysInRange - 1) * 86_400_000
  );
  return { prevSinceDate, prevUntilDate };
}

/** Validate YYYY-MM-DD string. */
function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Resolve searchParams → {mode, days, sinceDate, untilDate, ...}.
 *
 * Logic:
 *  - ?range=7|14|30|90 → preset, sinceDate = today - N, untilDate = today - 1
 *  - ?range=custom&from=&to= → custom (clamp max MAX_CUSTOM_DAYS)
 *  - Bất kỳ invalid input → fallback preset DEFAULT_RANGE_DAYS
 */
export function resolveRangeFromSearchParams(params: {
  range?: string | string[];
  from?: string | string[];
  to?: string | string[];
}): ResolvedRange {
  const rangeRaw = Array.isArray(params.range) ? params.range[0] : params.range;
  const fromRaw = Array.isArray(params.from) ? params.from[0] : params.from;
  const toRaw = Array.isArray(params.to) ? params.to[0] : params.to;

  // Custom mode: range=custom + valid from + valid to
  if (rangeRaw === 'custom') {
    const from = parseIsoDate(fromRaw);
    const to = parseIsoDate(toRaw);
    if (from && to && from <= to) {
      const days =
        Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
      const clamped = Math.min(days, MAX_CUSTOM_DAYS);
      // Nếu user pick > MAX_CUSTOM_DAYS, truncate from về (to - MAX + 1)
      const finalFrom =
        clamped < days
          ? new Date(to.getTime() - (clamped - 1) * 86_400_000)
          : from;
      return {
        mode: 'custom',
        days: clamped,
        sinceDate: finalFrom,
        untilDate: to,
        preset: null,
        fromIso: isoDate(finalFrom),
        toIso: isoDate(to),
      };
    }
    // Custom invalid → fall through tới preset default
  }

  // Preset mode (default)
  const days = parseRangeParam(rangeRaw);
  const today = todayUtc();
  const until = new Date(today.getTime() - 86_400_000); // hôm qua
  const since = new Date(today.getTime() - days * 86_400_000); // hôm qua - (days - 1) ngày
  // Adjust since = today - days (inclusive), until = today - 1 (exclusive of today)
  since.setUTCDate(today.getUTCDate() - days);
  return {
    mode: 'preset',
    days,
    sinceDate: since,
    untilDate: until,
    preset: days,
    fromIso: isoDate(since),
    toIso: isoDate(until),
  };
}
