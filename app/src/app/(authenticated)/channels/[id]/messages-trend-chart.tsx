'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { ChannelMessageDay } from '@/lib/queries/dashboard-messages';

interface Props {
  data: ChannelMessageDay[];
}

const LABELS: Record<string, string> = {
  inbound: 'Tin nhắn khách',
  outbound: 'Page trả lời',
  avgResp: 'Phản hồi TB (phút)',
};

function formatMinutes(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${Math.round(m)} phút`;
  return `${(m / 60).toFixed(1).replace(/\.0$/, '')} giờ`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white shadow-md ring-1 ring-zinc-200 px-3 py-2 text-xs">
      <p className="font-semibold text-zinc-700 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {LABELS[entry.name] ?? entry.name}:{' '}
          {entry.name === 'avgResp'
            ? formatMinutes(entry.value ?? null)
            : new Intl.NumberFormat('vi-VN').format(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className={`text-base font-semibold tabular-nums text-zinc-900 ${valueClass ?? ''}`}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

export function MessagesTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-1">Tin nhắn 7 ngày qua</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Tin nhắn khách · Page trả lời · Thời gian phản hồi · Hội thoại chưa trả lời
        </p>
        <p className="text-sm text-zinc-400 text-center py-8">
          Chưa có dữ liệu tin nhắn (cần token <code>pages_messaging</code> + chờ cron Job J).
        </p>
      </div>
    );
  }

  // Summary stats
  const inboundTotal = data.reduce((s, d) => s + d.inboundMessages, 0);
  const activeTotal = data.reduce((s, d) => s + d.activeConversations, 0);
  const respondedTotal = data.reduce((s, d) => s + d.respondedConversations, 0);
  const responseRate = activeTotal > 0 ? (respondedTotal / activeTotal) * 100 : 0;

  let respNum = 0;
  let respDen = 0;
  for (const d of data) {
    if (d.avgFirstResponseMinutes !== null) {
      respNum += d.avgFirstResponseMinutes * d.respondedConversations;
      respDen += d.respondedConversations;
    }
  }
  const avgResp = respDen > 0 ? respNum / respDen : null;
  const unansweredNow = data[data.length - 1]?.unansweredConversations ?? 0;

  const chartData = data.map((d) => ({
    date: format(parseISO(d.date), 'dd/MM', { locale: vi }),
    inbound: d.inboundMessages,
    outbound: d.outboundMessages,
    avgResp: d.avgFirstResponseMinutes,
  }));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900 mb-1">Tin nhắn 7 ngày qua</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Tin nhắn khách (inbound) · Page trả lời (outbound) · Thời gian phản hồi lần đầu
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <Stat label="Tin nhắn khách" value={inboundTotal.toLocaleString('vi-VN')} />
        <Stat
          label="Tỉ lệ phản hồi"
          value={`${responseRate.toFixed(0)}%`}
          valueClass={
            responseRate >= 80
              ? 'text-emerald-600'
              : responseRate >= 50
              ? 'text-amber-600'
              : 'text-red-500'
          }
        />
        <Stat label="Phản hồi TB" value={formatMinutes(avgResp)} />
        <Stat
          label="Chưa trả lời"
          value={unansweredNow.toLocaleString('vi-VN')}
          valueClass={unansweredNow > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: '#0ea5e9' }}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={false}
            tickLine={false}
            axisLine={false}
            width={0}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => LABELS[value] ?? value}
            iconType="circle"
            iconSize={8}
          />
          <Bar yAxisId="left" dataKey="inbound" name="inbound" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="left" dataKey="outbound" name="outbound" fill="#34d399" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgResp"
            name="avgResp"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3, fill: '#f97316' }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
