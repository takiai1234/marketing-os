import { db } from '@/lib/db';

// Hàng hiển thị trên widget Top Performers ở dashboard.
// Score 0–100 chuẩn hóa theo top performer trong cùng kỳ:
//   score = round(member_engagement / max_engagement_in_team * 100, 1)
// → top luôn = 100, người khác scale theo. Không cần tập huấn lịch sử.
export interface TopPerformerRow {
  id: string;
  rank: number;
  name: string;
  posts: number;   // số bài đăng trong window (exclude today)
  score: number;   // 0–100 normalized
}

interface DbRow {
  id: string;
  name: string;
  posts_count: string; // pg trả COUNT() dạng bigint → string
  engagement: string;  // pg trả SUM() dạng numeric → string
  score: string;       // ROUND(...) NUMERIC → string
}

// Top N member theo engagement trong `days` ngày qua, EXCLUDING today.
// Window math:
//   [CURRENT_DATE - days, CURRENT_DATE)  ← exclusive of today, đồng bộ với fetchKpiData
//
// JOIN logic:
//   team_member ⨝ social_account  (qua owner_member_id) — INNER → loại admin không quản kênh
//   social_account ⨝ social_post  — INNER + filter window → loại member không đăng bài
//   social_post ⟕ post_metric_daily — LEFT vì post mới đăng có thể chưa có metric
//
// Score normalize qua window function MAX() OVER () — 1 query duy nhất, no second pass.
export interface TopPerformersDateRangeOpts {
  sinceDate: Date;
  untilDate: Date;
}

export async function fetchTopPerformers(
  days: number,
  limit = 5,
  tagSlug?: string | null,
  range?: TopPerformersDateRangeOpts
): Promise<TopPerformerRow[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sinceDate =
    range?.sinceDate ?? new Date(today.getTime() - days * 86_400_000);
  const untilDate =
    range?.untilDate ?? new Date(today.getTime() - 86_400_000);

  // Params: $1=sinceDate $2=untilDate $3=limit $4=tagSlug
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $4
      )`
    : '';
  const params: unknown[] = tagSlug
    ? [sinceDate, untilDate, limit, tagSlug]
    : [sinceDate, untilDate, limit];

  const res = await db.query<DbRow>(
    `
    WITH member_stats AS (
      SELECT
        tm.id,
        tm.name,
        COUNT(DISTINCT sp.id) AS posts_count,
        COALESCE(SUM(pmd.reactions + pmd.comments + pmd.shares), 0) AS engagement
      FROM team_member tm
      INNER JOIN social_account sa ON sa.owner_member_id = tm.id
        AND sa.status != 'disconnected'
        ${tagFilter}
      INNER JOIN social_post sp ON sp.account_id = sa.id
        AND sp.published_at >= $1::timestamptz
        AND sp.published_at <  ($2::date + INTERVAL '1 day')::timestamptz
      LEFT JOIN post_metric_daily pmd ON pmd.post_id = sp.id
        AND pmd.date >= $1::date
        AND pmd.date <= $2::date
      GROUP BY tm.id, tm.name
      HAVING COUNT(DISTINCT sp.id) > 0
    )
    SELECT
      id,
      name,
      posts_count,
      engagement,
      CASE
        WHEN MAX(engagement) OVER () > 0
        THEN ROUND(engagement::NUMERIC / MAX(engagement) OVER () * 100, 1)
        ELSE 0
      END AS score
    FROM member_stats
    ORDER BY engagement DESC, posts_count DESC
    LIMIT $3
    `,
    params
  );

  return res.rows.map((r, i) => ({
    id: r.id,
    rank: i + 1,
    name: r.name,
    posts: Number(r.posts_count),
    score: Number(r.score),
  }));
}
