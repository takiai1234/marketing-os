import { Metadata } from 'next';
import { getKpiData, getTrendData } from '@/lib/cache/dashboard-cache';
import { fetchChannelsTable } from '@/lib/queries/dashboard-channels-table';
import { fetchUnreadAlerts } from '@/lib/queries/alerts';
import { fetchTopPerformers } from '@/lib/queries/dashboard-top-performers';
import { fetchFollowersTrend } from '@/lib/queries/dashboard-followers-trend';
import { fetchTopReachPosts } from '@/lib/queries/dashboard-top-reach-posts';
import { listAllTags } from '@/lib/queries/channel-tags';
import {
  resolveRangeFromSearchParams,
  previousPeriodOf,
} from '@/lib/dashboard/time-range';
import { KpiHeroGrid } from '@/components/dashboard/kpi-hero-grid';
import { PerformanceTrendChart } from '@/components/dashboard/performance-trend-chart';
import { ChannelsTable } from '@/components/dashboard/channels-table';
import { FollowersTrendChart } from '@/components/dashboard/followers-trend-chart';
import { TopPerformersRankedList } from '@/components/dashboard/top-performers-ranked-list';
import { TopReachPostsList } from '@/components/dashboard/top-reach-posts-list';
import { AlertsFeed } from '@/components/dashboard/alerts-feed';
import { DashboardDateRangePicker } from '@/components/dashboard/date-range-picker';
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

/** Normalize searchParams.tag → string|null. Slug injected vào SQL string
 *  nên PHẢI validate format. */
function parseTagParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return null;
  if (!value || value.trim() === '') return null;
  if (!/^[a-z0-9-]+$/.test(value)) return null;
  return value;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const tagSlug = parseTagParam(params.tag);

  // Resolve date range from URL (?range=7|14|30|90|custom + ?from=&to=)
  const range = resolveRangeFromSearchParams({
    range: params.range,
    from: params.from,
    to: params.to,
  });
  const { prevSinceDate, prevUntilDate } = previousPeriodOf(
    range.sinceDate,
    range.untilDate
  );
  const days = range.days;

  // Pack date range options cho queries
  const kpiRange = {
    sinceDate: range.sinceDate,
    untilDate: range.untilDate,
    prevSinceDate,
    prevUntilDate,
  };
  const trendRange = {
    sinceDate: range.sinceDate,
    untilDate: range.untilDate,
  };

  // Tag scope: CHỈ bảng "Chanel" filter theo tag. KPI/trend/top performers
  // VẪN tính toàn hệ thống.
  // tagSlug truyền duy nhất vào fetchChannelsTable.
  const [kpi, trend, channels, alerts, topPerformers, followersTrend, topReachPosts, tags] =
    await Promise.all([
      getKpiData(days, null, kpiRange),
      getTrendData(days, null, trendRange),
      fetchChannelsTable(days, tagSlug, trendRange),
      fetchUnreadAlerts(10),
      fetchTopPerformers(days, 5, null, trendRange),
      fetchFollowersTrend(days, null, trendRange),
      fetchTopReachPosts(days, 5),
      listAllTags(),
    ]);

  // Build tag tab options
  const tagOptions: ChannelTagOption[] = [
    { slug: null, label: 'Tổng' },
    ...tags.map((t) => ({ slug: t.slug, label: t.name })),
  ];

  // Subtitle text — show range info
  const rangeLabel =
    range.mode === 'custom'
      ? `${range.fromIso} → ${range.toIso} (${days} ngày)`
      : `${days} ngày qua (không tính hôm nay)`;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header — title + date range picker */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Bảng điều khiển CEO</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Hiệu suất toàn hệ thống · {rangeLabel}
          </p>
        </div>
        <DashboardDateRangePicker
          currentMode={range.mode}
          currentPreset={range.preset}
          currentFromIso={range.fromIso}
          currentToIso={range.toIso}
        />
      </div>

      {/* Tier 1: 4 KPI cards with sparklines */}
      <KpiHeroGrid data={kpi} days={days} trend={trend} />

      {/* Tier 2: Performance trend full-width */}
      <PerformanceTrendChart data={trend} days={days} />

      {/* Tier 3: Chanel table — tag tabs ngay dưới title "Chanel" */}
      <ChannelsTable
        data={channels}
        days={days}
        tagTabs={
          tagOptions.length > 1 ? (
            <ChannelTagTabs current={tagSlug} options={tagOptions} />
          ) : null
        }
      />

      {/* Tier 3b: Multi-line follower trend per channel */}
      <FollowersTrendChart data={followersTrend} days={days} />

      {/* Tier 4: Top Performers / Alerts / Top Reach Posts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TopPerformersRankedList performers={topPerformers} days={days} />
        <AlertsFeed initialData={alerts} />
        <TopReachPostsList posts={topReachPosts} days={days} />
      </div>
    </div>
  );
}
