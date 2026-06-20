// POST /api/news/ingest-ads — nhận ad Facebook Ads Library đẩy từ ngoài vào
// (Chrome extension, n8n, script…) rồi lưu vào /news. KHÔNG cần Apify.
//
// Xác thực: Bearer token (ADS_INGEST_TOKEN) thay vì session cookie — vì caller
// là extension chạy trên trình duyệt, không có cookie đăng nhập. Route này đã
// được loại trừ khỏi proxy auth (xem src/proxy.ts).
//
// Body: { items: unknown[] }  — mỗi item là 1 ad node "thô" từ GraphQL của FB
// Ads Library (hoặc shape tương đương). Server tự map qua mapFacebookAdItem
// (defensive, thử nhiều tên field) → một nguồn sự thật cho mapping, extension
// không cần cập nhật khi FB đổi field.
//
// Trả về { received, mapped, inserted }. CORS mở để caller ngoài gọi được.

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { mapApifyItem } from '@/lib/news/apify-mapper';
import { upsertApifyArticles } from '@/lib/news/news-db';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

export const runtime = 'nodejs';

/** Giới hạn số item/lần đẩy — chặn payload vô lý. */
const MAX_ITEMS = 1000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** So sánh token hằng-thời-gian đơn giản (tránh timing leak cơ bản). */
function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Preflight CORS. */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface IngestBody {
  items?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ─── Auth: Bearer ADS_INGEST_TOKEN ────────────────────────────────────
  const expected = await getSettingOrEnv('ADS_INGEST_TOKEN');
  if (!expected) {
    return json(
      { error: 'ADS_INGEST_TOKEN chưa cấu hình trên server (.env hoặc app_setting).' },
      503
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  if (!provided || !tokenEquals(provided, expected)) {
    return json({ error: 'Unauthorized — token sai hoặc thiếu.' }, 401);
  }

  // ─── Parse body ───────────────────────────────────────────────────────
  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return json({ error: 'Body không phải JSON hợp lệ.' }, 400);
  }
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    return json({ error: 'Thiếu "items" (mảng ad).' }, 400);
  }
  if (rawItems.length === 0) {
    return json({ ok: true, received: 0, mapped: 0, inserted: 0 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return json({ error: `Quá nhiều item (tối đa ${MAX_ITEMS}).` }, 413);
  }

  // ─── Map + upsert ─────────────────────────────────────────────────────
  const logId = await startSyncLog('news_ingestion');
  try {
    const mapped = rawItems
      .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
      .map((it) => mapApifyItem('facebook_ads', it))
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const inserted = await upsertApifyArticles(mapped);

    await finishSyncLog(logId, 'success', inserted);
    revalidateTag('news', 'max');

    return json({
      ok: true,
      received: rawItems.length,
      mapped: mapped.length,
      inserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/news/ingest-ads]: ${msg}`);
    await finishSyncLog(logId, 'failed', 0, msg.slice(0, 1000));
    return json({ error: 'Ingest thất bại', detail: msg }, 500);
  }
}
