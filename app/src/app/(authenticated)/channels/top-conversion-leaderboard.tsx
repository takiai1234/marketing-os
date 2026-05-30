'use client';

// Top Conversion leaderboard — section dưới Top Reach trên /channels.
// Mirror cấu trúc TopReachLeaderboard:
//   - 3 tab 7/14/30d, server prefetch cả 3 → client toggle không API
//   - Top 10 channels by SUM(conversion_count) từ landing_page_conversion
//   - Rank badge gold/silver/bronze, bar relative, peak day inline
//
// Khác biệt visual với Top Reach:
//   - Accent emerald (xanh lá) thay cho blue
//   - Icon TargetIcon thay TrendingUpIcon
//   - Format số: locale-string đầy đủ (conversions thường <10K, compact M/K
//     không có ý nghĩa)
//   - Empty state copy nói về Ladipage webhook (source data cụ thể)

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PlatformIcon } from './_components/platform-icon';
import type {
  TopConversionLeaderboard,
  TopConversionPeriod,
  TopConversionRow,
} from '@/lib/queries/channels-top-conversion';
import { TargetIcon, AwardIcon } from 'lucide-react';

// Inline const — KHÔNG import value từ file `pg`-loaded (xem comment trong
// top-reach-leaderboard.tsx về Turbopack bundling Node built-ins).
const TOP_CONVERSION_PERIODS = [7, 14, 30] as const satisfies readonly TopConversionPeriod[];

interface Props {
  data: TopConversionLeaderboard;
  defaultPeriod?: TopConversionPeriod;
}

function formatConversion(n: number): string {
  // Conversion thường <10K, dùng locale comma cho dễ đọc (vd "1.234").
  return n.toLocaleString('vi-VN');
}

function formatPeakDate(iso: string | null): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

const PERIOD_LABELS: Record<TopConversionPeriod, string> = {
  7: '7 ngày',
  14: '14 ngày',
  30: '30 ngày',
};

export function TopConversionLeaderboard({
  data,
  defaultPeriod = 7,
}: Props) {
  const [period, setPeriod] = useState<TopConversionPeriod>(defaultPeriod);
  const rows = data.byPeriod[period] ?? [];

  // Empty state — chưa có conversion data (Ladipage chưa sync hoặc kênh chưa active)
  if (data.totalChannelsWithData === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <Header
          period={period}
          setPeriod={setPeriod}
          totalChannels={0}
        />
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
          <p className="text-sm text-zinc-600">
            Chưa có conversion. Đợi cron Ladipage chạy (23:30 VN hằng ngày)
            hoặc trigger thủ công ở <code>/cron-logs</code>.
          </p>
        </div>
      </section>
    );
  }

  const maxConversions = rows[0]?.totalConversions ?? 1;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <Header
        period={period}
        setPeriod={setPeriod}
        totalChannels={data.totalChannelsWithData}
      />

      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center">
          <p className="text-sm text-zinc-600">
            Không có conversion trong {PERIOD_LABELS[period]} qua. Thử window
            dài hơn.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row, idx) => (
            <LeaderboardRow
              key={row.accountId}
              row={row}
              rank={idx + 1}
              maxConversions={maxConversions}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function Header({
  period,
  setPeriod,
  totalChannels,
}: {
  period: TopConversionPeriod;
  setPeriod: (p: TopConversionPeriod) => void;
  totalChannels: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
          <TargetIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 text-base leading-tight">
            Top Chuyển đổi
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kênh có nhiều conversion nhất · {totalChannels} kênh có data
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 shrink-0">
        {TOP_CONVERSION_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              period === p
                ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            )}
            aria-pressed={period === p}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

function LeaderboardRow({
  row,
  rank,
  maxConversions,
}: {
  row: TopConversionRow;
  rank: number;
  maxConversions: number;
}) {
  const barPercent =
    maxConversions > 0 ? (row.totalConversions / maxConversions) * 100 : 0;

  return (
    <li>
      <Link
        href={`/channels/${row.accountId}`}
        className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors"
      >
        <div
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-xs font-bold shrink-0',
            rank === 1 && 'bg-amber-100 text-amber-700',
            rank === 2 && 'bg-zinc-200 text-zinc-700',
            rank === 3 && 'bg-orange-100 text-orange-700',
            rank > 3 && 'bg-zinc-100 text-zinc-500'
          )}
        >
          {rank === 1 ? <AwardIcon className="size-4" /> : rank}
        </div>

        <PlatformIcon platform={row.platform} size="sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium text-sm text-zinc-900 truncate group-hover:text-emerald-700">
              {row.name}
            </p>
            <p className="text-sm font-bold text-zinc-900 tabular-nums shrink-0">
              {formatConversion(row.totalConversions)}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  rank === 1 && 'bg-amber-500',
                  rank === 2 && 'bg-zinc-400',
                  rank === 3 && 'bg-orange-400',
                  rank > 3 && 'bg-emerald-500'
                )}
                style={{ width: `${Math.max(barPercent, 3)}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 tabular-nums shrink-0 whitespace-nowrap">
              Peak {formatConversion(row.peakDayConversions)} ·{' '}
              {formatPeakDate(row.peakDate)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
