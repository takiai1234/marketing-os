import { cn } from '@/lib/utils';
import { KpiHeroCard } from './kpi-hero-card';
import type { MessagingKpis } from '@/lib/queries/dashboard-messages';

interface Props {
  data: MessagingKpis;
  days: number;
}

/** "12 phút" / "1.5 giờ" / "—". */
function formatMinutes(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${Math.round(m)} phút`;
  return `${(m / 60).toFixed(1).replace(/\.0$/, '')} giờ`;
}

/** Lightweight tile matching KpiHeroCard chrome — used where KpiHeroCard's
 *  "higher = green" delta semantics don't fit (response time, unanswered). */
function Tile({
  title,
  icon,
  value,
  sub,
  valueClass,
  accentClass,
}: {
  title: string;
  icon: string;
  value: string;
  sub: string;
  valueClass?: string;
  accentClass?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl bg-white p-5 ring-1 ring-zinc-200 shadow-sm',
        accentClass
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className="text-base">{icon}</span>
        {title}
      </div>
      <div className={cn('text-3xl font-bold tabular-nums leading-none text-zinc-900', valueClass)}>
        {value}
      </div>
      <div className="text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

export function MessagingKpiRow({ data, days }: Props) {
  const compareLabel = `so với ${days} ngày trước`;

  const noData =
    data.inbound === 0 &&
    data.activeConversations === 0 &&
    data.unansweredNow === 0 &&
    data.inboundSeries.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">💬 Tin nhắn / Inbox</h3>
        <span className="text-xs text-zinc-400">Facebook Messenger · {days} ngày qua</span>
      </div>

      {noData ? (
        <div className="rounded-xl bg-sky-50 border border-sky-200 px-5 py-4 text-sm text-sky-800">
          Chưa có dữ liệu tin nhắn. Cần token page có quyền <code>pages_messaging</code> và
          chờ cron Job J chạy (mỗi 2 giờ).
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiHeroCard
            title="Tin nhắn khách"
            icon="💬"
            value={data.inbound}
            prevValue={data.inboundPrev}
            format="number"
            subtitle={compareLabel}
            sparkline={data.inboundSeries}
            sparklineColor="#0EA5E9"
          />
          <KpiHeroCard
            title="Tỉ lệ phản hồi"
            icon="✅"
            value={data.responseRate}
            prevValue={data.responseRatePrev}
            format="percent"
            subtitle={compareLabel}
            accentClass="border-l-4 border-l-emerald-400"
            sparkline={data.responseRateSeries}
            sparklineColor="#10B981"
          />
          <Tile
            title="Phản hồi TB"
            icon="⏱️"
            value={formatMinutes(data.avgFirstResponseMinutes)}
            sub={
              data.avgFirstResponseMinutesPrev !== null
                ? `trước: ${formatMinutes(data.avgFirstResponseMinutesPrev)}`
                : 'thời gian trả lời lần đầu'
            }
            accentClass="border-l-4 border-l-blue-400"
          />
          <Tile
            title="Chưa trả lời"
            icon={data.unansweredNow > 0 ? '🔴' : '🟢'}
            value={data.unansweredNow.toLocaleString('vi-VN')}
            sub={data.unansweredNow > 0 ? 'hội thoại cần xử lý ngay' : 'đã trả lời hết'}
            valueClass={data.unansweredNow > 0 ? 'text-red-600' : 'text-emerald-600'}
            accentClass={
              data.unansweredNow > 0
                ? 'border-l-4 border-l-red-400'
                : 'border-l-4 border-l-emerald-400'
            }
          />
        </div>
      )}
    </div>
  );
}
