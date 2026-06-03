// /ads/[id] — Ad account detail page
// Server component: load account + 30d daily metrics + campaigns with summary
// Render KPI top + trend chart + campaign list table

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getAdAccountForUser,
  getAccountMetricsDaily,
  listCampaignsWithSummary,
} from '@/lib/queries/ad-accounts';
import { microsToDisplay } from '@/lib/fb/ads-api-client';
import { cn } from '@/lib/utils';
import { AdsTrendChart } from './ads-trend-chart';

interface PageProps {
  params: Promise<{ id: string }>;
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

const OBJECTIVE_LABEL: Record<string, string> = {
  awareness:     'Awareness',
  traffic:       'Traffic',
  engagement:    'Engagement',
  leads:         'Leads',
  app_promotion: 'App Promotion',
  sales:         'Sales',
  video_views:   'Video Views',
  messages:      'Messages',
  unknown:       '—',
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

export default async function AdAccountDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const account = await getAdAccountForUser(id, user.userId);
  if (!account) notFound();

  const [dailyMetrics, campaigns] = await Promise.all([
    getAccountMetricsDaily(id, user.userId, 30),
    listCampaignsWithSummary(id, user.userId, 30),
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Spend 30d" value={microsToDisplay(totalSpendMicros, account.currency)} />
          <KpiCard label="Impressions" value={NUMBER_FMT.format(totalImpressions)} />
          <KpiCard label="Clicks" value={NUMBER_FMT.format(totalClicks)} />
          <KpiCard label="CTR" value={`${(avgCtr * 100).toFixed(2)}%`} />
          <KpiCard label="Conversions" value={NUMBER_FMT.format(totalConversions)} sub={avgCpc > 0 ? `Avg CPC: ${microsToDisplay(avgCpc, account.currency)}` : undefined} />
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

      {/* Campaigns table */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            Campaigns ({campaigns.length})
          </h3>
          <span className="text-[11px] text-zinc-500">Sort theo Spend 30d ↓</span>
        </div>
        {campaigns.length === 0 ? (
          <p className="text-xs text-zinc-500 italic px-4 py-6 text-center">
            Chưa có campaign nào trong account. Sync data từ FB Ads để pull
            campaign list.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Campaign</th>
                  <th className="text-left px-3 py-2 font-medium">Objective</th>
                  <th className="text-center px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Spend 30d</th>
                  <th className="text-right px-3 py-2 font-medium">Impressions</th>
                  <th className="text-right px-3 py-2 font-medium">Clicks</th>
                  <th className="text-right px-3 py-2 font-medium">CTR</th>
                  <th className="text-right px-3 py-2 font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/ads/${id}/campaigns/${c.id}`}
                        className="font-medium text-zinc-900 hover:text-blue-700 truncate max-w-[260px] block"
                        title={c.name}
                      >
                        {c.name} →
                      </Link>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        ID: {c.externalId}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {OBJECTIVE_LABEL[c.objective] ?? c.objective}
                    </td>
                    <td className="text-center px-3 py-2">
                      <span
                        className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ring-1',
                          STATUS_BADGE_CLS[c.status.toUpperCase()] ?? 'bg-zinc-50 text-zinc-600 ring-zinc-200'
                        )}
                      >
                        {c.status}
                      </span>
                    </td>
                    {c.summary30d ? (
                      <>
                        <td className="text-right px-3 py-2 tabular-nums">
                          {microsToDisplay(c.summary30d.spendMicros, account.currency)}
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums">
                          {NUMBER_FMT.format(c.summary30d.impressions)}
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums">
                          {NUMBER_FMT.format(c.summary30d.clicks)}
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums">
                          {(c.summary30d.ctr * 100).toFixed(2)}%
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums">
                          {NUMBER_FMT.format(c.summary30d.conversions)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={5} className="px-3 py-2 text-center text-zinc-400 italic">
                        Không có data 30d
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
