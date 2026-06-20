// Mappers: Apify item (Twitter/Facebook) → news_article row.
//
// Apify actor output shape khác nhau giữa actor — file này thử nhiều field
// candidates (defensive) để hoạt động với nhiều actor phổ biến nhất:
//   Twitter: apidojo/twitter-scraper-lite, quacker/twitter-scraper,
//            kaitoeasyapi/twitter-x-data-tweet-scraper, apify/twitter-scraper
//   Facebook: apify/facebook-posts-scraper, apify/facebook-pages-scraper,
//             apidojo/facebook-pages-scraper
//
// Field naming có nhiều convention: text/full_text/content/postContent/message,
// url/twitterUrl/postUrl/facebookUrl/permalink, createdAt/created_at/time/date.
// → coalesceField() thử list keys, return first truthy.
//
// Raw payload luôn lưu nguyên — nếu mapping sai field trong tương lai, vẫn
// có thể re-process từ DB không cần re-scrape Apify.

export type ApifySourceType = 'twitter' | 'facebook' | 'facebook_ads';

export interface MappedNewsArticle {
  source: string;          // news_article.source (vd "twitter:sama")
  sourceType: ApifySourceType;
  title: string;           // First N chars of content (news_article.title NOT NULL)
  link: string;            // Canonical post URL (UNIQUE dedupe key)
  description: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
  authorHandle: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  rawPayload: Record<string, unknown>;
}

// ─── Generic helpers ────────────────────────────────────────────────────

