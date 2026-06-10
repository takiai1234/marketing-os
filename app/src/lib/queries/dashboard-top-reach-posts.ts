// Dashboard widget: Top N bài viết theo reach trong N ngày qua.
// Hiển thị thay thế card "Active Campaigns" (mock data) — content thực tế
// + nút "Viết lại" để workflow nhanh: thấy bài viral → click rewrite.
//
// SUM reach 7 ngày qua per post (post_metric_daily là daily delta cho FB
// nên SUM hợp lệ). Exclude today vì cron sync chưa hoàn tất.
// Loại post của kênh disconnected — tương tự dashboard-kpi.ts.

import { db } from '@/lib/db';

export interface TopReachPost {
  postId: string;
  /** Nội dung post (raw). Truncate ở UI layer. */
  content: string | null;
  permalink: string | null;
  postType: string;
  publishedAt: Date;
  totalReach: number;
  /** Channel info để hiển thị + truyền vào rewrite context. */
  accountId: string;
  accountName: string;
  platform: string;
}

interface DbRow {
  post_id: string;
  content: string | null;
  permalink: string | null;
  post_type: string;
  published_at: Date;
  total_reach: string;
  account_id: string;
  account_name: string;
  platform: string;
}

/**
 * Top N bài viết theo reach trong `days` ngày qua, EXCLUDING today.
 * - Loại kênh disconnected
 * - HAVING reach > 0 để skip post chưa có insight
 * - LIMIT default 5 (dashboard widget compact)
 */
export async function fetchTopReachPosts(
  days = 7,
  limit = 5
): Promise<TopReachPost[]> {
  const res = await db.query<DbRow>(
    `
    SELECT
      sp.id::TEXT             AS post_id,
      sp.content,
      sp.permalink,
      sp.post_type::TEXT      AS post_type,
      sp.published_at,
      COALESCE(SUM(pmd.reach), 0)::TEXT AS total_reach,
      sa.id::TEXT             AS account_id,
      sa.name                 AS account_name,
      sa.platform::TEXT       AS platform
    FROM social_post sp
    INNER JOIN social_account sa ON sa.id = sp.account_id
    LEFT JOIN post_metric_daily pmd ON pmd.post_id = sp.id
      AND pmd.date >= CURRENT_DATE - $1::INT
      AND pmd.date <  CURRENT_DATE
    WHERE sa.status != 'disconnected'
    GROUP BY sp.id, sp.content, sp.permalink, sp.post_type, sp.published_at,
             sa.id, sa.name, sa.platform
    HAVING COALESCE(SUM(pmd.reach), 0) > 0
    ORDER BY total_reach DESC
    LIMIT $2::INT
    `,
    [days, limit]
  );

  return res.rows.map((r) => ({
    postId: r.post_id,
    content: r.content,
    permalink: r.permalink,
    postType: r.post_type,
    publishedAt: r.published_at,
    totalReach: Number(r.total_reach),
    accountId: r.account_id,
    accountName: r.account_name,
    platform: r.platform,
  }));
}
