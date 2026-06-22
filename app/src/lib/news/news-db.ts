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
}

/** Shape trả về cho UI — gộp NewsItem + source. */
export interface StoredNewsItem extends NewsItem {
  source: string;
}

const LIST_DEFAULT_LIMIT = 60;
const PRUNE_DAYS = 30;

/**
 * List tin tức từ DB, sắp xếp mới nhất trước (NULL pubDate xuống cuối).
 *
 * @param sourceId — undefined: trả tất cả. Có giá trị: filter WHERE source = $1
 * @param limit — bao nhiêu tin trả về (default 60 ≈ 5 hàng × 12 cột mobile)
 */
export async function listNewsArticles(
  sourceId?: string,
  limit: number = LIST_DEFAULT_LIMIT
): Promise<StoredNewsItem[]> {
  const params: (string | number)[] = [];
  let where = '';
  if (sourceId) {
    params.push(sourceId);
    where = `WHERE source = $1`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  // Sắp xếp: RSS/social theo ngày đăng (published_at). RIÊNG facebook_ads sắp
  // theo fetched_at (thời điểm quét) — vì ad có "ngày bắt đầu chạy" cũ, nếu
  // dùng published_at sẽ bị chìm xuống dưới feed, vừa quét xong không thấy đâu.
  // Dùng fetched_at để ad mới quét nổi lên đầu như "vừa thêm".
  const { rows } = await db.query<NewsArticleRow>(
    `
    SELECT id, source, title, link, description, cover_image, published_at, fetched_at
    FROM news_article
    ${where}
    ORDER BY
      (CASE WHEN source_type = 'facebook_ads' THEN fetched_at ELSE published_at END)
        DESC NULLS LAST,
      fetched_at DESC
    LIMIT ${limitParam}
    `,
    params
  );

  return rows.map(rowToItem);
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

  const COLS = 10; // source, source_type, title, link, description, cover_image,
                   // published_at, author_handle, author_name, author_avatar, raw_payload
                   // → 11 cột thực tế (raw_payload JSONB)
  // Tách raw_payload thành param riêng vì JSONB cast cần ::jsonb
  const values: string[] = [];
  const params: unknown[] = [];
  items.forEach((it, i) => {
    const base = i * 11;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
        `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, ` +
        `$${base + 11}::jsonb)`
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
      JSON.stringify(it.rawPayload)
    );
  });

  // Bỏ biến COLS unused warning bằng cách dùng nó trong assert ngầm — TS pure
  void COLS;

  const { rowCount } = await db.query(
    `
    INSERT INTO news_article
      (source, source_type, title, link, description, cover_image,
       published_at, author_handle, author_name, author_avatar, raw_payload)
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
