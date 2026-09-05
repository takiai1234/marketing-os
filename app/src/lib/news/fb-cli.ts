// fb-cli — scrape Facebook page posts qua binary `fb` (tamnd/facebook-cli).
//
// Thay Apify actor apify/facebook-posts-scraper: `fb` đọc thẳng data mà
// facebook.com ship cho browser signed-out (Relay JSON inline), KHÔNG cần
// API token, KHÔNG tốn tiền actor.
//
// Giới hạn tier:
//   - Tier 0 (không session): mỗi page chỉ lấy được POST MỚI NHẤT (Facebook
//     signed-out chỉ ship 1 post đầu timeline). Cron 6h/lần vẫn gom dần được.
//   - Tier 1 (2 cookie c_user + xs từ browser đã đăng nhập): lấy được cả
//     timeline → set FB_SESSION_C_USER + FB_SESSION_XS trong settings.
//
// Binary path: env FB_CLI_PATH (default `fb` trên PATH — Docker image cài
// sẵn /usr/local/bin/fb). Data dir (cache + session): env FB_DATA_DIR
// (default <cwd>/storage/fb-cli — /app/storage đã writable bởi user nextjs).

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const FB_BIN = process.env.FB_CLI_PATH || 'fb';
const FB_DATA_DIR =
  process.env.FB_DATA_DIR || path.join(process.cwd(), 'storage', 'fb-cli');

// Per-call timeout: fb tự retry rate-limit, 1 page read thường <10s.
const EXEC_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 32 * 1024 * 1024;

export class FbCliError extends Error {
  constructor(message: string, public readonly exitCode?: number) {
    super(message);
    this.name = 'FbCliError';
  }
}

let dataDirReady = false;

