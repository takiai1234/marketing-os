// /ads/[id]/campaigns/[campaignId] — Campaign detail page
//
// Tier 1: 11 KPI grid với compare Δ% vs prev 30d
// Tier 2: metadata (objective, status, budget, dates, duration)
// Tier 3: pacing widget + trend chart 30d + daily breakdown table
// Tier 4: health warnings (fatigue, low CTR, no conv, ...)

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  CalendarIcon,
  TargetIcon,
  DownloadIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getCampaignDetail } from '@/lib/queries/ad-accounts';
import {
  computeHealthWarnings,
  computePacing,
  computeDelta,
} from '@/lib/ads/health-warnings';
import {
  parseRangeFromSearchParams,
  previousPeriodOf,
  rangeToQueryString,
} from '@/lib/ads/date-ranges';
import { DateRangePicker } from '@/components/ads/date-range-picker';
import { cn } from '@/lib/utils';
import { CampaignTrendChart } from './campaign-trend-chart';

interface PageProps {
  params: Promise<{ id: string; campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NUMBER_FMT = new Intl.NumberFormat('vi-VN');

const OBJECTIVE_LABEL: Record<string, string> = {
  awareness: 'Awareness',
  traffic: 'Traffic',
  engagement: 'Engagement',
  leads: 'Leads',
  app_promotion: 'App Promotion',
  sales: 'Sales',
  video_views: 'Video Views',
  messages: 'Messages',
  unknown: '—',
};

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-200',
  DELETED: 'bg-zinc-50 text-zinc-500 ring-zinc-200',
  ARCHIVED: 'bg-zinc-50 text-zinc-500 ring-zinc-200',
};

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

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN');
  } catch {
    return iso;
  }
}

