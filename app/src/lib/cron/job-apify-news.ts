// Job — Apify news ingestion. Chạy mỗi 6h.
//
// Pull tweets từ list Twitter handles + posts từ list Facebook pages (admin
// config trong /settings/integrations) → upsert news_article.
//
// Flow:
//   1. Đọc 2 settings APIFY_TWITTER_HANDLES, APIFY_FACEBOOK_PAGES (csv string)
//   2. Đọc actor IDs (default hoặc admin override)
//   3. Run 2 actor song song (Twitter + FB) qua sync API
//   4. Map items → news_article, upsert dedupe theo link
//   5. Log api_sync_log
//
// Errors per-source isolated — Twitter fail không kill FB và ngược lại.

import { getSettingOrEnv } from '@/lib/settings/api-keys';
import {
  runActorSync,
  buildTwitterInput,
  buildFacebookInput,
  parseList,
  DEFAULT_TWITTER_ACTOR,
  DEFAULT_FACEBOOK_ACTOR,
} from '@/lib/news/apify-sync';
import { mapApifyItem, type ApifySourceType } from '@/lib/news/apify-mapper';
import { upsertApifyArticles } from '@/lib/news/news-db';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

interface SourceResult {
  type: ApifySourceType;
  fetched: number;
  mapped: number;
  inserted: number;
  error?: string;
}

async function ingestOne(
  type: ApifySourceType,
  actorId: string,
  input: Record<string, unknown>
): Promise<SourceResult> {
  try {
    const items = await runActorSync(actorId, input);
    if (items.length === 0) {
      return { type, fetched: 0, mapped: 0, inserted: 0 };
    }
    const mapped = items
      .map((it) => mapApifyItem(type, it))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const inserted = mapped.length > 0 ? await upsertApifyArticles(mapped) : 0;
    return { type, fetched: items.length, mapped: mapped.length, inserted };
  } catch (err) {
    return {
      type,
      fetched: 0,
      mapped: 0,
      inserted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Run job — public để cron init + manual trigger gọi được. */
export async function runApifyNewsJob(): Promise<{
  twitter: SourceResult | null;
  facebook: SourceResult | null;
}> {
  const startedAt = Date.now();
  console.log(`[apify-news] Starting at ${new Date(startedAt).toISOString()}`);

  // Skip cleanly nếu token chưa set — không phải lỗi, admin chưa config.
  const token = await getSettingOrEnv('APIFY_API_TOKEN');
  if (!token) {
    console.log('[apify-news] APIFY_API_TOKEN chưa set — skip job');
    return { twitter: null, facebook: null };
  }

  const [twitterRaw, facebookRaw, twitterActor, facebookActor] = await Promise.all([
    getSettingOrEnv('APIFY_TWITTER_HANDLES'),
    getSettingOrEnv('APIFY_FACEBOOK_PAGES'),
    getSettingOrEnv('APIFY_TWITTER_ACTOR'),
    getSettingOrEnv('APIFY_FACEBOOK_ACTOR'),
  ]);

  const twitterHandles = twitterRaw ? parseList(twitterRaw) : [];
  const facebookPages = facebookRaw ? parseList(facebookRaw) : [];

  const tasks: Array<Promise<SourceResult>> = [];

  if (twitterHandles.length > 0) {
    const logId = await startSyncLog('news_ingestion');
    const actor = twitterActor || DEFAULT_TWITTER_ACTOR;
    const input = buildTwitterInput(twitterHandles);
    tasks.push(
      ingestOne('twitter', actor, input).then(async (r) => {
        if (r.error) {
          await finishSyncLog(logId, 'failed', 0, r.error.slice(0, 500));
        } else {
          await finishSyncLog(
            logId,
            'success',
            r.inserted,
            `twitter handles=${twitterHandles.length} fetched=${r.fetched} mapped=${r.mapped} inserted=${r.inserted}`
          );
        }
        return r;
      })
    );
  } else {
    console.log('[apify-news] APIFY_TWITTER_HANDLES empty — skip Twitter');
  }

  if (facebookPages.length > 0) {
    const logId = await startSyncLog('news_ingestion');
    const actor = facebookActor || DEFAULT_FACEBOOK_ACTOR;
    const input = buildFacebookInput(facebookPages);
    tasks.push(
      ingestOne('facebook', actor, input).then(async (r) => {
        if (r.error) {
          await finishSyncLog(logId, 'failed', 0, r.error.slice(0, 500));
        } else {
          await finishSyncLog(
            logId,
            'success',
            r.inserted,
            `facebook pages=${facebookPages.length} fetched=${r.fetched} mapped=${r.mapped} inserted=${r.inserted}`
          );
        }
        return r;
      })
    );
  } else {
    console.log('[apify-news] APIFY_FACEBOOK_PAGES empty — skip Facebook');
  }

  if (tasks.length === 0) {
    console.log('[apify-news] No active source — skip');
    return { twitter: null, facebook: null };
  }

  const results = await Promise.allSettled(tasks);
  const twitter =
    results.find(
      (r): r is PromiseFulfilledResult<SourceResult> =>
        r.status === 'fulfilled' && r.value.type === 'twitter'
    )?.value ?? null;
  const facebook =
    results.find(
      (r): r is PromiseFulfilledResult<SourceResult> =>
        r.status === 'fulfilled' && r.value.type === 'facebook'
    )?.value ?? null;

  const ms = Date.now() - startedAt;
  console.log(
    `[apify-news] Done in ${ms}ms — twitter:${twitter ? JSON.stringify(twitter) : 'skip'} ` +
      `facebook:${facebook ? JSON.stringify(facebook) : 'skip'}`
  );

  return { twitter, facebook };
}
