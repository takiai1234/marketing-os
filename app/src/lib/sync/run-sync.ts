// Core sync pipeline: fetch posts + insights → UPSERT to DB.
// Called by /api/sync/fetch-now (manual button) and the cron schedulers.
// DOES NOT handle debounce — callers are responsible for that check.
//
// Dispatcher dispatches on `social_account.bundle_team_id`:
//   - Set     → Bundle-mediated channel (TikTok, IG, YT, ...) → runBundleSync
//   - NULL    → Native Facebook channel → existing fetch-from-Graph flow

import { db } from '@/lib/db';
import {
  fetchPagePosts,
  fetchPageInsights,
  fbThrottle,
} from '@/lib/fb/api-client';
import { runHealthRecomputeForAccount } from '@/lib/cron/job-health-recompute';
import { decryptToken } from '@/lib/fb/token-encryption';
import { parsePost } from '@/lib/fb/parse-post';
import { parseInsights } from '@/lib/fb/parse-insights';
import { TokenExpiredError } from '@/lib/fb/types';
import { markAccountTokenExpired } from '@/lib/fb/token-expired-handler';
import { logSync } from '@/lib/sync/log-sync';
import { callContext, type CallEntry } from '@/lib/sync/call-context';
import { upsertAccountMetricDaily } from '@/lib/cron/upsert-helpers';
import { vnDateKeyNow, getTodayUntilUtcSec } from '@/lib/fb/tz-dates';
import { syncLadipageForAccount } from '@/lib/ladipage/sync-account';
import { invalidateDashboard } from '@/lib/cache/dashboard-cache';
import { runBundleSync } from '@/lib/bundle/sync';
import type { SocialAccount } from '@/lib/db-types';

/** How far back to fetch posts (30 days) */
const SYNC_LOOKBACK_DAYS = 30;

/**
 * Run a full manual sync for one social_account.
 *
 * Dispatches to either the Bundle pipeline or the Facebook pipeline based on
 * whether the account is linked to a Bundle team. The two pipelines write to
 * the same metric tables (with raw_metrics JSONB on the Bundle side) so the
 * dashboard stays consistent.
 *
 * @returns number of records upserted (posts + account metrics)
 */
export async function runManualSync(accountId: string): Promise<number> {
  // Select includes bundle_* columns added in migration 021 so the dispatcher
  // can route without a second query.
  const accountResult = await db.query<SocialAccount>(
    `SELECT id, platform, external_id, name, persona_json,
            access_token_encrypted, connected_at, last_synced_at, status, owner_member_id,
            bundle_team_id, bundle_social_account_id, bundle_username, bundle_avatar_url
     FROM social_account WHERE id = $1 LIMIT 1`,
    [accountId]
  );
  const account = accountResult.rows[0];
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  if (account.bundle_team_id) {
    const result = await runBundleSync(accountId, account, { syncType: 'manual_refresh' });
    // Posts are imported asynchronously by the poller cron (see runBundleImportTrigger).
    // At manual-sync time we only count the account-level metric upsert.
    return result.accountMetricUpserted;
  }

  // Native FB path requires a stored token. Bundle path doesn't.
  if (!account.access_token_encrypted) {
    throw new Error(`Account ${accountId} has no encrypted token`);
  }

  const calls: CallEntry[] = [];
  return callContext.run(calls, () => runManualSyncFacebook(account, calls));
}