export default async function CampaignDetailPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id: adAccountId, campaignId } = await params;
  const sp = await searchParams;
  const range = parseRangeFromSearchParams(sp);
  const prev = previousPeriodOf(range);

  const detail = await getCampaignDetail(campaignId, user.userId, {
    sinceDate: range.from,
    untilDate: range.to,
    prevSinceDate: prev.from,
    prevUntilDate: prev.to,
  });
  if (!detail) notFound();

  const { campaign, accountName, accountCurrency, kpiCurrent, kpiPrevious, daily } = detail;
  const currency = accountCurrency;

  // Health warnings
  const warnings = computeHealthWarnings({
    spendMicros: kpiCurrent.spendMicros,
    impressions: kpiCurrent.impressions,
    reach: kpiCurrent.reach,
    clicks: kpiCurrent.clicks,
    conversions: kpiCurrent.conversions,
    ctr: kpiCurrent.ctr,
    frequency: kpiCurrent.frequency,
    cpmMicros: kpiCurrent.cpmMicros,
    daysWithData: kpiCurrent.daysWithData,
  });

  // Pacing
  const pacing = computePacing({
    spendMicros: kpiCurrent.spendMicros,
    dailyBudgetMicros: campaign.dailyBudgetMicros,
    lifetimeBudgetMicros: campaign.lifetimeBudgetMicros,
    startTime: campaign.startTime,
    endTime: campaign.endTime,
  });

  // Deltas vs previous period
  const dSpend = computeDelta(kpiCurrent.spendMicros, kpiPrevious.spendMicros);
  const dImpressions = computeDelta(kpiCurrent.impressions, kpiPrevious.impressions);
  const dClicks = computeDelta(kpiCurrent.clicks, kpiPrevious.clicks);
  const dConversions = computeDelta(kpiCurrent.conversions, kpiPrevious.conversions);
  const dCtr = computeDelta(kpiCurrent.ctr * 100, kpiPrevious.ctr * 100); // % point delta
  const dCpm = computeDelta(kpiCurrent.cpmMicros, kpiPrevious.cpmMicros);

  return (
    <div className="flex flex-col gap-5">
      {/* Back link */}
      <Link
        href={`/ads/${adAccountId}`}
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="size-3.5" />
        Quay lại ad account "{accountName}"
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={cn(
                'inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ring-1',
                STATUS_BADGE_CLS[campaign.status.toUpperCase()] ??
                  'bg-zinc-50 text-zinc-600 ring-zinc-200'
              )}
            >
              {campaign.status}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
              <TargetIcon className="size-3" />
              {OBJECTIVE_LABEL[campaign.objective] ?? campaign.objective}
            </span>
          </div>
          <h2 className="text-xl font-bold text-zinc-900">{campaign.name}</h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
            ID: {campaign.externalId}
          </p>
        </div>

        <div className="text-right text-xs text-zinc-500 space-y-0.5">
          <p className="inline-flex items-center gap-1">
            <CalendarIcon className="size-3" />
            {formatDateOnly(campaign.startTime)} → {formatDateOnly(campaign.endTime)}
          </p>
          <p>Đã chạy {pacing.daysRun} ngày {pacing.daysRemaining !== null && `· còn ${pacing.daysRemaining}d`}</p>
        </div>
      </div>

      {/* Date range picker + Export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRangePicker
          currentPreset={range.preset}
          currentFrom={range.from}
          currentTo={range.to}
        />
        <a
          href={`/api/ads/accounts/${adAccountId}/campaigns/${campaignId}/export?${rangeToQueryString(range)}`}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white ring-1 ring-zinc-200 text-zinc-700 hover:bg-zinc-50"
        >
          <DownloadIcon className="size-3.5" />
          Export CSV
        </a>
      </div>

      {/* Health warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {warnings.map((w) => (
            <div
              key={w.code}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm ring-1 flex items-start gap-2',
                w.level === 'critical' && 'bg-rose-50 ring-rose-200 text-rose-900',
                w.level === 'warning' && 'bg-amber-50 ring-amber-200 text-amber-900',
                w.level === 'info' && 'bg-blue-50 ring-blue-200 text-blue-900',
                w.level === 'success' && 'bg-emerald-50 ring-emerald-200 text-emerald-900'
              )}
            >
              <div>
                <strong>{w.label}</strong> · {w.hint}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pacing widget */}
      {pacing.budgetMicros > 0 && (
        <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-sm font-semibold text-zinc-900">Pacing</h3>
            <span
              className={cn(
                'text-[10px] font-bold uppercase px-2 py-0.5 rounded ring-1',
                pacing.status === 'over-pace' && 'bg-rose-50 text-rose-700 ring-rose-200',
                pacing.status === 'under-pace' && 'bg-amber-50 text-amber-700 ring-amber-200',
                pacing.status === 'on-pace' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                pacing.status === 'unknown' && 'bg-zinc-50 text-zinc-600 ring-zinc-200'
              )}
            >
              {pacing.status === 'over-pace' && '🚨 Over budget'}
              {pacing.status === 'under-pace' && '⏬ Under-pace'}
              {pacing.status === 'on-pace' && '✓ On pace'}
              {pacing.status === 'unknown' && 'No timeline'}
            </span>
          </div>
          <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                pacing.percentSpent <= 100 ? 'bg-blue-500' : 'bg-rose-500'
              )}
              style={{ width: `${Math.min(100, pacing.percentSpent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-600 mt-2 flex-wrap gap-2">
            <span>
              <strong className="text-zinc-900">{microsToDisplay(pacing.spentMicros, currency)}</strong>
              {' / '}
              {microsToDisplay(pacing.budgetMicros, currency)} ({pacing.percentSpent}%)
            </span>
            <span>
              Daily avg: {microsToDisplay(pacing.avgDailySpendMicros, currency)}
            </span>
            {pacing.projectedTotalMicros !== null && (
              <span>
                Projected: <strong>{microsToDisplay(pacing.projectedTotalMicros, currency)}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI grid — 11 metrics với compare 30d */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label={`Spend ${range.days}d`} value={microsToDisplay(kpiCurrent.spendMicros, currency)} delta={dSpend} unit="currency" currency={currency} />
        <KpiCard label="Impressions" value={NUMBER_FMT.format(kpiCurrent.impressions)} delta={dImpressions} unit="count" />
        <KpiCard label="Reach (sum)" value={NUMBER_FMT.format(kpiCurrent.reach)} delta={null} unit="count" hint="Sum daily reach" />
        <KpiCard label="Frequency" value={kpiCurrent.frequency.toFixed(2)} delta={null} unit="number" hint="Impressions/Reach" />
        <KpiCard label="Clicks" value={NUMBER_FMT.format(kpiCurrent.clicks)} delta={dClicks} unit="count" />
        <KpiCard label="CTR" value={`${(kpiCurrent.ctr * 100).toFixed(2)}%`} delta={dCtr} unit="percent" />
        <KpiCard label="CPM" value={microsToDisplay(kpiCurrent.cpmMicros, currency)} delta={dCpm} unit="currency" currency={currency} invertTrend />
        <KpiCard label="CPC" value={microsToDisplay(kpiCurrent.cpcMicros, currency)} delta={null} unit="currency" currency={currency} invertTrend />
        <KpiCard label="Kết quả" value={NUMBER_FMT.format(kpiCurrent.conversions)} delta={dConversions} unit="count" />
        <KpiCard label="CPA" value={kpiCurrent.cpaMicros > 0 ? microsToDisplay(kpiCurrent.cpaMicros, currency) : '—'} delta={null} unit="currency" currency={currency} invertTrend hint="Cost per acquisition" />
        <KpiCard label="ROAS" value={kpiCurrent.roas !== null ? `${kpiCurrent.roas.toFixed(2)}×` : '—'} delta={null} unit="number" hint="Revenue/Spend" />
      </div>

      {/* Trend chart 30d */}
      <CampaignTrendChart data={daily} currency={currency} />

      {/* Daily breakdown table */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm">
        <div className="px-4 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-900">
            Daily breakdown ({daily.length} ngày)
          </h3>
        </div>
        {daily.length === 0 ? (
          <p className="text-xs text-zinc-500 italic px-4 py-6 text-center">
            Chưa có data. Click "Đồng bộ ngay" trên /ads để pull.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Ngày</th>
                  <th className="text-right px-3 py-2 font-medium">Spend</th>
                  <th className="text-right px-3 py-2 font-medium">Impressions</th>
                  <th className="text-right px-3 py-2 font-medium">Reach</th>
                  <th className="text-right px-3 py-2 font-medium">Clicks</th>
                  <th className="text-right px-3 py-2 font-medium">CTR</th>
                  <th className="text-right px-3 py-2 font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {[...daily].reverse().map((d) => {
                  const ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
                  return (
                    <tr key={d.date} className="hover:bg-zinc-50/50">
                      <td className="px-3 py-2 font-mono text-[11px]">{d.date}</td>
                      <td className="text-right px-3 py-2 tabular-nums">
                        {d.spendMicros > 0 ? microsToDisplay(d.spendMicros, currency) : '—'}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums">{NUMBER_FMT.format(d.impressions)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{NUMBER_FMT.format(d.reach)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{NUMBER_FMT.format(d.clicks)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{ctr.toFixed(2)}%</td>
                      <td className="text-right px-3 py-2 tabular-nums">{NUMBER_FMT.format(d.conversions)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponent: KpiCard with delta arrow ──────────────────────────────

interface DeltaProp {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
  trend: 'up' | 'down' | 'flat';
}

function KpiCard({
  label,
  value,
  delta,
  unit,
  currency,
  hint,
  invertTrend,
}: {
  label: string;
  value: string;
  delta: DeltaProp | null;
  unit: 'currency' | 'count' | 'percent' | 'number';
  currency?: string;
  hint?: string;
  /** Cho metric mà giảm = tốt (vd CPM, CPC, CPA) — đảo màu */
  invertTrend?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 px-3 py-2.5" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900 mt-0.5 tabular-nums">{value}</p>
      {delta && (
        <DeltaBadge delta={delta} unit={unit} currency={currency} invertTrend={invertTrend} />
      )}
    </div>
  );
}

function DeltaBadge({
  delta,
  unit,
  currency,
  invertTrend,
}: {
  delta: DeltaProp;
  unit: 'currency' | 'count' | 'percent' | 'number';
  currency?: string;
  invertTrend?: boolean;
}) {
  // Up=green, down=red mặc định. invertTrend đảo: vd CPM up=red, down=green.
  const isPositiveDirection = invertTrend ? delta.trend === 'down' : delta.trend === 'up';
  const colorCls =
    delta.trend === 'flat'
      ? 'text-zinc-500'
      : isPositiveDirection
        ? 'text-emerald-600'
        : 'text-rose-600';

  const Icon =
    delta.trend === 'up' ? ArrowUpIcon : delta.trend === 'down' ? ArrowDownIcon : MinusIcon;

  return (
    <div className={cn('flex items-center gap-1 text-[10px] mt-1', colorCls)}>
      <Icon className="size-2.5" />
      <span className="tabular-nums">
        {delta.deltaPct >= 0 ? '+' : ''}
        {delta.deltaPct.toFixed(1)}%
      </span>
      <span className="text-zinc-400">vs trước</span>
    </div>
  );
}
