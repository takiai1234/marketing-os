// Platform registry — single source of truth for which social platforms we support
// and how they connect.
//
// - `flow='native_fb'`: handled by our own FB OAuth + manual token form (unchanged).
// - `flow='bundle'`: handled by Bundle.social OAuth (create team + redirect URL).
// - `importSupported=false`: Bundle can connect for publishing, but post-history-import
//   is NOT available (Twitter, Discord, Slack, GoogleBusiness as of 2026-05). UI must
//   disable connect for these because the daily import cron has nothing to fetch.

export type PlatformKey =
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'threads'
  | 'linkedin'
  | 'pinterest'
  | 'reddit'
  | 'mastodon'
  | 'bluesky'
  | 'twitter'
  | 'discord'
  | 'slack'
  | 'google_business';

export type BundlePlatformType =
  | 'FACEBOOK'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'INSTAGRAM'
  | 'THREADS'
  | 'LINKEDIN'
  | 'PINTEREST'
  | 'REDDIT'
  | 'MASTODON'
  | 'BLUESKY'
  | 'TWITTER'
  | 'DISCORD'
  | 'SLACK'
  | 'GOOGLE_BUSINESS';

export interface PlatformMeta {
  key: PlatformKey;
  bundleType: BundlePlatformType;
  label: string;
  brandColor: string;          // hex — used for tile background accent
  flow: 'native_fb' | 'bundle';
  importSupported: boolean;     // Bundle has post-history-import for this platform
  primaryMetricKey: 'reach' | 'impressions' | 'views' | 'followers';
  primaryMetricLabel: string;
  comingSoonReason?: string;    // shown in tooltip when disabled
}

export const PLATFORMS: PlatformMeta[] = [
  {
    key: 'facebook', bundleType: 'FACEBOOK', label: 'Facebook',
    brandColor: '#1877F2', flow: 'native_fb', importSupported: true,
    primaryMetricKey: 'reach', primaryMetricLabel: 'Reach',
  },
  {
    key: 'instagram', bundleType: 'INSTAGRAM', label: 'Instagram',
    brandColor: '#E4405F', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'reach', primaryMetricLabel: 'Reach',
  },
  {
    key: 'tiktok', bundleType: 'TIKTOK', label: 'TikTok',
    brandColor: '#000000', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'views', primaryMetricLabel: 'Views',
  },
  {
    key: 'youtube', bundleType: 'YOUTUBE', label: 'YouTube',
    brandColor: '#FF0000', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'views', primaryMetricLabel: 'Views',
  },
  {
    key: 'threads', bundleType: 'THREADS', label: 'Threads',
    brandColor: '#000000', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
  },
  {
    key: 'linkedin', bundleType: 'LINKEDIN', label: 'LinkedIn',
    brandColor: '#0A66C2', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
  },
  {
    key: 'pinterest', bundleType: 'PINTEREST', label: 'Pinterest',
    brandColor: '#BD081C', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
  },
  {
    key: 'reddit', bundleType: 'REDDIT', label: 'Reddit',
    brandColor: '#FF4500', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
  },
  {
    key: 'mastodon', bundleType: 'MASTODON', label: 'Mastodon',
    brandColor: '#6364FF', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Boosts',
  },
  {
    key: 'bluesky', bundleType: 'BLUESKY', label: 'Bluesky',
    brandColor: '#0085FF', flow: 'bundle', importSupported: true,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
  },
  // Disabled tier: Bundle supports publishing but NOT history import.
  {
    key: 'twitter', bundleType: 'TWITTER', label: 'Twitter (X)',
    brandColor: '#000000', flow: 'bundle', importSupported: false,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
    comingSoonReason: 'Bundle chưa hỗ trợ import lịch sử cho X. Chỉ publish được.',
  },
  {
    key: 'discord', bundleType: 'DISCORD', label: 'Discord',
    brandColor: '#5865F2', flow: 'bundle', importSupported: false,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
    comingSoonReason: 'Discord là messaging platform — không có feed history để import.',
  },
  {
    key: 'slack', bundleType: 'SLACK', label: 'Slack',
    brandColor: '#4A154B', flow: 'bundle', importSupported: false,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
    comingSoonReason: 'Slack là messaging platform — không có feed history để import.',
  },
  {
    key: 'google_business', bundleType: 'GOOGLE_BUSINESS', label: 'Google Business',
    brandColor: '#4285F4', flow: 'bundle', importSupported: false,
    primaryMetricKey: 'impressions', primaryMetricLabel: 'Impressions',
    comingSoonReason: 'Chỉ hỗ trợ Reviews API riêng — chưa wire vào UI.',
  },
];

const BY_KEY = new Map<PlatformKey, PlatformMeta>(
  PLATFORMS.map((p) => [p.key, p])
);

export function getPlatform(key: PlatformKey): PlatformMeta | undefined {
  return BY_KEY.get(key);
}

export function requirePlatform(key: PlatformKey): PlatformMeta {
  const p = BY_KEY.get(key);
  if (!p) throw new Error(`Unknown platform: ${key}`);
  return p;
}

export const BUNDLE_IMPORTABLE_KEYS: readonly PlatformKey[] = PLATFORMS
  .filter((p) => p.flow === 'bundle' && p.importSupported)
  .map((p) => p.key);
