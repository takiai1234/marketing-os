'use client';

// Top Reach leaderboard — section ở đầu trang /channels.
// Server prefetches 3 windows (7/14/30d) → component này client toggle bằng
// state, không cần round-trip API khi user đổi tab.

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PlatformIcon } from './_components/platform-icon';
import {
  TOP_REACH_PERIODS,
  type TopReachLeaderboard,
  type TopReachPeriod,
  type TopReachRow,
} from '@/lib/queries/channels-top-reach';
import { TrendingUpIcon, AwardIcon } from 'lucide-react';

interface Props {
  data: TopReachLeaderboard;
  /** Period mặc định khi load lần đầu. Đặt prop để dễ A/B test sau này. */
  defaultPeriod?: TopReachPeriod;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('vi-VN');
}

function formatPeakDate(iso: string | null): string {
  if (!iso) return '—';
  // iso = "YYYY-MM-DD" → "28/05"
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

const PERIOD_LABELS: Record<TopReachPeriod, string> = {
  7: '7 ngày',
  14: '14 ngày',
  30: '30 ngày',
};

export function TopReachLeaderboard({ data, defaultPeriod = 7 }: Props) {
  const [period, setPeriod] = useState<TopReachPeriod>(defaultPeriod);
  const rows = data.byPeriod[period] ?? [];

  // Empty state — không có channel nào có reach trong 30 ngày (mới deploy)
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
            Chưa có data reach. Sync ít nhất 1 kênh để hiện leaderboard.
          </p>
        </div>
      </section>
    );
  }

  // Reach lớn nhất trong tab hiện tại — dùng làm baseline cho thanh bar
  const maxReach = rows[0]?.totalReach ?? 1;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <Header
        period={period}
        setPeriod={setPeriod}
        totalChannels={data.totalChannelsWithData}
      />

      {/* Empty trong tab cụ thể (vd 7d nhưng kênh mới sync 30 ngày sau) */}
      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center">
          <p className="text-sm text-zinc-600">
            Không có reach trong {PERIOD_LABELS[period]} qua. Thử window dài hơn.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row, idx) => (
            <LeaderboardRow
              key={row.accountId}
              row={row}
              rank={idx + 1}
              maxReach={maxReach}
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
  period: TopReachPeriod;
  setPeriod: (p: TopReachPeriod) => void;
  totalChannels: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
          <TrendingUpIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 text-base leading-tight">
            Top Reach
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kênh có reach cao nhất · {totalChannels} kênh có data
          </p>
        </div>
      </div>

      {/* Tabs 7/14/30 — segmented control */}
      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 shrink-0">
        {TOP_REACH_PERIODS.map((p) => (
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
  maxReach,
}: {
  row: TopReachRow;
  rank: number;
  maxReach: number;
}) {
  // % width của thanh bar — relative to top channel
  const barPercent = maxReach > 0 ? (row.totalReach / maxReach) * 100 : 0;

  return (
    <li>
      <Link
        href={`/channels/${row.accountId}`}
        className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
      >
        {/* Rank badge */}
        <div
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-xs font-bold shrink-0',
            rank === 1 && 'bg-amber-100 text-amber-700',
            rank === 2 && 'bg-zinc-200 text-zinc-700',
            rank === 3 && 'bg-orange-100 text-orange-700',
            rank > 3 && 'bg-zinc-100 text-zinc-500'
          )}
        >
          {rank === 1 ? (
            <AwardIcon className="size-4" />
          ) : (
            rank
          )}
        </div>

        {/* Platform icon */}
        <PlatformIcon platform={row.platform} size="sm" />

        {/* Name + peak inline */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium text-sm text-zinc-900 truncate group-hover:text-blue-700">
              {row.name}
            </p>
            <p className="text-sm font-bold text-zinc-900 tabular-nums shrink-0">
              {formatCompact(row.totalReach)}
            </p>
          </div>

          {/* Bar + peak day inline */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  rank === 1 && 'bg-amber-500',
                  rank === 2 && 'bg-zinc-400',
                  rank === 3 && 'bg-orange-400',
                  rank > 3 && 'bg-blue-400'
                )}
                style={{ width: `${Math.max(barPercent, 3)}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 tabular-nums shrink-0 whitespace-nowrap">
              Peak {formatCompact(row.peakDayReach)} · {formatPeakDate(row.peakDate)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
