// POST /api/news/apify-webhook?type=twitter|facebook&secret=XXX
//
// Apify sẽ gọi endpoint này sau khi actor run xong (event ACTOR.RUN.SUCCEEDED).
// User config webhook trên Apify Schedule với URL kèm `?type=` xác định mapper
// (Twitter hay Facebook) và `?secret=` để verify request thực sự từ Apify
// (không phải tùy ai cũng push được).
//
// Default Apify webhook payload (xem https://docs.apify.com/platform/integrations/webhooks):
//   {
//     "userId": "...",
//     "createdAt": "...",
//     "eventType": "ACTOR.RUN.SUCCEEDED",
//     "eventData": { "actorId": "...", "actorRunId": "..." },
//     "resource": {
//       "id": "<run id>",
//       "actId": "...",
//       "defaultDatasetId": "<DATASET ID — đây là cái app cần để fetch items>",
//       "status": "SUCCEEDED",
//       ...
//     }
//   }
//
// Flow:
//   1. Verify secret query param khớp APIFY_WEBHOOK_SECRET trong DB
//   2. Verify type param hợp lệ (twitter | facebook)
//   3. Parse payload → lấy resource.defaultDatasetId
//   4. Fetch dataset items từ Apify API
//   5. Map items qua adapter tương ứng → MappedNewsArticle[]
//   6. Bulk upsert vào news_article (dedupe theo link)
//   7. Log api_sync_log để admin debug
//   8. Trả 200 luôn (Apify retry nếu non-2xx — không muốn retry loop khi config lỗi)

import { NextRequest, NextResponse } from 'next/server';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { fetchDatasetItems, ApifyError } from '@/lib/news/apify-client';
import { mapApifyItem, type ApifySourceType } from '@/lib/news/apify-mapper';
import { upsertApifyArticles } from '@/lib/news/news-db';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

export const runtime = 'nodejs';

interface ApifyWebhookPayload {
  eventType?: string;
  resource?: {
    id?: string;
    defaultDatasetId?: string;
    status?: string;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') as ApifySourceType | null;
  const secret = url.searchParams.get('secret');

  // ─── Verify secret ─────────────────────────────────────────────────────
  const expectedSecret = await getSettingOrEnv('APIFY_WEBHOOK_SECRET');
  if (!expectedSecret) {
    console.error('[apify-webhook] APIFY_WEBHOOK_SECRET chưa set');
    // 200 để Apify không retry vô tận — admin fix config rồi resync sau
    return NextResponse.json(
      { ok: false, error: 'Webhook secret chưa được config trên server' },
      { status: 200 }
    );
  }
  if (!secret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // ─── Validate type ────────────────────────────────────────────────────
  if (type !== 'twitter' && type !== 'facebook') {
    return NextResponse.json(
      { error: 'Missing or invalid ?type= (twitter|facebook)' },
      { status: 400 }
    );
  }

  // ─── Parse payload ────────────────────────────────────────────────────
  let payload: ApifyWebhookPayload;
  try {
    payload = (await req.json()) as ApifyWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = payload.eventType ?? '';
  const datasetId = payload.resource?.defaultDatasetId;
  const runId = payload.resource?.id ?? '(unknown)';

  // Chỉ xử lý ACTOR.RUN.SUCCEEDED. Event khác (FAILED/ABORTED/TIMED_OUT) → log + 200.
  if (eventType !== 'ACTOR.RUN.SUCCEEDED') {
    console.log(
      `[apify-webhook] Skip event ${eventType} (run ${runId}, type ${type})`
    );
    return NextResponse.json({ ok: true, skipped: true, eventType });
  }

  if (!datasetId) {
    return NextResponse.json(
      { error: 'Payload thiếu resource.defaultDatasetId' },
      { status: 400 }
    );
  }

  // ─── Log started ──────────────────────────────────────────────────────
  const logId = await startSyncLog('news_ingestion');

  // ─── Fetch + map + upsert ─────────────────────────────────────────────
  try {
    const items = await fetchDatasetItems(datasetId);
    console.log(
      `[apify-webhook] type=${type} run=${runId} dataset=${datasetId} fetched=${items.length}`
    );

    if (items.length === 0) {
      await finishSyncLog(logId, 'success', 0);
      return NextResponse.json({ ok: true, fetched: 0, inserted: 0 });
    }

    // Map qua adapter. Item nào mapper trả null (thiếu URL/content) → skip.
    const mapped = items
      .map((item) => mapApifyItem(type, item))
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (mapped.length === 0) {
      console.warn(
        `[apify-webhook] 0/${items.length} item mappable cho type=${type}. Check actor output shape.`
      );
      await finishSyncLog(
        logId,
        'success',
        0,
        `0/${items.length} items mappable — actor output shape khác mong đợi`
      );
      return NextResponse.json({
        ok: true,
        fetched: items.length,
        mapped: 0,
        inserted: 0,
      });
    }

    const inserted = await upsertApifyArticles(mapped);

    console.log(
      `[apify-webhook] type=${type} fetched=${items.length} mapped=${mapped.length} inserted=${inserted}`
    );

    await finishSyncLog(logId, 'success', inserted);

    return NextResponse.json({
      ok: true,
      type,
      fetched: items.length,
      mapped: mapped.length,
      inserted,
    });
  } catch (err) {
    const msg =
      err instanceof ApifyError
        ? `Apify API: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[apify-webhook] FAIL ${type} dataset=${datasetId}: ${msg}`);
    await finishSyncLog(logId, 'failed', 0, msg.slice(0, 1000));
    // 200 để Apify không retry — admin fix rồi trigger lại
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}

// Cho phép admin test webhook qua browser (GET → trả status info)
export async function GET(): Promise<NextResponse> {
  const secretSet = Boolean(await getSettingOrEnv('APIFY_WEBHOOK_SECRET'));
  const tokenSet = Boolean(await getSettingOrEnv('APIFY_API_TOKEN'));
  return NextResponse.json({
    endpoint: '/api/news/apify-webhook',
    method: 'POST',
    queryParams: 'type=twitter|facebook&secret=<APIFY_WEBHOOK_SECRET>',
    config: {
      APIFY_WEBHOOK_SECRET: secretSet ? 'set' : 'MISSING — vào /settings/integrations',
      APIFY_API_TOKEN: tokenSet ? 'set' : 'MISSING — vào /settings/integrations',
    },
  });
}
