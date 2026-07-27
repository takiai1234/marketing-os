// DB layer cho news_article: query (list, filter by source) + upsert + prune.
//
// Tách riêng khỏi fetch-news.ts để dễ test và để fetch-news.ts gọn lại
// (chỉ là cached wrapper quanh query).

import { db } from '@/lib/db';
import type { NewsItem } from './types';
import type { MappedNewsArticle } from './apify-mapper';

/** Row trả về từ SELECT — snake_case như DB. */
interface NewsArticleRow {
  id: string;
  source: string;
  title: string;
  link: string;
  description: string | null;
  cover_image: string | null;
  published_at: string | null;
  fetched_at: string;
  likes_count: number | null;
  shares_count: number | null;
}

/** Shape trả về cho UI — gộp NewsItem + source. */
export interface StoredNewsItem extends NewsItem {
  source: string;
  likesCount: number | null;
  sharesCount: number | null;
}

/** Kiểu sort được hỗ trợ. */
export type NewsSortOrder = 'newest' | 'engagement';

const LIST_DEFAULT_LIMIT = 60;
const PRUNE_DAYS = 30;

/**
 * List tin tức từ DB.
 *
 * @param sourceId   — undefined: trả tất cả. Có giá trị: filter WHERE source = $1
 * @param limit      — bao nhiêu tin trả về (default 60)
 * @param offset     — offset phân trang
 * @param sortOrder  — 'newest' (default): mới nhất trước; 'engagement': nhiều likes+shares trước
 */
export async function listNewsArticles(
  sourceId?: string,
  limit: number = LIST_DEFAULT_LIMIT,
  offset: number = 0,
  sortOrder: NewsSortOrder = 'newest'
): Promise<StoredNewsItem[]> {
  const params: (string | number)[] = [];
  const conds: string[] = ['hidden = false']; // luôn ẩn bài đã bị admin ẩn
  if (sourceId) {
    params.push(sourceId);
    conds.push(`source = $${params.length}`);
  }
  const where = `WHERE ${conds.join(' AND ')}`;
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  // Sắp xếp: RSS/social theo ngày đăng (published_at). RIÊNG facebook_ads sắp
  // theo fetched_at (thời điểm quét) — vì ad có "ngày bắt đầu chạy" cũ, nếu
  // dùng published_at sẽ bị chìm xuống dưới feed, vừa quét xong không thấy đâu.
  const orderBy =
    sortOrder === 'engagement'
      ? `(COALESCE(likes_count, 0) + COALESCE(shares_count, 0)) DESC, fetched_at DESC`
      : `(CASE WHEN source_type = 'facebook_ads' THEN fetched_at ELSE published_at END)
           DESC NULLS LAST,
         fetched_at DESC`;

  const { rows } = await db.query<NewsArticleRow>(
    `
    SELECT id, source, title, link, description, cover_image,
           published_at, fetched_at, likes_count, shares_count
    FROM news_article
    ${where}
    ORDER BY ${orderBy}
    LIMIT ${limitParam} OFFSET ${offsetParam}
    `,
    params
  );

  return rows.map(rowToItem);
}

/** Đếm tổng số tin (cho phân trang). Optional filter theo source. */
export async function countNewsArticles(sourceId?: string): Promise<number> {
  const params: string[] = [];
  const conds: string[] = ['hidden = false'];
  if (sourceId) {
    params.push(sourceId);
    conds.push(`source = $${params.length}`);
  }
  const where = `WHERE ${conds.join(' AND ')}`;
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM news_article ${where}`,
    params
  );
  return rows[0]?.count ?? 0;
}

/** Ẩn 1 bài khỏi danh sách (soft-hide). Trả về true nếu có row bị ẩn. */
export async function hideNewsArticle(id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE news_article SET hidden = true WHERE id = $1 AND hidden = false`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

function rowToItem(row: NewsArticleRow): StoredNewsItem {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    link: row.link,
    excerpt: row.description ?? '',
    coverImage: row.cover_image,
    pubDate: row.published_at,
    likesCount: row.likes_count ?? null,
    sharesCount: row.shares_count ?? null,
  };
}

/**
 * Bulk upsert: chỉ INSERT những link chưa tồn tại.
 * Trả về số row thực sự được insert (để cron log biết "thêm bao nhiêu tin mới").
 *
 * Tại sao ON CONFLICT DO NOTHING thay vì DO UPDATE?
 *   - Tin tức RSS không đổi sau khi publish (title/desc cố định)
 *   - Tránh ghi đè dữ liệu đã enrich tay (nếu sau này có tính năng đó)
 *   - Đơn giản hóa logic, KISS
 */
export async function upsertNewsItems(
  source: string,
  items: NewsItem[]
): Promise<number> {
  if (items.length === 0) return 0;

  // Multi-row INSERT — 1 round trip thay vì N. Param order: 6 cột × N item.
  const values: string[] = [];
  const params: (string | null)[] = [];
  items.forEach((item, i) => {
    const base = i * 6;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
    );
    params.push(
      source,
      item.title,
      item.link,
      item.excerpt || null,
      item.coverImage,
      item.pubDate
    );
  });

  const { rowCount } = await db.query(
    `
    INSERT INTO news_article (source, title, link, description, cover_image, published_at)
    VALUES ${values.join(', ')}
    ON CONFLICT (link) DO NOTHING
    `,
    params
  );

  return rowCount ?? 0;
}

/**
 * Bulk upsert Apify items (Twitter/Facebook posts) → news_article.
 * Khác upsertNewsItems vì có thêm source_type, author_handle/name/avatar,
 * raw_payload (JSONB).
 *
 * Dedupe theo link (cùng UNIQUE constraint với RSS). Trả về số row insert thật.
 */
export async function upsertApifyArticles(
  items: MappedNewsArticle[]
): Promise<number> {
  if (items.length === 0) return 0;

  // 13 cột: source, source_type, title, link, description, cover_image,
  // published_at, author_handle, author_name, author_avatar, raw_payload,
  // likes_count, shares_count
  const values: string[] = [];
  const params: unknown[] = [];
  items.forEach((it, i) => {
    const base = i * 13;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
        `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, ` +
        `$${base + 11}::jsonb, $${base + 12}, $${base + 13})`
    );
    params.push(
      it.source,
      it.sourceType,
      it.title,
      it.link,
      it.description,
      it.coverImage,
      it.publishedAt,
      it.authorHandle,
      it.authorName,
      it.authorAvatar,
      JSON.stringify(it.rawPayload),
      it.likesCount ?? null,
      it.sharesCount ?? null
    );
  });

  const { rowCount } = await db.query(
    `
    INSERT INTO news_article
      (source, source_type, title, link, description, cover_image,
       published_at, author_handle, author_name, author_avatar, raw_payload,
       likes_count, shares_count)
    VALUES ${values.join(', ')}
    ON CONFLICT (link) DO NOTHING
    `,
    params
  );

  return rowCount ?? 0;
}

/**
 * Xóa tin cũ hơn N ngày dựa trên published_at (NULL → fallback fetched_at).
 * Chạy cuối job ingestion để DB không phình.
 *
 * @returns số row đã xóa (cho cron log)
 */
export async function pruneOldNewsArticles(days: number = PRUNE_DAYS): Promise<number> {
  const { rowCount } = await db.query(
    `
    DELETE FROM news_article
    WHERE COALESCE(published_at, fetched_at) < NOW() - $1::interval
    `,
    [`${days} days`]
  );
  return rowCount ?? 0;
}
