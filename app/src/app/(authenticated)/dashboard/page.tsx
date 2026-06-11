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
  const tagSlug = parseTagParam(params.tag);

  // Resolve date range từ URL (?range=7|14|30|90|custom + ?from=&to=)
  const range = resolveRangeFromSearchParams({
    range: params.range,
    from: params.from,
    to: params.to,
  });
  const { prevSinceIso, prevUntilIso } = previousPeriodOf(
    range.sinceIso,
    range.untilIso
  );
  const days = range.days;

  // Step 3 (incremental rollout): KPI + Trend + Channels table dùng dateRange.
  // 2 query khác (followers, top performers) vẫn dùng `days` legacy.
  // Step 4-5 sẽ refactor tiếp.
  const kpiRange = {
    sinceIso: range.sinceIso,
    untilIso: range.untilIso,
    prevSinceIso,
    prevUntilIso,
  };
  const simpleRange = {
    sinceIso: range.sinceIso,
    untilIso: range.untilIso,
  };

  const [
    kpi,
    trend,
    channels,
    alerts,
    topPerformers,
    followersTrend,
    topReachPosts,
    tags,
  ] = await Promise.all([
    getKpiData(days, null, kpiRange),
    getTrendData(days, null, simpleRange),
    fetchChannelsTable(days, tagSlug, simpleRange),
    fetchUnreadAlerts(10),
    fetchTopPerformers(days, 5),
    fetchFollowersTrend(days),
    fetchTopReachPosts(days, 5),
    listAllTags(),
  ]);

  // Build tab options: "Tổng" đầu list (slug=null) + danh sách tag từ DB.
  const tagOptions: ChannelTagOption[] = [
    { slug: null, label: 'Tổng' },
    ...tags.map((t) => ({ slug: t.slug, label: t.name })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header — title + date range picker */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Bảng điều khiển CEO</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {range.mode === 'custom' ? (
              <>
                KPI + Trend + Bảng kênh: {range.sinceIso} → {range.untilIso} ({days}
                ngày) · Followers/Top performers: {days} ngày qua
              </>
            ) : (
              <>Hiệu suất toàn hệ thống · {days} ngày qua (không tính hôm nay)</>
            )}
          </p>
        </div>
        <DashboardDateRangePicker
          currentMode={range.mode}
          currentPreset={range.preset}
          currentFromIso={range.sinceIso}
          currentToIso={range.untilIso}
        />
      </div>

      {/* Tier 1: 4 KPI cards with sparklines (Lead = Ladipage + tin nhắn) */}
      <KpiHeroGrid data={kpi} days={days} trend={trend} />

      {/* Tier 2: Performance trend full-width */}
      <PerformanceTrendChart data={trend} days={days} />

      {/* Tier 3: Chanel table — tag tabs đặt ngay dưới title "Chanel" trong
          card này, scope filter giới hạn ở đây (KPI/trend/top performers
          phía trên KHÔNG bị filter theo nhóm kênh). */}
      <ChannelsTable
        data={channels}
        days={days}
        tagTabs={
          tagOptions.length > 1 ? (
            <ChannelTagTabs current={tagSlug} options={tagOptions} />
          ) : null
        }
      />

      {/* Tier 3b: Multi-line follower trend per channel — đặt ngay sau bảng
          channels vì cùng "domain" (per-channel detail) và chart cung cấp
          context cho cột Followers ở table phía trên. */}
      <FollowersTrendChart data={followersTrend} days={days} />

      {/* Tier 4: Top Performers / Alerts / Top Reach Posts.
          On <lg, stack full-width. On md, 2-col with widgets wrapping.
          Top Reach Posts thay thế Active Campaigns (mock data) — show
          các bài reach cao nhất kèm nút "Viết lại" để remix nhanh. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TopPerformersRankedList performers={topPerformers} days={days} />
        <AlertsFeed initialData={alerts} />
        <TopReachPostsList posts={topReachPosts} days={days} />
      </div>
    </div>
  );
}
