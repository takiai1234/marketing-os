// /ads/[id] — Ad account detail page
// Server component: load account + 30d daily metrics + campaigns with summary
// Render KPI top + trend chart + campaign list table

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircleIcon, CheckCircle2Icon, DownloadIcon } from 'lucide-react';

import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getAdAccountForUser,
  getAccountMetricsDaily,
  listCampaignsWithSummary,
} from '@/lib/queries/ad-accounts';
import { microsToDisplay } from '@/lib/fb/ads-api-client';
import { parseRangeFromSearchParams, rangeToQueryString } from '@/lib/ads/date-ranges';
import { DateRangePicker } from '@/components/ads/date-range-picker';
import { cn } from '@/lib/utils';
import { AdsTrendChart } from './ads-trend-chart';
import { AdsAiAnalyst } from '@/components/ads/ads-ai-analyst';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NUMBER_FMT = new Intl.NumberFormat('vi-VN');

const PLATFORM_META: Record<string, { label: string; cls: string }> = {
  facebook: { label: 'Facebook Ads', cls: 'bg-blue-600 text-white' },
  google:   { label: 'Google Ads',   cls: 'bg-amber-500 text-white' },
  tiktok:   { label: 'TikTok Ads',   cls: 'bg-zinc-900 text-white' },
};

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAUSED:   'bg-amber-50 text-amber-700 ring-amber-200',
  DELETED:  'bg-zinc-50 text-zinc-500 ring-zinc-200',
  ARCHIVED: 'bg-zinc-50 text-zinc-500 ring-zinc-200',
};


