// POST /api/news/ingest-web — "Clip" bất kỳ trang web nào vào /news.
//
// Extension trích từ trang đang mở: { url, title, image, text } rồi POST về đây.
// Khác /ingest-ads: dữ liệu đã chuẩn hoá (không phải ad node thô) → map thẳng
// sang news_article với source_type='web', source='web:<domain>'.
//
// Xác thực: dùng chung Bearer ADS_INGEST_TOKEN với extension (1 token cho cả
// quét ad lẫn clip web). Route đã loại khỏi proxy auth (xem src/proxy.ts).

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { upsertApifyArticles } from '@/lib/news/news-db';
import type { MappedNewsArticle } from '@/lib/news/apify-mapper';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

export const runtime = 'nodejs';

const MAX_ITEMS = 200;
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

/** Validate + chuẩn hoá 1 item clip → MappedNewsArticle. null nếu thiếu URL hợp lệ. */
function mapWebClip(raw: unknown): MappedNewsArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Record<string, unknown>;

  const rawUrl = typeof it.url === 'string' ? it.url.trim() : '';
  if (!rawUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const domain = parsed.hostname.replace(/^www\./, '');
  const title = typeof it.title === 'string' && it.title.trim() ? truncate(it.title, 200) : domain;
  const text = typeof it.text === 'string' && it.text.trim() ? truncate(it.text, 500) : null;
  const image = typeof it.image === 'string' && it.image.trim() ? it.image.trim() : null;

  return {
    source: `web:${domain}`,
    sourceType: 'web',
    title,
    link: parsed.toString(), // dedupe key
    description: text,
    coverImage: image,
    // Thời điểm clip = now → hiện ở đầu feed (feed sắp theo published_at).
    publishedAt: new Date(),
    authorHandle: domain,
    authorName: domain,
    authorAvatar: null,
    rawPayload: it,
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface IngestWebBody {
  items?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = await getSettingOrEnv('ADS_INGEST_TOKEN');
  if (!expected) {
    return json(
      { error: 'ADS_INGEST_TOKEN chưa cấu hình (Settings → Tích hợp API hoặc .env).' },
      503
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!provided || !tokenEquals(provided, expected)) {
    return json({ error: 'Unauthorized — token sai hoặc thiếu.' }, 401);
  }

  let body: IngestWebBody;
  try {
    body = (await req.json()) as IngestWebBody;
  } catch {
    return json({ error: 'Body không phải JSON hợp lệ.' }, 400);
  }
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    return json({ error: 'Thiếu "items" (mảng trang web).' }, 400);
  }
  if (rawItems.length === 0) return json({ ok: true, received: 0, mapped: 0, inserted: 0 });
  if (rawItems.length > MAX_ITEMS) {
    return json({ error: `Quá nhiều item (tối đa ${MAX_ITEMS}).` }, 413);
  }

  const logId = await startSyncLog('news_ingestion');
  try {
    const mapped = rawItems
      .map(mapWebClip)
      .filter((x): x is MappedNewsArticle => x !== null);

    const inserted = await upsertApifyArticles(mapped);

    await finishSyncLog(logId, 'success', inserted);
    revalidateTag('news', 'max');

    return json({ ok: true, received: rawItems.length, mapped: mapped.length, inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/news/ingest-web]: ${msg}`);
    await finishSyncLog(logId, 'failed', 0, msg.slice(0, 1000));
    return json({ error: 'Clip thất bại', detail: msg }, 500);
  }
}
