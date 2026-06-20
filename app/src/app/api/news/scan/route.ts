// POST /api/news/scan — quét Facebook Ads Library theo link rồi lưu vào /news.
//
// Flow (đồng bộ, KHÔNG cần webhook):
//   1. Auth — chỉ user đăng nhập.
//   2. Validate body { url, limit? }: url phải là link facebook.com
//      (Ads Library hoặc page).
//   3. runActorSync(apify/facebook-ads-scraper) — đợi actor chạy xong.
//   4. Map item → MappedNewsArticle (source_type='facebook_ads').
//   5. Bulk upsert (dedupe theo link) → revalidate cache 'news'.
//   6. Trả về { fetched, mapped, inserted } để UI toast.
//
// Actor mặc định override được qua setting APIFY_FACEBOOK_ADS_ACTOR.
// Quét đồng bộ có thể mất vài phút (timeout 10' trong runActorSync) — UI
// hiển thị spinner trong lúc chờ.

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import {
  runActorSync,
  buildFacebookAdsInput,
  DEFAULT_FACEBOOK_ADS_ACTOR,
  ApifySyncError,
} from '@/lib/news/apify-sync';
import { mapApifyItem } from '@/lib/news/apify-mapper';
import { upsertApifyArticles } from '@/lib/news/news-db';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

export const runtime = 'nodejs';
// Quét actor có thể chạy lâu — nới maxDuration để không bị cắt giữa chừng.
export const maxDuration = 300;

/** Giới hạn số ad mỗi lần quét — chặn input vô lý + chi phí Apify. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

interface ScanBody {
  url?: unknown;
  limit?: unknown;
}

/** Chỉ chấp nhận URL facebook.com (Ads Library hoặc page). */
function validateFacebookUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  const ok =
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com');
  return ok ? parsed.toString() : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Parse + validate body ────────────────────────────────────────────
  let body: ScanBody;
  try {
    body = (await req.json()) as ScanBody;
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: 'Thiếu "url" để quét' }, { status: 400 });
  }
  const url = validateFacebookUrl(rawUrl);
  if (!url) {
    return NextResponse.json(
      { error: 'URL phải là link facebook.com (Ads Library hoặc page)' },
      { status: 400 }
    );
  }

  let limit = DEFAULT_LIMIT;
  if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
    limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)));
  }

  // ─── Pre-check token để báo lỗi rõ ràng (tránh chạy actor rồi mới fail) ──
  const token = await getSettingOrEnv('APIFY_API_TOKEN');
  if (!token) {
    return NextResponse.json(
      { error: 'APIFY_API_TOKEN chưa cấu hình. Vào /settings/integrations để thêm.' },
      { status: 400 }
    );
  }

  const actorId =
    (await getSettingOrEnv('APIFY_FACEBOOK_ADS_ACTOR')) ?? DEFAULT_FACEBOOK_ADS_ACTOR;

  // ─── Chạy actor + map + upsert ────────────────────────────────────────
  const logId = await startSyncLog('news_ingestion');
  try {
    const input = buildFacebookAdsInput([url], limit);
    const items = await runActorSync(actorId, input, token);

    const mapped = items
      .map((item) => mapApifyItem('facebook_ads', item))
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const inserted = await upsertApifyArticles(mapped);

    await finishSyncLog(logId, 'success', inserted);
    revalidateTag('news', 'max');

    return NextResponse.json({
      ok: true,
      url,
      fetched: items.length,
      mapped: mapped.length,
      inserted,
    });
  } catch (err) {
    const msg =
      err instanceof ApifySyncError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[POST /api/news/scan] url=${url}: ${msg}`);
    await finishSyncLog(logId, 'failed', 0, msg.slice(0, 1000));
    return NextResponse.json({ error: 'Quét thất bại', detail: msg }, { status: 500 });
  }
}