function formatRelative(iso: string | null): string {
  if (!iso) return 'chưa sync';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h trước`;
  const days = Math.floor(hours / 24);
  return `${days}d trước`;
}

export default async function AdAccountDetailPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const sp = await searchParams;
  const range = parseRangeFromSearchParams(sp);

  const account = await getAdAccountForUser(id, user.userId);
  if (!account) notFound();

  const [dailyMetrics, campaigns] = await Promise.all([
    getAccountMetricsDaily(id, user.userId, { sinceDate: range.from, untilDate: range.to }),
    listCampaignsWithSummary(id, user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  // 30d totals từ daily metrics
  let totalSpendMicros = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  for (const d of dailyMetrics) {
    totalSpendMicros += d.spendMicros;
    totalImpressions += d.impressions;
    totalClicks += d.clicks;
    totalConversions += d.conversions;
  }
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks > 0 ? totalSpendMicros / totalClicks : 0;

  // KPI: tách kết quả theo objective từ campaigns
  let totalSalesResults = 0;
  let totalLeadsResults = 0;
  for (const c of campaigns) {
    if (!c.summary30d) continue;
    if (c.objective === 'sales') totalSalesResults += c.summary30d.conversions;
    else if (c.objective === 'leads') totalLeadsResults += c.summary30d.conversions;
  }

  const platform = PLATFORM_META[account.platform] ?? {
    label: account.platform,
    cls: 'bg-zinc-700 text-white',
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Back */}
      <Link
        href="/ads"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="size-3.5" />
        Quay lại danh sách
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded',
                platform.cls
              )}
            >
              {platform.label}
            </span>
            {account.businessManagerName && (
              <span className="text-[11px] text-zinc-500">
                BM: <span className="font-medium text-zinc-700">{account.businessManagerName}</span>
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-zinc-900 truncate">{account.name}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            ID: <code className="font-mono">{account.externalId}</code> ·{' '}
            {account.currency}
            {account.timezone && ` · ${account.timezone}`}
          </p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <p>Last sync: {formatRelative(account.lastSyncedAt)}</p>
          <p className="mt-0.5">Status: <span className="font-medium text-zinc-700">{account.status}</span></p>
        </div>
      </div>

      {/* Date range picker + Export + AI */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRangePicker
          currentPreset={range.preset}
          currentFrom={range.from}
          currentTo={range.to}
        />
        <div className="flex items-center gap-2">
          <AdsAiAnalyst
            endpoint={`/api/ads/accounts/${id}/analyze`}
            queryString={rangeToQueryString(range)}
          />
          <a
            href={`/api/ads/accounts/${id}/export?${rangeToQueryString(range)}`}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white ring-1 ring-zinc-200 text-zinc-700 hover:bg-zinc-50"
          >
            <DownloadIcon className="size-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Error banner */}
      {account.status === 'error' && account.lastError && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-900 flex items-start gap-2">
          <AlertCircleIcon className="size-4 mt-0.5 shrink-0" />
          <div>
            <strong>Sync gần nhất bị lỗi:</strong> {account.lastError}
          </div>
        </div>
      )}

      {/* Status pending */}
      {account.status === 'pending' && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircleIcon className="size-4 mt-0.5 shrink-0" />
          <div>
            Account đang ở status <strong>pending</strong>. Vào /ads → click
            "Kích hoạt" → quay lại đây sẽ thấy data sau khi sync.
          </div>
        </div>
      )}

      {/* KPI 30d */}
      {dailyMetrics.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label={`Spend ${range.days}d`} value={microsToDisplay(totalSpendMicros, account.currency)} />
          <KpiCard label="Impressions" value={NUMBER_FMT.format(totalImpressions)} />
          <KpiCard label="Clicks" value={NUMBER_FMT.format(totalClicks)} />
          <KpiCard label="CTR" value={`${(avgCtr * 100).toFixed(2)}%`} />
          <KpiCard label="Kết quả Sales" value={NUMBER_FMT.format(totalSalesResults)} sub={totalSalesResults > 0 && totalSpendMicros > 0 ? `CPS: ${microsToDisplay(totalSpendMicros / totalSalesResults, account.currency)}` : undefined} />
          <KpiCard label="Kết quả Leads" value={NUMBER_FMT.format(totalLeadsResults)} sub={totalLeadsResults > 0 && totalSpendMicros > 0 ? `CPL: ${microsToDisplay(totalSpendMicros / totalLeadsResults, account.currency)}` : undefined} />
        </div>
      ) : account.status === 'active' ? (
        <div className="rounded-xl bg-blue-50 ring-1 ring-blue-200 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
          <CheckCircle2Icon className="size-4 mt-0.5 shrink-0" />
          <div>
            Account đã activated nhưng chưa có data 30d. Click <strong>"Đồng bộ
            ngay"</strong> trên /ads để pull ngay, hoặc đợi cron 04:30 VN hôm sau.
          </div>
        </div>
      ) : null}

      {/* Trend chart */}
      <AdsTrendChart data={dailyMetrics} currency={account.currency} />

      {/* Campaigns table — tất cả campaigns, sort theo spend */}
      {(() => {
        const noConvCampaigns = campaigns.filter(
          (c) => c.status.toLowerCase() === 'active' && c.summary30d && c.summary30d.spendMicros > 0 && c.summary30d.conversions === 0
        );
        // Sort: 0-conv active lên đầu, còn lại sort theo spend desc
        const sortedCampaigns = [...campaigns].sort((a, b) => {
          const aNoConv = a.status.toLowerCase() === 'active' && a.summary30d && a.summary30d.spendMicros > 0 && a.summary30d.conversions === 0;
          const bNoConv = b.status.toLowerCase() === 'active' && b.summary30d && b.summary30d.spendMicros > 0 && b.summary30d.conversions === 0;
          if (aNoConv && !bNoConv) return -1;
          if (!aNoConv && bNoConv) return 1;
          const aSpend = a.summary30d?.spendMicros ?? 0;
          const bSpend = b.summary30d?.spendMicros ?? 0;
          return bSpend - aSpend;
        });
        return (
          <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm">
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-900">
                  Campaigns ({campaigns.length})
                </h3>
                {noConvCampaigns.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-rose-200">
                    🚨 {noConvCampaigns.length} chiến dịch thiếu conversion
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-500">0-conv lên đầu · sort theo Spend {range.days}d ↓</span>
            </div>
            {campaigns.length === 0 ? (
              <p className="text-xs text-zinc-500 italic px-4 py-6 text-center">
                Chưa có campaign nào. Sync data từ FB Ads để pull campaign list.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Campaign</th>
                      <th className="text-center px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">Budget</th>
                      <th className="text-right px-3 py-2 font-medium">Spend {range.days}d</th>
                      <th className="text-right px-3 py-2 font-medium">Impressions</th>
                      <th className="text-right px-3 py-2 font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 font-medium">CTR</th>
                      <th className="text-right px-3 py-2 font-medium">CPM</th>
                      <th className="text-right px-3 py-2 font-medium">Conversions</th>
                      <th className="text-right px-3 py-2 font-medium">CPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {sortedCampaigns.map((c) => {
                      const s = c.summary30d;
                      const cpl = s && s.conversions > 0 ? s.spendMicros / s.conversions : null;
                      const ctr = s && s.impressions > 0 ? (s.clicks / s.impressions * 100) : null;
                      const cpm = s && s.impressions > 0 ? (s.spendMicros / s.impressions * 1000) : null;
                      const budget = c.dailyBudgetMicros
                        ? `${microsToDisplay(c.dailyBudgetMicros, account.currency)}/ngày`
                        : c.lifetimeBudgetMicros
                        ? `${microsToDisplay(c.lifetimeBudgetMicros, account.currency)} trọn đời`
                        : '—';
                      const isNoConv = c.status.toLowerCase() === 'active' && s && s.spendMicros > 0 && s.conversions === 0;
                      return (
                        <tr key={c.id} className={cn('hover:bg-zinc-50/50', isNoConv && 'bg-rose-50/60')}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                href={`/ads/${id}/campaigns/${c.id}?${rangeToQueryString(range)}`}
                                className="font-medium text-zinc-900 hover:text-blue-700 truncate max-w-[260px] block"
                                title={c.name}
                              >
                                {c.name} →
                              </Link>
                              {isNoConv && (
                                <span className="shrink-0 text-[10px] font-semibold text-rose-700 bg-rose-100 ring-1 ring-rose-200 px-1.5 py-0.5 rounded-full">
                                  0 conv
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              ID: {c.externalId}
                            </p>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className={cn(
                              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ring-1',
                              STATUS_BADGE_CLS[c.status.toUpperCase()] ?? 'bg-zinc-50 text-zinc-600 ring-zinc-200'
                            )}>
                              {c.status}
                            </span>
                          </td>
                          <td className="text-right px-3 py-2 tabular-nums text-zinc-500">{budget}</td>
                          {s ? (
                            <>
                              <td className={cn('text-right px-3 py-2 tabular-nums', isNoConv && 'text-rose-700 font-medium')}>
                                {microsToDisplay(s.spendMicros, account.currency)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {NUMBER_FMT.format(s.impressions)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {NUMBER_FMT.format(s.clicks)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {ctr !== null ? `${ctr.toFixed(2)}%` : '—'}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {cpm !== null ? microsToDisplay(cpm, account.currency) : '—'}
                              </td>
                              <td className={cn('text-right px-3 py-2 tabular-nums font-semibold', isNoConv && 'text-rose-600')}>
                                {isNoConv ? '0 🚨' : NUMBER_FMT.format(s.conversions)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums font-medium text-blue-700">
                                {cpl !== null
                                  ? microsToDisplay(cpl, account.currency)
                                  : <span className="text-zinc-400 font-normal">—</span>
                                }
                              </td>
                            </>
                          ) : (
                            <td colSpan={7} className="px-3 py-2 text-center text-zinc-400 italic">
                              Không có data {range.days}d
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}
