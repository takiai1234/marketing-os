// Time-range options for dashboard widgets.
// All windows EXCLUDE today (today's data is still syncing, incomplete).
//
// Hỗ trợ 2 mode:
//   1. Preset (?range=7|14|30|90): N ngày qua, until = hôm qua
//   2. Custom (?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD): khoảng ngày bất kỳ
//
// LESSON từ lần trước: KHÔNG pass Date object xuống SQL — convert ISO string
// YYYY-MM-DD trước khi push vào params array. Lý do node-pg serialize Date
// thành timestamptz string với TZ → PG infer kiểu timestamptz, conflict với
// $::date cast → 42P18 "could not determine data type".

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
  /** ISO YYYY-MM-DD strings — PHẢI là string không phải Date object. */
  sinceIso: string;
  untilIso: string;
  /** Display preset (7/14/30/90) — null khi custom. */
  preset: TimeRangeDays | null;
}

/** Today (UTC date midnight) — anchor cho preset calc. */
function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Format Date → YYYY-MM-DD. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
 * Compute previous period đúng size cho compare delta.
 * Returns ISO YYYY-MM-DD strings (consumable for SQL params).
 *
 * Vd current = [03/06 → 09/06] (7 ngày) → prev = [27/05 → 02/06].
 */
export function previousPeriodOf(
  sinceIso: string,
  untilIso: string
): { prevSinceIso: string; prevUntilIso: string } {
  const since = parseIsoDate(sinceIso)!;
  const until = parseIsoDate(untilIso)!;
  const daysInRange = Math.floor((until.getTime() - since.getTime()) / 86_400_000) + 1;
  const prevUntil = new Date(since.getTime() - 86_400_000);
  const prevSince = new Date(prevUntil.getTime() - (daysInRange - 1) * 86_400_000);
  return { prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevUntil) };
}

/**
 * Resolve searchParams → ResolvedRange với ISO strings.
 *
 *  - ?range=7|14|30|90 → preset, since = today - N, until = today - 1
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
      const finalFrom =
        clamped < days
          ? new Date(to.getTime() - (clamped - 1) * 86_400_000)
          : from;
      return {
        mode: 'custom',
        days: clamped,
        sinceIso: isoDate(finalFrom),
        untilIso: isoDate(to),
        preset: null,
      };
    }
    // Custom invalid → fall through tới preset default
  }

  // Preset mode (default)
  const days = parseRangeParam(rangeRaw);
  const today = todayUtc();
  // until = hôm qua (today - 1 day). since = today - days (inclusive).
  // Vd today = 11/06, days = 7 → since 04/06, until 10/06 (7 ngày 04-10).
  const until = new Date(today.getTime() - 86_400_000);
  const since = new Date(today.getTime() - days * 86_400_000);
  return {
    mode: 'preset',
    days,
    sinceIso: isoDate(since),
    untilIso: isoDate(until),
    preset: days,
  };
}