function coalesceField(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Lấy nested value: getNested({a:{b:'x'}}, ['a','b']) → 'x'. */
function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

// ─── Twitter mapper ─────────────────────────────────────────────────────

/** Map Apify Twitter item → MappedNewsArticle. Trả null nếu item thiếu URL
 *  hoặc nội dung (không thể dedupe / hiển thị). */
export function mapTwitterItem(
  item: Record<string, unknown>
): MappedNewsArticle | null {
  // Content: text/full_text/fullText (apidojo dùng "text", quacker dùng "full_text")
  const text = coalesceField(item, ['text', 'full_text', 'fullText', 'content']);
  // URL: url/twitterUrl/tweetUrl/permalink
  const url = coalesceField(item, ['url', 'twitterUrl', 'tweetUrl', 'permalink']);

  if (!url || !text) return null;

  // Author: thường nested trong author/user object, hoặc flat field
  const authorHandle =
    asString(getNested(item, ['author', 'userName'])) ??
    asString(getNested(item, ['author', 'username'])) ??
    asString(getNested(item, ['author', 'screen_name'])) ??
    asString(getNested(item, ['user', 'screen_name'])) ??
    asString(getNested(item, ['user', 'username'])) ??
    coalesceField(item, ['username', 'screen_name', 'authorUsername']);

  const authorName =
    asString(getNested(item, ['author', 'name'])) ??
    asString(getNested(item, ['user', 'name'])) ??
    coalesceField(item, ['authorName']);

  const authorAvatar =
    asString(getNested(item, ['author', 'profile_image_url_https'])) ??
    asString(getNested(item, ['author', 'profileImageUrl'])) ??
    asString(getNested(item, ['author', 'profilePicture'])) ??
    asString(getNested(item, ['user', 'profile_image_url_https'])) ??
    coalesceField(item, ['profileImageUrl', 'profile_image_url']);

  const createdAt = parseDate(
    item.createdAt ?? item.created_at ?? item.date ?? item.time ?? item.timestamp
  );

  // Cover image: tweet attached media (photos[0].url) or video preview
  const coverImage =
    asString(getNested(item, ['media', '0', 'url'])) ??
    asString(getNested(item, ['photos', '0', 'url'])) ??
    asString(getNested(item, ['mediaUrls', '0'])) ??
    asString(getNested(item, ['extendedEntities', 'media', '0', 'media_url_https']));

  const title = truncate(text.replace(/\s+/g, ' ').trim(), 120);
  const description = truncate(text, 500);

  return {
    source: authorHandle ? `twitter:${authorHandle}` : 'twitter:unknown',
    sourceType: 'twitter',
    title,
    link: url,
    description,
    coverImage,
    publishedAt: createdAt,
    authorHandle,
    authorName,
    authorAvatar,
    rawPayload: item,
  };
}

// ─── Facebook mapper ────────────────────────────────────────────────────

/** Map Apify Facebook post item → MappedNewsArticle. */
export function mapFacebookItem(
  item: Record<string, unknown>
): MappedNewsArticle | null {
  // Content: text/postContent/message
  const text = coalesceField(item, [
    'text', 'postContent', 'message', 'content', 'postText',
  ]);
  // URL: url/postUrl/facebookUrl/permalink_url
  const url = coalesceField(item, [
    'url', 'postUrl', 'facebookUrl', 'permalink_url', 'permalinkUrl',
  ]);

  if (!url || !text) return null;

  // FB author: page hoặc user — nested trong page/author/user
  const authorHandle =
    asString(getNested(item, ['page', 'name'])) ??
    asString(getNested(item, ['page', 'username'])) ??
    asString(getNested(item, ['author', 'name'])) ??
    asString(getNested(item, ['user', 'name'])) ??
    coalesceField(item, ['pageName', 'authorName', 'pageUrl']);

  const authorName =
    asString(getNested(item, ['page', 'displayName'])) ??
    asString(getNested(item, ['page', 'name'])) ??
    asString(getNested(item, ['author', 'name'])) ??
    authorHandle;

  const authorAvatar =
    asString(getNested(item, ['page', 'profilePicture'])) ??
    asString(getNested(item, ['author', 'profilePicture'])) ??
    asString(getNested(item, ['pageProfilePictureUrl']));

  const publishedAt = parseDate(
    item.time ?? item.publishedTime ?? item.createdAt ?? item.created_at ??
      item.timestamp ?? item.date
  );

  const coverImage =
    asString(getNested(item, ['media', '0', 'url'])) ??
    asString(getNested(item, ['attachments', '0', 'url'])) ??
    asString(getNested(item, ['previewImage'])) ??
    coalesceField(item, ['thumbnailUrl', 'imageUrl', 'coverImage']);

  const title = truncate(text.replace(/\s+/g, ' ').trim(), 120);
  const description = truncate(text, 500);

  return {
    source: authorHandle ? `facebook:${authorHandle}` : 'facebook:unknown',
    sourceType: 'facebook',
    title,
    link: url,
    description,
    coverImage,
    publishedAt,
    authorHandle,
    authorName,
    authorAvatar,
    rawPayload: item,
  };
}

// ─── Facebook Ads Library mapper ────────────────────────────────────────
//
// Khác mapFacebookItem (post trên page), đây là quảng cáo từ Ads Library.
// Output shape phụ thuộc actor — phổ biến nhất:
//   apify/facebook-ads-scraper, curious_coder/facebook-ads-library-scraper
// Các actor này gói nội dung ad trong `snapshot` (body.text, images, videos,
// cards, title, pageProfilePictureURL) + metadata phẳng (adArchiveID, pageName,
// startDate, url). Field naming lẫn lộn camelCase/snake/UPPER → thử nhiều key.

/** startDate của ad library thường là epoch (giây HOẶC ms) hoặc ISO string.
 *  parseDate() coi number là ms → epoch giây sẽ ra 1970. Tự normalize giây→ms. */
function parseAdDate(v: unknown): Date | null {
  if (typeof v === 'number') {
    // < 10^12 ≈ trước năm 2001 nếu tính bằng ms → chắc chắn là giây
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  return parseDate(v);
}

export function mapFacebookAdItem(
  item: Record<string, unknown>
): MappedNewsArticle | null {
  const snapshot = (item.snapshot ?? {}) as Record<string, unknown>;

  // Nội dung ad: snapshot.body.text → card đầu tiên → field phẳng
  const text =
    asString(getNested(snapshot, ['body', 'text'])) ??
    asString(getNested(snapshot, ['cards', '0', 'body'])) ??
    asString(snapshot.title) ??
    coalesceField(item, ['adText', 'bodyText', 'text', 'body', 'title']);

  // Link canonical: url trực tiếp → build từ ad archive id (dedupe key)
  const archiveId = coalesceField(item, [
    'adArchiveID', 'ad_archive_id', 'adArchiveId', 'adId', 'id',
  ]);
  const url =
    coalesceField(item, ['url', 'adLibraryUrl', 'adUrl', 'snapshotUrl']) ??
    (archiveId ? `https://www.facebook.com/ads/library/?id=${archiveId}` : null);

  if (!url) return null; // không có link → không dedupe được, bỏ

  const pageName =
    coalesceField(item, ['pageName', 'page_name', 'pageTitle']) ??
    asString(getNested(snapshot, ['page', 'name']));

  const authorAvatar =
    asString(getNested(snapshot, ['pageProfilePictureURL'])) ??
    asString(getNested(snapshot, ['pageProfilePictureUrl'])) ??
    coalesceField(item, ['pageProfilePictureUrl']);

  const publishedAt = parseAdDate(
    item.startDate ?? item.start_date ?? item.startDateFormatted ??
      item.createdAt ?? item.deliveryStartTime
  );

  const coverImage =
    asString(getNested(snapshot, ['images', '0', 'originalImageURL'])) ??
    asString(getNested(snapshot, ['images', '0', 'resizedImageUrl'])) ??
    asString(getNested(snapshot, ['images', '0', 'originalImageUrl'])) ??
    asString(getNested(snapshot, ['videos', '0', 'videoPreviewImageURL'])) ??
    asString(getNested(snapshot, ['videos', '0', 'videoPreviewImageUrl'])) ??
    asString(getNested(snapshot, ['cards', '0', 'originalImageURL'])) ??
    asString(getNested(snapshot, ['cards', '0', 'resizedImageUrl'])) ??
    coalesceField(item, ['imageUrl', 'thumbnailUrl', 'previewImage']);

  // Title: dùng text ad; nếu rỗng (ad chỉ có ảnh) → fallback theo page
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  const title = cleaned
    ? truncate(cleaned, 120)
    : pageName
      ? `Quảng cáo — ${pageName}`
      : 'Quảng cáo Facebook';
  const description = cleaned ? truncate(cleaned, 500) : null;

  return {
    source: pageName ? `facebook_ads:${pageName}` : 'facebook_ads:unknown',
    sourceType: 'facebook_ads',
    title,
    link: url,
    description,
    coverImage,
    publishedAt,
    authorHandle: pageName,
    authorName: pageName,
    authorAvatar,
    rawPayload: item,
  };
}

/** Route mapper theo source type. */
export function mapApifyItem(
  type: ApifySourceType,
  item: Record<string, unknown>
): MappedNewsArticle | null {
  if (type === 'twitter') return mapTwitterItem(item);
  if (type === 'facebook') return mapFacebookItem(item);
  if (type === 'facebook_ads') return mapFacebookAdItem(item);
  return null;
}
