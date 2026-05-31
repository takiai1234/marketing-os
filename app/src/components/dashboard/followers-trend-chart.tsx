'use client';

// FollowersTrendChart — multi-line chart, mỗi line = 1 kênh.
// Top 10 kênh theo current followers, prefetch server-side (xem
// dashboard-followers-trend.ts). Click legend chip để show/hide từng line.
//
// Vì kênh có scale khác nhau (vd 100K vs 5K) — same chart sẽ có line nhỏ
// gần như flat ở đáy. Đây là trade-off accepted: ưu tiên thấy được pattern
// growth của top channels, channel nhỏ vẫn thấy nhưng cần zoom (click off
// các channel to để focus). Phase 2 có thể add toggle "% change from start"
// để normalize scales.

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { FollowerTrendResponse } from '@/lib/queries/dashboard-followers-trend';

interface Props {
  data: FollowerTrendResponse;
  days: number;
}

// 10 màu phân biệt rõ trên nền trắng. Order match với top channels DESC
// (channel #1 dùng màu đậm nhất, channel #10 dùng nhạt nhất tone).
// Palette chọn từ Tailwind 500-shade để giữ contrast nhất quán.
const COLOR_PALETTE = [
  '#3B82F6', // blue   — #1
  '#10B981', // emerald — #2
  '#F97316', // orange — #3
  '#A855F7', // purple — #4
  '#EC4899', // pink   — #5
  '#06B6D4', // cyan   — #6
  '#F59E0B', // amber  — #7
  '#84CC16', // lime   — #8
  '#EF4444', // red    — #9
  '#6366F1', // indigo — #10
];

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM');
  } catch {
    return dateStr;
  }
}

function formatLargeNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// Tooltip — show mọi channel visible cho ngày hover, sorted DESC by value
// để dễ scan (giá trị to lên trên).
interface TooltipPayloadEntry {
  dataKey: string;
  name?: string;
  value: number;
  color: string;
}
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload]
    .filter((p) => p.value !== null && p.value !== undefined)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-lg bg-white shadow-md ring-1 ring-zinc-200 px-3 py-2 text-xs">
      <p className="font-semibold text-zinc-700 mb-1.5">
        {label ? formatDate(label) : ''}
      </p>
      <ul className="space-y-0.5 max-h-60 overflow-y-auto">
        {sorted.map((p) => (
          <li key={p.dataKey} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 truncate text-zinc-700">{p.dataKey}</span>
            <span className="tabular-nums font-medium text-zinc-900">
              {new Intl.NumberFormat('vi-VN').format(p.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FollowersTrendChart({ data, days }: Props) {
  // visible: map channel.accountId → bool. Default: tất cả ON.
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(data.channels.map((c) => [c.accountId, true]))
  );

  // Pivot long-format rows → wide format cho Recharts.
  //   rows: [{date, accountId, name, followers}, ...]
  //   chartData: [{date, [channelName]: followers, ...}, ...]
  //
  // Dùng channel.name làm key thay vì accountId vì Recharts hiện key trong
  // tooltip dataKey — name thân thiện hơn UUID.
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const row of data.rows) {
      let bucket = byDate.get(row.date);
      if (!bucket) {
        bucket = { date: row.date };
        byDate.set(row.date, bucket);
      }
      bucket[row.name] = row.followers;
    }
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
  }, [data.rows]);

  function toggle(accountId: string) {
    setVisible((v) => ({ ...v, [accountId]: !v[accountId] }));
  }

  function toggleAll(on: boolean) {
    setVisible(
      Object.fromEntries(data.channels.map((c) => [c.accountId, on]))
    );
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-700">
            Follower trend per kênh — {days} ngày qua
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Top {data.channels.length} kênh theo followers hiện tại · click
            chip để ẩn/hiện
          </p>
        </div>
        {data.channels.length > 1 && (
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleAll(true)}
              className="text-[11px] text-blue-600 hover:underline"
            >
              Hiện hết
            </button>
            <span className="text-zinc-300">·</span>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              className="text-[11px] text-zinc-500 hover:underline"
            >
              Ẩn hết
            </button>
          </div>
        )}
      </div>

      {/* Clickable legend pills — 1 per channel, color-matched */}
      {data.channels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {data.channels.map((c, idx) => {
            const color = COLOR_PALETTE[idx] ?? '#94A3B8';
            const on = visible[c.accountId] ?? true;
            return (
              <button
                key={c.accountId}
                type="button"
                onClick={() => toggle(c.accountId)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors max-w-full',
                  on
                    ? 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200'
                    : 'text-zinc-400 ring-1 ring-zinc-100 hover:bg-zinc-50'
                )}
                aria-pressed={on}
                title={`${c.name} · ${formatLargeNumber(c.currentFollowers)} followers hiện tại`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: on ? color : '#D4D4D8' }}
                />
                <span className="truncate max-w-[140px]">{c.name}</span>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {formatLargeNumber(c.currentFollowers)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Chart or empty */}
      {data.channels.length === 0 || chartData.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-zinc-400">
          Chưa có data follower — sync ít nhất 1 kênh để hiện chart
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={formatLargeNumber}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* 1 Line per channel — only render khi visible[id] true.
                key dùng accountId để stable across renders. */}
            {data.channels.map((c, idx) => {
              if (!(visible[c.accountId] ?? true)) return null;
              const color = COLOR_PALETTE[idx] ?? '#94A3B8';
              return (
                <Line
                  key={c.accountId}
                  type="monotone"
                  dataKey={c.name}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
