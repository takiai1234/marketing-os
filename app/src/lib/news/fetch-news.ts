// PUBLIC API cho UI: lấy tin từ DB (đã được cron ingest từ RSS).
//
// Thay đổi so với version cũ (in-memory only):
//   - KHÔNG fetch trực tiếp RSS endpoint từ request người dùng
//   - Cron job-news-ingestion ăn RSS → ghi DB → page chỉ đọc DB
//   → Tránh hammer endpoint, dữ liệu giàu dần theo thời gian
//
// Vẫn giữ unstable_cache (5 phút) vì:
//   - Query DB tuy nhanh nhưng không free (network + parse)
//   - 1 cache entry per source-filter combination
//   - 5 phút đủ để hấp thụ traffic spike, đủ tươi vì cron chạy 1h/lần

import { unstable_cache } from 'next/cache';
import {
  listNewsArticles,
  countNewsArticles,
  type StoredNewsItem,
  type NewsSortOrder,
} from './news-db';

const CACHE_TTL_SECONDS = 300; // 5 phút

/** Số tin mỗi trang. */
export const NEWS_PAGE_SIZE = 60;

export interface NewsPage {
  items: StoredNewsItem[];
  total: number;
  pageSize: number;
}

/**
 * Lấy 1 trang tin tức, optional filter theo source id và sort order.
 *
 * @param sourceId  — undefined: all sources. 'venturebeat-ai'|'techcrunch-ai'|...
 * @param page      — số trang (1-based). Offset = (page-1) * NEWS_PAGE_SIZE.
 * @param sortOrder — 'newest' (default) | 'engagement' (nhiều likes+shares nhất)
 *
 * Cache key bao gồm sourceId + page + sortOrder → mỗi combo có entry riêng.
 */
export const getAiNews = unstable_cache(
  async (
    sourceId?: string,
    page: number = 1,
    sortOrder: NewsSortOrder = 'newest'
  ): Promise<NewsPage> => {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const offset = (safePage - 1) * NEWS_PAGE_SIZE;
    try {
      const [items, total] = await Promise.all([
        listNewsArticles(sourceId, NEWS_PAGE_SIZE, offset, sortOrder),
        countNewsArticles(sourceId),
      ]);
      return { items, total, pageSize: NEWS_PAGE_SIZE };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('[news/fetch-news] DB query failed:', msg);
      return { items: [], total: 0, pageSize: NEWS_PAGE_SIZE };
    }
  },
  ['ai-news-list-v4'],
  { tags: ['news'], revalidate: CACHE_TTL_SECONDS }
);
