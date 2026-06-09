import { Metadata } from 'next';
import { getKpiData, getTrendData } from '@/lib/cache/dashboard-cache';
import { fetchChannelsTable } from '@/lib/queries/dashboard-channels-table';
import { fetchUnreadAlerts } from '@/lib/queries/alerts';
import { fetchTopPerformers } from '@/lib/queries/dashboard-top-performers';
import { fetchFollowersTrend } from '@/lib/queries/dashboard-followers-trend';
import { listAllTags } from '@/lib/queries/channel-tags';
import { parseRangeParam } from '@/lib/dashboard/time-range';
import { KpiHeroGrid } from '@/components/dashboard/kpi-hero-grid';
import { PerformanceTrendChart } from '@/components/dashboard/performance-trend-chart';
import { ChannelsTable } from '@/components/dashboard/channels-table';
import { FollowersTrendChart } from '@/components/dashboard/followers-trend-chart';
import { TopPerformersRankedList } from '@/components/dashboard/top-performers-ranked-list';
import { ActiveCampaignsList } from '@/components/dashboard/active-campaigns-list';
import { AlertsFeed } from '@/components/dashboard/alerts-feed';
import { TimeRangeSelector } from '@/components/dashboard/time-range-selector';
import {
  ChannelTagTabs,
  type ChannelTagOption,
} from '@/components/dashboard/channel-tag-tabs';

export const metadata: Metadata = {
  title: 'Dashboard — Marketing OS',
};

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Normalize searchParams.tag → string|null. Array hoặc empty/invalid → null
 *  (tab "Tổng"). Slug được inject vào SQL string nên PHẢI validate format. */
function parseTagParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return null;
  if (!value || value.trim() === '') return null;
  if (!/^[a-z0-9-]+$/.test(value)) return null;
  return value;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const days = parseRangeParam(params.range);
  const tagSlug = parseTagParam(params.tag);

  // Fetch in parallel — independent queries, no shared state.
  // tagSlug truyền cùng days vào mọi query → toàn bộ KPI/chart/table filter
  // đồng bộ theo nhóm kênh đang chọn. listAllTags() build tab list.
  const [kpi, trend, channels, alerts, topPerformers, followersTrend, tags] =
    await Promise.all([
      getKpiData(days, tagSlug),
      getTrendData(days, tagSlug),
      fetchChannelsTable(days, tagSlug),
      fetchUnreadAlerts(10),
      fetchTopPerformers(days, 5, tagSlug),
      fetchFollowersTrend(days, tagSlug),
      listAllTags(),
    ]);

  // Build tab options: "Tổng" đầu list (slug=null) + danh sách tag từ DB.
  const tagOptions: ChannelTagOption[] = [
    { slug: null, label: 'Tổng' },
    ...tags.map((t) => ({ slug: t.slug, label: t.name })),
  ];

  const activeTagName =
    tagSlug !== null ? tags.find((t) => t.slug === tagSlug)?.name ?? null : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header — title + time range selector */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Bảng điều khiển CEO</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {activeTagName ? (
              <>
                Nhóm <span className="font-medium text-zinc-700">{activeTagName}</span>{' '}
                · {days} ngày qua (không tính hôm nay)
              </>
            ) : (
              <>Hiệu suất toàn hệ thống · {days} ngày qua (không tính hôm nay)</>
            )}
          </p>
        </div>
        <TimeRangeSelector current={days} />
      </div>

      {/* Channel tag tabs — segmented control phía trên KPI grid */}
      <ChannelTagTabs current={tagSlug} options={tagOptions} />

      {/* Tier 1: 4 KPI cards with sparklines (Lead = Ladipage + tin nhắn) */}
      <KpiHeroGrid data={kpi} days={days} trend={trend} />

      {/* Tier 2: Performance trend full-width */}
      <PerformanceTrendChart data={trend} days={days} />

      {/* Tier 3: Chanel table full-width (replaces sidebar Channel Health widget) */}
      <ChannelsTable data={channels} days={days} />

      {/* Tier 3b: Multi-line follower trend per channel — đặt ngay sau bảng
          channels vì cùng "domain" (per-channel detail) và chart cung cấp
          context cho cột Followers ở table phía trên. */}
      <FollowersTrendChart data={followersTrend} days={days} />

      {/* Tier 4: Top Performers / Alerts / Active Campaigns.
          On <lg, stack full-width. On md, 2-col with campaigns wrapping. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TopPerformersRankedList performers={topPerformers} days={days} />
        <AlertsFeed initialData={alerts} />
        <ActiveCampaignsList />
      </div>
    </div>
  );
}