async function runManualSyncFacebook(account: SocialAccount, calls: CallEntry[]): Promise<number> {
  const accountId = account.id;
  const startedAt = new Date();
  // Caller (runManualSync) already verifies this — keep guard for TS narrowing.
  if (!account.access_token_encrypted) {
    throw new Error(`Account ${accountId} has no encrypted token`);
  }
  const encryptedToken = account.access_token_encrypted;

  let recordsUpserted = 0;

  try {
    // Decrypt token — never log the result
    const token = await decryptToken(encryptedToken);

    const sinceTs = Math.floor(
      (Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000
    );
    const insightsSinceTs = Math.floor(
      (Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000
    );
    // Mọi FB request đều set until = todayT08:00:00+0000 thay vì để FB default
    // about "now". Đảm bảo FB không cắt mất row insights cuối cùng nếu sync
    // chạy trước khi giờ hiện tại vượt qua mốc PT-midnight gần nhất.
    const untilTs = getTodayUntilUtcSec();

    // Cập nhật tên page từ FB (phòng khi page đã đổi tên)
    try {
      const meRes = await fetch(
        `https://graph.facebook.com/v25.0/me?fields=name&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      const meJson = await meRes.json() as { name?: string };
      if (meJson.name && meJson.name !== account.name) {
        await db.query(`UPDATE social_account SET name = $1 WHERE id = $2`, [meJson.name, accountId]);
        console.log(`[runManualSync] Đổi tên page: "${account.name}" → "${meJson.name}"`);
      }
    } catch {
      // Không block sync nếu lấy tên thất bại
    }

    // Sequential calls + random throttle — avoid concurrent FB calls from
    // the same token (rate-limit pressure) and avoid bot-like cadence.
    const rawPosts = await fetchPagePosts(
      token,
      account.external_id,
      sinceTs,
      untilTs
    );
    await fbThrottle();
    const rawInsights = await fetchPageInsights(
      token,
      account.external_id,
      insightsSinceTs,
      untilTs
    );

    // Page-level: parse + UPSERT account_metric_daily.
    // posts_count: KHÔNG ghi nữa — query đọc bằng COUNT từ social_post (xem
    // channel-detail.ts, dashboard-trend.ts). social_post được upsert bên dưới.
    const parsedDays = parseInsights(rawInsights);
    // "today" must be VN — after the 2026-05-23 timezone migration,
    // parseInsights returns VN calendar dates, so the fallback row check
    // below has to compare VN-to-VN.
    const today = vnDateKeyNow();

    // Always include today's row even if FB returned no insights for today
    // (cần track followers hôm nay khi FB delay 1-2 ngày).
    const dateKeys = new Set(parsedDays.map((d) => d.date.toISOString().slice(0, 10)));
    if (!dateKeys.has(today)) {
      // Carry-forward followers từ row gần nhất — tránh hiện 0 trên UI khi FB
      // chưa trả insights hôm nay (delay 1-2 ngày là bình thường). Đây là
      // INSERT path, không hit UPDATE clause của UPSERT, nên cần fallback ở app.
      const latestFollowersRes = await db.query<{ followers: number }>(
        `SELECT followers FROM account_metric_daily
         WHERE account_id = $1 AND followers > 0
         ORDER BY date DESC LIMIT 1`,
        [accountId]
      );
      const carriedFollowers = Number(latestFollowersRes.rows[0]?.followers ?? 0);

      parsedDays.push({
        date: new Date(`${today}T00:00:00.000Z`),
        followers: carriedFollowers,
        follower_growth: 0,
        total_reach: 0,
        total_reach_unique: 0,
        total_engagement: 0,
        total_actions: 0,
        page_views: 0,
        post_reactions_total: 0,
      });
    }

    const accountRows = parsedDays.map((day) => ({
      account_id: accountId,
      date: day.date,
      followers: day.followers,
      follower_growth: day.follower_growth,
      total_reach: day.total_reach,
      total_reach_unique: day.total_reach_unique,
      total_engagement: day.total_engagement,
      total_actions: day.total_actions,
      page_views: day.page_views,
      post_reactions_total: day.post_reactions_total,
    }));
    const accountMetricCount = await upsertAccountMetricDaily(accountRows);

    // Post-level: posts already include insights + comments + shares
    // from field expansion in fetchPagePosts (single API call for entire batch)
    const parsed = rawPosts.map((p) => parsePost(p));
    const postsCount = await upsertPosts(accountId, parsed);

    recordsUpserted = accountMetricCount + postsCount;

    // Recompute health score for this account (Job C, single-account variant)
    try {
      await runHealthRecomputeForAccount(accountId);
    } catch (e) {
      console.warn('[runManualSync] health recompute failed:', (e as Error).message);
    }

    // Update last_synced_at
    await db.query(`UPDATE social_account SET last_synced_at = NOW() WHERE id = $1`, [
      accountId,
    ]);

    // Ladipage piggyback — only for FB pages, since id_page maps to
    // social_account.external_id (a FB Page ID). Helper never throws — it
    // returns a status, so a Ladipage failure cannot fail the FB sync that
    // already succeeded above.
    if (account.platform === 'facebook') {
      const ladi = await syncLadipageForAccount(accountId, account.external_id);
      if (ladi.status === 'upserted') {
        recordsUpserted += 1;
        console.log(
          `[runManualSync] Ladipage OK account=${accountId} count=${ladi.count}`
        );
      } else if (ladi.status === 'no_data') {
        console.warn(
          `[runManualSync] Ladipage skip account=${accountId} (no data yet)`
        );
      } else {
        console.warn(
          `[runManualSync] Ladipage failed account=${accountId} reason=${ladi.reason}`
        );
      }
    }

    await logSync({
      syncType: 'manual_refresh',
      accountId,
      startedAt,
      status: 'success',
      recordsUpserted,
      details: calls,
    });

    // Manual sync writes to social_post + post_metric_daily + account_metric_daily
    // (and possibly landing_page_conversion via the Ladipage piggyback) — drop
    // the dashboard cache so the user sees fresh numbers immediately.
    invalidateDashboard();

    return recordsUpserted;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      await markAccountTokenExpired(accountId);
    }

    const errorMessage =
      err instanceof Error ? err.message : 'Unknown sync error';

    await logSync({
      syncType: 'manual_refresh',
      accountId,
      startedAt,
      status: 'failed',
      recordsUpserted: 0,
      errorMessage,
      details: calls,
    });

    throw err;
  }
}

/** UPSERT parsed posts + daily metrics in a single transaction. */
async function upsertPosts(
  accountId: string,
  posts: ReturnType<typeof parsePost>[]
): Promise<number> {
  if (posts.length === 0) return 0;

  const client = await db.connect();
  let count = 0;

  try {
    await client.query('BEGIN');

    for (const post of posts) {
      // UPSERT social_post
      const postResult = await client.query<{ id: string }>(
        `INSERT INTO social_post
           (account_id, external_id, content, media_url, post_type, published_at, permalink)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (account_id, external_id)
         DO UPDATE SET
           content     = EXCLUDED.content,
           media_url   = EXCLUDED.media_url,
           post_type   = EXCLUDED.post_type,
           published_at = EXCLUDED.published_at,
           permalink   = EXCLUDED.permalink
         RETURNING id`,
        [
          accountId,
          post.external_id,
          post.content,
          post.media_url,
          post.post_type,
          post.published_at,
          post.permalink,
        ]
      );

      const postId = postResult.rows[0]?.id;
      if (!postId) continue;

      // UPSERT post_metric_daily for today
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await client.query(
        `INSERT INTO post_metric_daily
           (post_id, date, reactions, comments, shares, reach, impressions, clicks, video_views)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (post_id, date)
         DO UPDATE SET
           reactions   = EXCLUDED.reactions,
           comments    = EXCLUDED.comments,
           shares      = EXCLUDED.shares,
           reach       = EXCLUDED.reach,
           impressions = EXCLUDED.impressions,
           clicks      = EXCLUDED.clicks,
           video_views = EXCLUDED.video_views,
           updated_at  = NOW()`,
        [
          postId,
          today,
          post.metrics.reactions,
          post.metrics.comments,
          post.metrics.shares,
          post.metrics.reach,
          post.metrics.impressions,
          post.metrics.clicks,
          post.metrics.video_views,
        ]
      );

      count++;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return count;
}
