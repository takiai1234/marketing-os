// Top "link / video / reel" posts ranked by CLICKS — proxy cho conversion
// vì chưa có per-post conversion attribution (xem discussion về "Đo chuyển
// đổi từng post" trong chat — user skip nên dùng clicks tạm).
//
// Filter logic:
//   - post_type IN ('link', 'video', 'reel') — 3 type có CTA/link nhất
//   - Window 7/14/30 ngày — prefetch cả 3 server-side, client toggle no API
//   - Sort by SUM(clicks) DESC trong window (lấy snapshot mới nhất per post
//     từ post_metric_daily, vì pm_daily lưu cumulative — không SUM nhiều
//     snapshot của 1 post)
//
// Click data nguồn: FB post_clicks metric (modern, fetch từ commit c705216).
// Posts cũ trước commit đó có clicks = 0 → bị filter (rank chỉ posts > 0).

import { db } from '@/lib/db';

const TOP_N = 10;
export const TOP_CONVERSION_PERIODS = [7, 14, 30] as const;
export type TopConversionPeriod = (typeof TOP_CONVERSION_PERIODS)[number];

export interface TopConversionPost {
  postId: string;
  externalId: string;
  content: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  postType: string;        // 'link' | 'video' | 'reel'
  publishedAt: string;
  accountId: string;
  accountName: string;
  platform: string;
  clicks: number;
  impressions: number;     // dùng tính CTR
  ctr: number | null;      // clicks/impressions, null nếu impressions=0
}

export interface LibraryTopConversion {
  byPeriod: Record<TopConversionPeriod, TopConversionPost[]>;
  /** Tổng posts (link/video/reel) có >0 clicks trong 30d. Hiển thị "10/N". */
  totalPostsWithClicks: number;
}

export async function fetchLibraryTopConversion(): Promise<LibraryTopConversion> {
  // 1 round-trip pivot theo period — same pattern với channels-top-reach.
  // Mỗi post chỉ tính SNAPSHOT MỚI NHẤT (DISTINCT ON post_id ORDER BY date
  // DESC) — không SUM cross-day vì pm_daily lưu cumulative-to-date (vd post
  // ngày 1 có 100 clicks, ngày 2 thành 150 clicks → SUM = 250 sai, max/latest
  // = 150 đúng).
  const res = await db.query<{
    period_days: string;
    post_id: string;
    external_id: string;
    content: string | null;
    media_url: string | null;
    permalink: string | null;
    post_type: string;
    published_at: Date;
    account_id: string;
    account_name: string;
    platform: string;
    clicks: string;
    impressions: string;
  }>(
    `
    WITH eligible_posts AS (
      SELECT sp.id, sp.external_id, sp.content, sp.media_url, sp.permalink,
             sp.post_type::TEXT AS post_type, sp.published_at,
             sa.id AS account_id, sa.name AS account_name, sa.platform::TEXT AS platform
        FROM social_post sp
        JOIN social_account sa ON sa.id = sp.account_id
       WHERE sp.post_type::TEXT IN ('link', 'video', 'reel')
         AND sa.status != 'disconnected'
         -- Published trong 30d (window rộng nhất, các period nhỏ hơn lọc lại bằng
         -- snapshot date của metric).
         AND sp.published_at >= CURRENT_DATE - INTERVAL '30 days'
    ),
    -- 1 snapshot mới nhất per post — pm_daily lưu cumulative nên dùng latest
    latest_metric AS (
      SELECT DISTINCT ON (pmd.post_id)
             pmd.post_id, pmd.date, pmd.clicks, pmd.impressions
        FROM post_metric_daily pmd
       WHERE pmd.date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY pmd.post_id, pmd.date DESC
    ),
    -- Cross join 3 window, attach metric, filter posts có clicks > 0
    by_window AS (
      SELECT ep.*, w.period_days,
             COALESCE(lm.clicks, 0)      AS clicks,
             COALESCE(lm.impressions, 0) AS impressions
        FROM eligible_posts ep
        CROSS JOIN (VALUES (7), (14), (30)) AS w(period_days)
        LEFT JOIN latest_metric lm ON lm.post_id = ep.id
       -- Posts published TRONG window (vd 7d window → chỉ posts trong 7 ngày qua)
       WHERE ep.published_at >= CURRENT_DATE - (w.period_days || ' days')::INTERVAL
    ),
    ranked AS (
      SELECT bw.*,
             ROW_NUMBER() OVER (
               PARTITION BY period_days
               ORDER BY clicks DESC, published_at DESC
             ) AS rn
        FROM by_window bw
       WHERE clicks > 0
    )
    SELECT period_days::TEXT, id AS post_id, external_id, content, media_url,
           permalink, post_type, published_at, account_id, account_name,
           platform, clicks::TEXT, impressions::TEXT
      FROM ranked
     WHERE rn <= $1
     ORDER BY period_days, rn
    `,
    [TOP_N]
  );

  const byPeriod: Record<TopConversionPeriod, TopConversionPost[]> = {
    7: [], 14: [], 30: [],
  };

  for (const row of res.rows) {
    const period = Number(row.period_days) as TopConversionPeriod;
    if (!TOP_CONVERSION_PERIODS.includes(period)) continue;

    const clicks = Number(row.clicks);
    const impressions = Number(row.impressions);

    byPeriod[period].push({
      postId: row.post_id,
      externalId: row.external_id,
      content: row.content,
      mediaUrl: row.media_url,
      permalink: row.permalink,
      postType: row.post_type,
      publishedAt: row.published_at.toISOString(),
      accountId: row.account_id,
      accountName: row.account_name,
      platform: row.platform,
      clicks,
      impressions,
      ctr: clicks > 0 && impressions > 0 ? clicks / impressions : null,
    });
  }

  // Count total posts (any platform, any window 30d) có clicks > 0
  const cntRes = await db.query<{ cnt: string }>(
    `
    SELECT COUNT(*)::TEXT AS cnt
      FROM social_post sp
      JOIN social_account sa ON sa.id = sp.account_id
      WHERE sp.post_type::TEXT IN ('link', 'video', 'reel')
        AND sa.status != 'disconnected'
        AND sp.published_at >= CURRENT_DATE - INTERVAL '30 days'
        AND EXISTS (
          SELECT 1 FROM post_metric_daily pmd
           WHERE pmd.post_id = sp.id AND pmd.clicks > 0
        )
    `
  );

  return {
    byPeriod,
    totalPostsWithClicks: Number(cntRes.rows[0]?.cnt ?? 0),
  };
}
