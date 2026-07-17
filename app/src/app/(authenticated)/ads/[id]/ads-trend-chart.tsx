'use client';

// Trend chart 30 ngày cho 1 ad account — line chart với 3 toggle metric:
// Spend / Impressions / Conversions. Recharts ResponsiveContainer.

import { useState, useMemo } from 'react';
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
import type { DailyMetricPoint } from '@/lib/queries/ad-accounts';

// Inline micros→display (không import từ ads-api-client vì file đó pull
// pg/sync code → client bundle fail "node:async_hooks"). Same pattern với
// openrouter-models.ts split để tránh pollute client bundle.
function microsToDisplay(micros: number, currency: string): string {
  const amount = micros / 1_000_000;
  if (currency === 'VND') {
    return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

const SERIES = {
  spend: { label: 'Spend', color: '#3B82F6' },
  impressions: { label: 'Impressions', color: '#A855F7' },
  conversions: { label: 'Conversions', color: '#10B981' },
} as const;

type SeriesKey = keyof typeof SERIES;

interface Props {
  data: DailyMetricPoint[];
  currency: string;
}

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
  return String(Math.round(v));
}

export function AdsTrendChart({ data, currency }: Props) {
  const [activeSeries, setActiveSeries] = useState<Set<SeriesKey>>(
    new Set(['spend', 'impressions', 'conversions'] as SeriesKey[])
  );

  // Reshape: spend in display amount (not micros) cho dễ đọc trên chart
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        // Spend in micros → display amount (USD/VND number, not formatted)
        spend: d.spendMicros / 1_000_000,
        impressions: d.impressions,
        conversions: d.conversions,
      })),
    [data]
  );

  function toggle(k: SeriesKey) {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k); // không cho turn off hết
      } else {
        next.add(k);
      }
      return next;
    });
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-zinc-900 mb-1">
          Xu hướng 30 ngày
        </h3>
        <p className="text-xs text-zinc-500 italic py-6 text-center">
          Chưa có data — click "Đồng bộ ngay" trên trang /ads để pull insights
          (~30s/account), hoặc đợi cron 04:30 VN hàng ngày.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-sm font-semibold text-zinc-900">
          Xu hướng 30 ngày
        </h3>
        {/* Legend toggle */}
        <div className="flex items-center gap-1.5">
          {(Object.keys(SERIES) as SeriesKey[]).map((key) => {
            const s = SERIES[key];
            const isOn = activeSeries.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition',
                  isOn
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-600'
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: isOn ? s.color : '#d4d4d8' }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
            />
            {activeSeries.has('spend') && (
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickFormatter={formatLargeNumber}
                axisLine={false}
                tickLine={false}
              />
            )}
            {(activeSeries.has('impressions') || activeSeries.has('conversions')) && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickFormatter={formatLargeNumber}
                axisLine={false}
                tickLine={false}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e4e4e7',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelFormatter={(label) => formatDate(String(label ?? ''))}
              formatter={(value, name) => {
                const v = typeof value === 'number' ? value : Number(value ?? 0);
                const n = String(name ?? '');
                if (n === 'spend') {
                  return [microsToDisplay(v * 1_000_000, currency), 'Spend'];
                }
                if (n === 'impressions') {
                  return [v.toLocaleString('vi-VN'), 'Impressions'];
                }
                if (n === 'conversions') {
                  return [v.toLocaleString('vi-VN'), 'Conversions'];
                }
                return [String(v), n];
              }}
            />
            {activeSeries.has('spend') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="spend"
                stroke={SERIES.spend.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
            {activeSeries.has('impressions') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="impressions"
                stroke={SERIES.impressions.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
            {activeSeries.has('conversions') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversions"
                stroke={SERIES.conversions.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
