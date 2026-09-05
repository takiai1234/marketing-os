// Job — news ingestion (Twitter qua Apify + Facebook qua fb-cli). Chạy mỗi 6h.
//
// Pull tweets từ list Twitter handles + posts từ list Facebook pages (admin
// config trong /settings/integrations) → upsert news_article.
//
// Flow:
//   1. Đọc 2 settings APIFY_TWITTER_HANDLES, APIFY_FACEBOOK_PAGES (csv string)
//   2. Twitter → Apify actor (cần APIFY_API_TOKEN)
//      Facebook → binary `fb` (tamnd/facebook-cli), KHÔNG cần token.
//      Optional: FB_SESSION_C_USER + FB_SESSION_XS (cookie) → full timeline;
//      không có thì mỗi page chỉ lấy được post mới nhất (tier 0).
//   3. Map items → news_article, upsert dedupe theo link
//   4. Log api_sync_log
//
// Errors per-source isolated — Twitter fail không kill FB và ngược lại.

import { getSettingOrEnv } from '@/lib/settings/api-keys';
import {
  runActorSync,
  buildTwitterInput,
  parseList,
  DEFAULT_TWITTER_ACTOR,
} from '@/lib/news/apify-sync';
import { mapApifyItem, type ApifySourceType, type MappedNewsArticle } from '@/lib/news/apify-mapper';
import {
  importFbSession,
  normalizePageRef,
  fetchFbPagePosts,
  fetchFbPageAvatar,
  fetchFbPhotoUrl,
  firstPhotoAttachmentId,
  mapFbFeedItem,
} from '@/lib/news/fb-cli';
import { upsertApifyArticles } from '@/lib/news/news-db';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

interface SourceResult {
  type: ApifySourceType;
  fetched: number;
  mapped: number;
  inserted: number;
  error?: string;
}

// Tier 1 (có cookie) page được cả timeline → lấy nhiều post hơn mỗi lần.
const FB_POSTS_PER_PAGE_TIER1 = 10;
const FB_POSTS_PER_PAGE_TIER0 = 3; // tier 0 thực tế chỉ ship 1 post — cap phòng hờ
// Mỗi run tối đa N lần gọi `fb photo` để lấy cover image (1 request/photo).
const FB_MAX_PHOTO_LOOKUPS = 20;

async function ingestTwitter(
  actorId: string,
  input: Record<string, unknown>
): Promise<SourceResult> {
  const type: ApifySourceType = 'twitter';
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

/** Facebook qua fb-cli — chạy tuần tự từng page (rate-friendly), lỗi 1 page
 *  không kill các page còn lại. */
async function ingestFacebookViaFbCli(pages: string[]): Promise<SourceResult> {
  const type: ApifySourceType = 'facebook';
  try {
    // Session (tier 1) — optional. Import idempotent trước khi đọc feed.
    const [cUser, xs] = await Promise.all([
      getSettingOrEnv('FB_SESSION_C_USER'),
      getSettingOrEnv('FB_SESSION_XS'),
    ]);
    let hasSession = false;
    if (cUser && xs) {
      try {
        await importFbSession(cUser, xs);
        hasSession = true;
      } catch (err) {
        console.warn(
          `[apify-news] fb auth import fail — tiếp tục tier 0: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    const perPage = hasSession ? FB_POSTS_PER_PAGE_TIER1 : FB_POSTS_PER_PAGE_TIER0;

    let fetched = 0;
    let photoLookups = 0;
    const mapped: MappedNewsArticle[] = [];
    const errors: string[] = [];

    for (const raw of pages) {
      const pageRef = normalizePageRef(raw);
      try {
        const posts = await fetchFbPagePosts(pageRef, perPage);
        fetched += posts.length;
        if (posts.length === 0) continue;

        // Avatar 1 lần/page — fail thì bỏ qua, không chặn posts.
        const avatar = await fetchFbPageAvatar(pageRef).catch(() => null);

        for (const post of posts) {
          const article = mapFbFeedItem(post, avatar);
          if (!article) continue;

          // Cover image: feed chỉ ship photo id → resolve URL, best-effort có cap.
          const photoId = firstPhotoAttachmentId(post);
          if (photoId && photoLookups < FB_MAX_PHOTO_LOOKUPS) {
            photoLookups++;
            article.coverImage = await fetchFbPhotoUrl(photoId).catch(() => null);
          }
          mapped.push(article);
        }
      } catch (err) {
        errors.push(`${pageRef}: ${err instanceof Error ? err.message : err}`);
      }
    }

    const inserted = mapped.length > 0 ? await upsertApifyArticles(mapped) : 0;

    // Chỉ coi là fail khi TẤT CẢ pages đều lỗi; lỗi lẻ tẻ chỉ ghi log.
    if (errors.length > 0) {
      console.warn(`[apify-news] fb-cli page errors (${errors.length}/${pages.length}): ${errors.join(' | ')}`);
    }
    return {
      type,
      fetched,
      mapped: mapped.length,
      inserted,
      error: errors.length === pages.length ? errors.join('; ').slice(0, 500) : undefined,
    };
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

  const [token, twitterRaw, facebookRaw, twitterActor] = await Promise.all([
    getSettingOrEnv('APIFY_API_TOKEN'),
    getSettingOrEnv('APIFY_TWITTER_HANDLES'),
    getSettingOrEnv('APIFY_FACEBOOK_PAGES'),
    getSettingOrEnv('APIFY_TWITTER_ACTOR'),
  ]);

  const twitterHandles = twitterRaw ? parseList(twitterRaw) : [];
  const facebookPages = facebookRaw ? parseList(facebookRaw) : [];

  const tasks: Array<Promise<SourceResult>> = [];

  // Twitter — vẫn qua Apify, cần token.
  if (twitterHandles.length > 0 && token) {
    const logId = await startSyncLog('news_ingestion');
    const actor = twitterActor || DEFAULT_TWITTER_ACTOR;
    const input = buildTwitterInput(twitterHandles);
    tasks.push(
      ingestTwitter(actor, input).then(async (r) => {
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
  } else if (twitterHandles.length > 0) {
    console.log('[apify-news] APIFY_API_TOKEN chưa set — skip Twitter (Facebook vẫn chạy qua fb-cli)');
  } else {
    console.log('[apify-news] APIFY_TWITTER_HANDLES empty — skip Twitter');
  }

  // Facebook — qua fb-cli, KHÔNG cần Apify token.
  if (facebookPages.length > 0) {
    const logId = await startSyncLog('news_ingestion');
    tasks.push(
      ingestFacebookViaFbCli(facebookPages).then(async (r) => {
        if (r.error) {
          await finishSyncLog(logId, 'failed', 0, r.error.slice(0, 500));
        } else {
          await finishSyncLog(
            logId,
            'success',
            r.inserted,
            `facebook(fb-cli) pages=${facebookPages.length} fetched=${r.fetched} mapped=${r.mapped} inserted=${r.inserted}`
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
