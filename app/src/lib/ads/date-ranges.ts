// Date range presets + URL param parser cho /ads pages.
//
// URL convention:
//   ?range=7d       → preset 7 ngày gần nhất
//   ?range=14d, 30d, 90d
//   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Default: 30d. Max custom range: 365 ngày (FB Marketing API có limit).

export type DateRangePreset = '7d' | '14d' | '30d' | '90d' | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  /** ISO date YYYY-MM-DD (inclusive start) */
  from: string;
  /** ISO date YYYY-MM-DD (inclusive end — usually today) */
  to: string;
  /** Số ngày trong range (inclusive 2 đầu). Vd 30d = 30. */
  days: number;
  /** Label hiển thị UI ('7 ngày' / 'Tuỳ chỉnh: 01/05-31/05') */
  label: string;
}

export const PRESET_LABELS: Record<Exclude<DateRangePreset, 'custom'>, string> = {
  '7d': '7 ngày',
  '14d': '14 ngày',
  '30d': '30 ngày',
  '90d': '90 ngày',
};

const PRESET_DAYS: Record<Exclude<DateRangePreset, 'custom'>, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

const MAX_CUSTOM_DAYS = 365;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateVN(d: Date): string {
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/** Build DateRange từ preset key. */
export function buildPresetRange(
  preset: Exclude<DateRangePreset, 'custom'>
): DateRange {
  const days = PRESET_DAYS[preset];
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1)); // inclusive cả 2 đầu
  return {
    preset,
    from: isoDate(from),
    to: isoDate(to),
    days,
    label: PRESET_LABELS[preset],
  };
}

/** Build custom DateRange. Throws nếu invalid. */
export function buildCustomRange(fromIso: string, toIso: string): DateRange {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) {
    throw new Error('Custom range cần from/to dạng YYYY-MM-DD');
  }
  if (from > to) {
    throw new Error('from phải ≤ to');
  }
  const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > MAX_CUSTOM_DAYS) {
    throw new Error(`Custom range tối đa ${MAX_CUSTOM_DAYS} ngày`);
  }
  return {
    preset: 'custom',
    from: isoDate(from),
    to: isoDate(to),
    days,
    label: `${formatDateVN(from)}–${formatDateVN(to)}`,
  };
}

/** Parse URL searchParams thành DateRange. Fallback 30d nếu invalid hoặc thiếu. */
export function parseRangeFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): DateRange {
  const rangeRaw = searchParams.range;
  const range = Array.isArray(rangeRaw) ? rangeRaw[0] : rangeRaw;

  if (range === '7d' || range === '14d' || range === '30d' || range === '90d') {
    return buildPresetRange(range);
  }

  if (range === 'custom') {
    const fromRaw = searchParams.from;
    const toRaw = searchParams.to;
    const fromStr = Array.isArray(fromRaw) ? fromRaw[0] : fromRaw;
    const toStr = Array.isArray(toRaw) ? toRaw[0] : toRaw;
    if (fromStr && toStr) {
      try {
        return buildCustomRange(fromStr, toStr);
      } catch {
        // Fall through → default 30d
      }
    }
  }

  return buildPresetRange('30d');
}

/** Build query string từ DateRange (cho Link href + form submit). */
export function rangeToQueryString(range: DateRange): string {
  if (range.preset !== 'custom') {
    return `range=${range.preset}`;
  }
  return `range=custom&from=${range.from}&to=${range.to}`;
}

/** Tính "previous period" cùng độ dài để compare Δ%. Vd 30d hiện tại
 *  → 30 ngày trước đó (61 ngày trước → 32 ngày trước). */
export function previousPeriodOf(range: DateRange): DateRange {
  const from = parseIsoDate(range.from)!;
  const to = parseIsoDate(range.to)!;
  const ms = to.getTime() - from.getTime() + 24 * 60 * 60 * 1000;
  const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - ms + 24 * 60 * 60 * 1000);
  return {
    preset: 'custom',
    from: isoDate(prevFrom),
    to: isoDate(prevTo),
    days: range.days,
    label: `${formatDateVN(prevFrom)}–${formatDateVN(prevTo)}`,
  };
}