/** Chạy fb với args + parse JSON output. Exit 3 (đọc OK nhưng rỗng) → []. */
async function runFb(args: string[]): Promise<Record<string, unknown>[]> {
  if (!dataDirReady) {
    await mkdir(FB_DATA_DIR, { recursive: true });
    dataDirReady = true;
  }

  const fullArgs = [
    ...args,
    '-o', 'json',
    '-q',
    '--color', 'never',
    '--data-dir', FB_DATA_DIR,
    '--timeout', '45s',
  ];

  const { stdout, exitCode } = await new Promise<{
    stdout: string;
    exitCode: number;
    stderr: string;
  }>((resolve, reject) => {
    execFile(
      FB_BIN,
      fullArgs,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          const code = typeof err.code === 'number' ? err.code : undefined;
          // Exit 3 = "the read worked and there was nothing in it" — không phải lỗi
          if (code === 3) {
            resolve({ stdout: '[]', exitCode: 3, stderr });
            return;
          }
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(
              new FbCliError(
                `Binary \`${FB_BIN}\` không tìm thấy. Cài fb (tamnd/facebook-cli) hoặc set FB_CLI_PATH.`
              )
            );
            return;
          }
          const detail = (stderr || stdout || err.message).trim().slice(0, 300);
          reject(new FbCliError(`fb ${args.join(' ')} fail (exit ${code ?? '?'}): ${detail}`, code));
          return;
        }
        resolve({ stdout, exitCode: 0, stderr });
      }
    );
  });

  if (exitCode === 3) return [];

  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new FbCliError(`fb ${args[0]} output không phải JSON: ${trimmed.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    // 1 record đơn lẻ → wrap
    return [parsed as Record<string, unknown>];
  }
  return parsed as Record<string, unknown>[];
}

/** Import session cookie (tier 1) — idempotent, ghi 0600 vào data dir. */
export async function importFbSession(cUser: string, xs: string): Promise<void> {
  await runFb(['auth', 'import', '--c-user', cUser, '--xs', xs]);
}

/** Normalize input page: slug, full URL, hoặc profile.php?id=N → ref fb hiểu. */
export function normalizePageRef(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('http')) return trimmed.replace(/^@/, '');
  try {
    const u = new URL(trimmed);
    const profileId = u.searchParams.get('id');
    if (u.pathname.includes('profile.php') && profileId) return profileId;
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg || trimmed;
  } catch {
    return trimmed;
  }
}

/** Feed của 1 page — tier 0 thực tế trả 1 post, tier 1 trả tới `limit`. */
export async function fetchFbPagePosts(
  pageRef: string,
  limit = 10
): Promise<Record<string, unknown>[]> {
  return runFb(['feed', pageRef, '-n', String(limit)]);
}

/** Avatar URL của page (fb page → avatar.uri). Null nếu không có. */
export async function fetchFbPageAvatar(pageRef: string): Promise<string | null> {
  const items = await runFb(['page', pageRef, '--fields', 'id,handle,name,avatar']);
  const avatar = items[0]?.avatar as Record<string, unknown> | undefined;
  const uri = avatar?.uri;
  return typeof uri === 'string' && uri ? uri : null;
}

/** Numeric page id để tra Ads Library (meta-ads-cli cần id, không nhận slug).
 *  Profile-page kiểu mới (vd huanyoutube) chạy ads dưới delegate page →
 *  ưu tiên delegate_page_id. Null nếu không resolve được. */
export async function fetchFbPageId(pageRef: string): Promise<string | null> {
  const items = await runFb(['page', pageRef, '--fields', 'id,delegate_page_id,name']);
  const rec = items[0];
  if (!rec) return null;
  const delegate = rec.delegate_page_id;
  if (typeof delegate === 'string' && delegate) return delegate;
  const id = rec.id;
  return typeof id === 'string' && id ? id : null;
}

/** Full image URL của 1 photo id (feed attachment chỉ ship id, không ship URL). */
export async function fetchFbPhotoUrl(photoId: string): Promise<string | null> {
  const items = await runFb(['photo', photoId, '--fields', 'id,image']);
  const image = items[0]?.image as Record<string, unknown> | undefined;
  const uri = image?.uri;
  return typeof uri === 'string' && uri ? uri : null;
}

// ─── Mapper: fb feed record → MappedNewsArticle ─────────────────────────
//
// Shape fb feed (v0.3.0) — typed chặt hơn Apify actor vì CLI cam kết format:
//   { id, url, author: {handle, name, url}, created_at, message: {text},
//     counts: {reactions, comments, shares}, attachments: [{kind, media:{kind,id}}] }

import type { MappedNewsArticle } from '@/lib/news/apify-mapper';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/** Photo id của attachment đầu tiên (nếu là ảnh) — caller resolve URL sau. */
export function firstPhotoAttachmentId(item: Record<string, unknown>): string | null {
  const attachments = item.attachments;
  if (!Array.isArray(attachments)) return null;
  for (const att of attachments) {
    const media = (att as Record<string, unknown>)?.media as
      | Record<string, unknown>
      | undefined;
    if (media?.kind === 'photo' && typeof media.id === 'string') return media.id;
  }
  return null;
}

/** Map 1 record `fb feed` → news_article row. Null nếu thiếu URL/text. */
export function mapFbFeedItem(
  item: Record<string, unknown>,
  avatarUrl: string | null
): MappedNewsArticle | null {
  const url = str(item.url);
  const message = item.message as Record<string, unknown> | undefined;
  const text = str(message?.text) ?? str(item.seo_title);
  if (!url || !text) return null;

  const author = (item.author ?? {}) as Record<string, unknown>;
  const authorHandle = str(author.handle) ?? str(author.id);
  const authorName = str(author.name) ?? authorHandle;

  const counts = (item.counts ?? {}) as Record<string, unknown>;

  const createdAt = str(item.created_at);
  let publishedAt: Date | null = null;
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) publishedAt = d;
  }

  return {
    source: authorHandle ? `facebook:${authorHandle}` : 'facebook:unknown',
    sourceType: 'facebook',
    title: truncate(text.replace(/\s+/g, ' ').trim(), 120),
    link: url,
    description: truncate(text, 500),
    coverImage: null, // resolve sau qua fetchFbPhotoUrl (best-effort)
    publishedAt,
    authorHandle,
    authorName,
    authorAvatar: avatarUrl,
    likesCount: int(counts.reactions),
    sharesCount: int(counts.shares),
    rawPayload: item,
  };
}
