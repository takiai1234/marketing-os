// Map Bundle's platform-agnostic analytics shape onto our FB-shaped metric
// columns + a JSONB blob for whatever Bundle returns that doesn't fit a typed
// column.
//
// Strategy: pick the closest typed column per metric (TikTok/YouTube `views`
// → video_views; impressionsUnique → reach), and dump the entire analytics
// object into raw_metrics so we never silently lose data. Future schema
// changes (e.g. adding a `saves` column) can backfill from JSONB.

import type {
  AccountAggregate,
  ImportedPost,
  ImportedPostAnalytics,
} from './import-runner';
import type { PostTypeT } from '@/lib/db-types';

export interface MappedPostMetric {
  reactions: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  clicks: number;
  video_views: number;
  raw_metrics: Record<string, unknown>;
}

export interface MappedAccountMetric {
  followers: number;
  follower_growth: number;
  total_reach: number;
  total_reach_unique: number;
  total_engagement: number;
  total_actions: number;
  page_views: number;
  post_reactions_total: number;
  raw_metrics: Record<string, unknown>;
}

/**
 * Pull the freshest analytics record (post may carry multiple if Bundle
 * tracks history) and project it onto our metric columns. Bundle currently
 * stores one row per post, but the array shape future-proofs us.
 */
export function mapPostAnalytics(post: ImportedPost): MappedPostMetric {
  // Latest snapshot — Bundle stores 1 record per post today, but sort desc
  // in case that ever changes.
  const sorted = [...post.analytics].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  const a: ImportedPostAnalytics | undefined = sorted[0];

  if (!a) {
    return {
      reactions: 0, comments: 0, shares: 0,
      reach: 0, impressions: 0, clicks: 0, video_views: 0,
      raw_metrics: {},
    };
  }

  // `reach` is used as the denominator of the GENERATED engagement_rate
  // column ((reactions + comments + shares) / reach). FB returns
  // impressionsUnique > 0, but YouTube Shorts often have
  // impressionsUnique = 0 while impressions/views are non-zero. Fall back
  // so ER computes a meaningful number instead of always 0.
  const reach =
    (a.impressionsUnique && a.impressionsUnique > 0 ? a.impressionsUnique : 0)
    || (a.impressions && a.impressions > 0 ? a.impressions : 0)
    || (a.views && a.views > 0 ? a.views : 0)
    || 0;

  return {
    // TikTok / YouTube use `likes`; FB-shaped column we have is `reactions`.
    reactions: a.likes ?? 0,
    comments: a.comments ?? 0,
    shares: a.shares ?? 0,
    reach,
    impressions: a.impressions ?? 0,
    // No 1:1 column for Bundle's "saves" or "dislikes" — they live in raw_metrics.
    clicks: 0,
    // `views` is TikTok/YouTube playback count; map to video_views for
    // dashboard reuse. For text-only posts this stays 0 from Bundle.
    video_views: a.views ?? 0,
    raw_metrics: { ...a } as unknown as Record<string, unknown>,
  };
}

export function mapAccountAggregate(
  agg: AccountAggregate,
  platform: string
): MappedAccountMetric {
  // TikTok's account-level aggregate returns impressions/views = 0 (Bundle
  // doesn't expose them at account scope — only per-post). The only
  // reach-shaped field with a real value is `likes`, so we use it as the
  // reach proxy for the channel card. Other platforms (FB/IG/YT) keep the
  // impressions→views fallback so YouTube Shorts (impressions = 0, views > 0)
  // still produce a sensible number.
  const total_reach =
    platform === 'tiktok'
      ? (agg.likes ?? 0)
      : (agg.impressions || agg.views || 0);

  return {
    followers: agg.followers ?? 0,
    // follower_growth requires diffing yesterday — leave 0 for Bundle path
    // unless we wire a separate "diff vs last day" step. Acceptable since
    // it's just for the dashboard sparkline (growth %s).
    follower_growth: 0,
    total_reach,
    total_reach_unique: agg.impressionsUnique ?? 0,
    total_engagement: (agg.likes ?? 0) + (agg.comments ?? 0),
    total_actions: 0,
    page_views: agg.views ?? 0,
    post_reactions_total: agg.likes ?? 0,
    raw_metrics: { ...agg } as unknown as Record<string, unknown>,
  };
}

/**
 * Map Bundle's `type` field to our PostTypeT enum.
 * Bundle uses: POST | VIDEO | REEL | STORY | TWEET (rough — varies by platform).
 * Our enum: photo, video, reel, status, link, album, sticker, share.
 */
export function mapBundlePostType(bundleType: string): PostTypeT {
  const t = bundleType.toUpperCase();
  if (t === 'VIDEO') return 'video';
  if (t === 'REEL') return 'reel';
  if (t === 'STORY') return 'status';
  if (t === 'TWEET' || t === 'POST') return 'status';
  return 'photo'; // safe default for image-led platforms (IG, Pinterest)
}
