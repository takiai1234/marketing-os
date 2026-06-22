// Bundle-specific UPSERT helpers.
//
// Why separate from `cron/upsert-helpers.ts`?
//   - Need to write the new `raw_metrics` JSONB column + `bundle_imported_post_id`
//   - Want to preserve existing FB code path unchanged (zero blast radius)
//
// Each function is idempotent — safe to re-run nightly with the same payload.

import { db } from '@/lib/db';
import type {
  MappedAccountMetric,
  MappedPostMetric,
} from './metric-mapper';
import type { PostTypeT } from '@/lib/db-types';

export interface BundleSocialPostRow {
  account_id: string;
  external_id: string;                  // platform-native id (FB id / IG id / TikTok id ...)
  bundle_imported_post_id: string;      // Bundle's UUID for the imported post
  content: string | null;
  media_url: string | null;
  post_type: PostTypeT;
  published_at: Date;
  permalink: string | null;
}

/**
 * UPSERT social_post — keyed on (account_id, external_id).
 * Also writes `bundle_imported_post_id` so the next sync can update analytics
 * even if Bundle's UUID changes (it shouldn't, but is cheap to track).
 */
export async function upsertBundleSocialPost(
  row: BundleSocialPostRow
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO social_post
       (account_id, external_id, bundle_imported_post_id,
        content, media_url, post_type, published_at, permalink)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (account_id, external_id) DO UPDATE SET
       bundle_imported_post_id = EXCLUDED.bundle_imported_post_id,
       content                 = EXCLUDED.content,
       media_url               = EXCLUDED.media_url,
       permalink               = EXCLUDED.permalink
     RETURNING id`,
    [
      row.account_id,
      row.external_id,
      row.bundle_imported_post_id,
      row.content,
      row.media_url,
      row.post_type,
      row.published_at,
      row.permalink,
    ]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('upsertBundleSocialPost returned no id');
  return id;
}

/**
 * UPSERT post_metric_daily for today — keyed on (post_id, date).
 * Writes BOTH typed columns AND `raw_metrics` JSONB.
 */
export async function upsertBundlePostMetric(input: {
  postId: string;
  date: Date;
  metric: MappedPostMetric;
}): Promise<void> {
  const { postId, date, metric } = input;
  await db.query(
    `INSERT INTO post_metric_daily
       (post_id, date, reactions, comments, shares,
        reach, impressions, clicks, video_views, raw_metrics)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (post_id, date) DO UPDATE SET
       reactions   = EXCLUDED.reactions,
       comments    = EXCLUDED.comments,
       shares      = EXCLUDED.shares,
       reach       = EXCLUDED.reach,
       impressions = EXCLUDED.impressions,
       clicks      = EXCLUDED.clicks,
       video_views = EXCLUDED.video_views,
       raw_metrics = EXCLUDED.raw_metrics,
       updated_at  = NOW()`,
    [
      postId,
      date,
      metric.reactions,
      metric.comments,
      metric.shares,
      metric.reach,
      metric.impressions,
      metric.clicks,
      metric.video_views,
      JSON.stringify(metric.raw_metrics),
    ]
  );
}

/**
 * UPSERT account_metric_daily for today's date.
 * Mirrors the existing helper's conflict semantics for typed columns
 * (`COALESCE(NULLIF(EXCLUDED.x, 0), old.x)` to avoid clobbering with zero)
 * and ADDS raw_metrics overwrite — JSONB is always the freshest snapshot.
 */
export async function upsertBundleAccountMetric(input: {
  accountId: string;
  date: Date;
  metric: MappedAccountMetric;
}): Promise<void> {
  const { accountId, date, metric } = input;
  // follower_growth: Bundle KHÔNG trả growth (mapper để 0). Ta tự tính =
  // followers hôm nay − followers ngày gần nhất trước đó (followers > 0).
  // Lần đầu (chưa có ngày trước) hoặc followers=0 (Bundle lỗi tạm) → 0,
  // tránh ra số âm khổng lồ. Tính trong SQL để truy được ngày trước.
  await db.query(
    `INSERT INTO account_metric_daily
       (account_id, date, followers, follower_growth,
        total_reach, total_reach_unique, total_engagement,
        total_actions, page_views, post_reactions_total,
        raw_metrics, updated_at)
     VALUES (
       $1, $2, $3,
       CASE WHEN $3 > 0 THEN $3 - COALESCE(
         (SELECT p.followers FROM account_metric_daily p
            WHERE p.account_id = $1 AND p.date < $2 AND p.followers > 0
            ORDER BY p.date DESC LIMIT 1),
         $3
       ) ELSE 0 END,
       $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
     ON CONFLICT (account_id, date) DO UPDATE SET
       followers            = COALESCE(NULLIF(EXCLUDED.followers, 0), account_metric_daily.followers),
       follower_growth      = CASE WHEN EXCLUDED.followers > 0
                                   THEN EXCLUDED.follower_growth
                                   ELSE account_metric_daily.follower_growth END,
       total_reach          = COALESCE(NULLIF(EXCLUDED.total_reach, 0), account_metric_daily.total_reach),
       total_reach_unique   = COALESCE(NULLIF(EXCLUDED.total_reach_unique, 0), account_metric_daily.total_reach_unique),
       total_engagement     = COALESCE(NULLIF(EXCLUDED.total_engagement, 0), account_metric_daily.total_engagement),
       total_actions        = COALESCE(NULLIF(EXCLUDED.total_actions, 0), account_metric_daily.total_actions),
       page_views           = COALESCE(NULLIF(EXCLUDED.page_views, 0), account_metric_daily.page_views),
       post_reactions_total = COALESCE(NULLIF(EXCLUDED.post_reactions_total, 0), account_metric_daily.post_reactions_total),
       raw_metrics          = EXCLUDED.raw_metrics,
       updated_at           = NOW()`,
    [
      accountId,
      date,
      metric.followers,
      metric.total_reach,
      metric.total_reach_unique,
      metric.total_engagement,
      metric.total_actions,
      metric.page_views,
      metric.post_reactions_total,
      JSON.stringify(metric.raw_metrics),
    ]
  );
}
