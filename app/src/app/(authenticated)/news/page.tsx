// Tab Tin tức AI — đọc DB (đã được cron ingest từ RSS).
// Server component: dùng cached fetcher (5 phút TTL) → query DB rẻ + tươi.
//
// Filter theo source qua searchParams ?source=... (handled in NewsSourceTabs).

import type { Metadata } from 'next';
import type { StoredNewsItem } from '@/lib/news/news-db';
import { getAiNews } from '@/lib/news/fetch-news';
import { VALID_SOURCE_IDS } from '@/lib/news/sources';
import { NewsItemCard } from './news-item-card';
import { NewsSourceTabs } from './news-source-tabs';
import { NewsFetchNowButton } from './news-fetch-now-button';
import { NewsScanForm } from './news-scan-form';
import { NewsPagination } from './news-pagination';

export const metadata: Metadata = {
  title: 'Tin tức AI — Marketing OS',
};

const NUMBER_FMT = new Intl.NumberFormat('vi-VN');

interface NewsPageProps {
  // Next.js 16: searchParams là Promise — phải await trước khi đọc.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Đảm bảo sourceId từ URL là 1 trong set hợp lệ — chống open-ended input. */
function parseSourceFilter(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  return VALID_SOURCE_IDS.has(raw) ? raw : undefined;
}

/** Parse ?page= → số nguyên ≥ 1. Sai/thiếu → 1. */
function parsePage(raw: string | string[] | undefined): number {
  if (typeof raw !== 'string') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const sourceFilter = parseSourceFilter(params.source);
  const page = parsePage(params.page);
  const { items, total, pageSize } = await getAiNews(sourceFilter, page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Tin tức AI</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Tổng hợp từ VentureBeat · TechCrunch · The Verge · Marktechpost · cập nhật mỗi giờ
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="text-xs text-zinc-500">
            {NUMBER_FMT.format(total)} bài
            {totalPages > 1 && (
              <span className="text-zinc-400"> · trang {page}/{totalPages}</span>
            )}
          </p>
          <NewsFetchNowButton />
        </div>
      </div>

      {/* Quét Facebook Ads Library theo link */}
      <NewsScanForm />

      {/* Source tabs */}
      <NewsSourceTabs />

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <NewsGrid items={items} />
          <NewsPagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

function NewsGrid({ items }: { items: StoredNewsItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <NewsItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-700">
        Chưa có tin nào
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Cron job chạy mỗi giờ. Nếu vừa migrate xong, đợi tới lần fetch kế tiếp
        hoặc kích hoạt thủ công bằng API/script.
      </p>
    </div>
  );
}
