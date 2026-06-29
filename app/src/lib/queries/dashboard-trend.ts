import { db } from '@/lib/db';

// Daily trend over a date window. 2 calling patterns:
//
// 1. Legacy: fetchTrendData(days, tagSlug) — int days, today-anchor window.
// 2. Custom range: fetchTrendData(days, tagSlug, {sinceIso, untilIso}) —
//    explicit ISO YYYY-MM-DD strings (KHÔNG pass Date object — xem note
//    trong dashboard-kpi.ts về PG 42P18).
//
// Tag scope: nếu `tagSlug` được pass, mỗi CTE chỉ tính kênh có tag đó.

export interface TrendDataPoint {
  date: string;
  reach: number;
  engagement: number;
  followers: number;
  totalPost: number;
  conversions: number;
}

export interface TrendDateRangeIso {
  sinceIso: string;
  untilIso: string;
}

export async function fetchTrendData(
  days: number,
  tagSlug?: string | null,
  range?: TrendDateRangeIso
): Promise<TrendDataPoint[]> {
  if (range) {
    return fetchWithDateRange(range, tagSlug ?? null);
  }
  return fetchWithDays(days, tagSlug ?? null);
}

// ─── Legacy days-anchor path ────────────────────────────────────────────

async function fetchWithDays(
  days: number,
  tagSlug: string | null
): Promise<TrendDataPoint[]> {
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $2
      )`
    : '';
  const params: unknown[] = tagSlug ? [days, tagSlug] : [days];

  const res = await db.query<TrendRow>(
    `
    -- PLATFORM-AWARE daily reach/engagement (xem dashboard-channels-table.ts):
    --   • Facebook: total_reach lưu daily delta → dùng trực tiếp.
    --   • Bundle (TikTok/YT/IG): total_reach là snapshot cumulative lifetime
    --     → reach của 1 ngày = delta so với ngày trước (LAG). GREATEST(0,…)
    --     bỏ qua NULL (ngày đầu range không có LAG) → ra 0, và chặn delta âm
    --     khi snapshot tụt. Followers vẫn SUM snapshot (đúng vì là số tuyệt đối).
    WITH per_account AS (
      SELECT amd.date,
             amd.followers,
             CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN amd.total_reach
                  ELSE GREATEST(0, amd.total_reach
                       - LAG(amd.total_reach) OVER (PARTITION BY amd.account_id ORDER BY amd.date))
             END AS reach,
             CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN amd.total_engagement
                  ELSE GREATEST(0, amd.total_engagement
                       - LAG(amd.total_engagement) OVER (PARTITION BY amd.account_id ORDER BY amd.date))
             END AS engagement
      FROM account_metric_daily amd
      INNER JOIN social_account sa ON sa.id = amd.account_id
      WHERE amd.date >= CURRENT_DATE - $1::int AND amd.date < CURRENT_DATE
        AND sa.status != 'disconnected'
        ${tagFilter}
    ),
    metric_agg AS (
      SELECT date,
             SUM(reach)      AS reach,
             SUM(engagement) AS engagement,
             SUM(followers)  AS followers
      FROM per_account
      GROUP BY date
    ),
    post_agg AS (
      SELECT (sp.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
             COUNT(*) AS total_post
      FROM social_post sp
      INNER JOIN social_account sa ON sa.id = sp.account_id
      WHERE sp.published_at >= (CURRENT_DATE - $1::int)::timestamptz
        AND sp.published_at <  CURRENT_DATE::timestamptz
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY (sp.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    ),
    conv_agg AS (
      SELECT lpc.occurred_date AS date,
             SUM(lpc.conversion_count) AS conversions
      FROM landing_page_conversion lpc
      INNER JOIN social_account sa ON sa.id = lpc.account_id
      WHERE lpc.occurred_date >= CURRENT_DATE - $1::int
        AND lpc.occurred_date <  CURRENT_DATE
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY lpc.occurred_date
    ),
    msg_agg AS (
      SELECT pmd.date AS date,
             SUM(pmd.active_conversations) AS conversations
      FROM page_message_daily pmd
      INNER JOIN social_account sa ON sa.id = pmd.account_id
      WHERE pmd.date >= CURRENT_DATE - $1::int
        AND pmd.date <  CURRENT_DATE
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY pmd.date
    )
    SELECT
      COALESCE(m.date, p.date, c.date, mm.date)::text AS date,
      COALESCE(m.reach, 0)        AS reach,
      COALESCE(m.engagement, 0)   AS engagement,
      COALESCE(m.followers, 0)    AS followers,
      COALESCE(p.total_post, 0)   AS total_post,
      COALESCE(c.conversions, 0) + COALESCE(mm.conversations, 0) AS conversions
    FROM metric_agg m
    FULL OUTER JOIN post_agg p ON p.date = m.date
    FULL OUTER JOIN conv_agg c ON c.date = COALESCE(m.date, p.date)
    FULL OUTER JOIN msg_agg mm ON mm.date = COALESCE(m.date, p.date, c.date)
    ORDER BY date ASC
  `,
    params
  );

  return mapRows(res.rows);
}

// ─── New custom range path (ISO strings) ────────────────────────────────

async function fetchWithDateRange(
  range: TrendDateRangeIso,
  tagSlug: string | null
): Promise<TrendDataPoint[]> {
  // Params: $1=sinceIso $2=untilIso $3=tagSlug (nếu có).
  // EVERY CTE reference cả $1 và $2 → không có position unreferenced
  // → tránh PG 42P18 (xem lesson trong dashboard-kpi.ts).
  // published_at column timestamptz so sánh với $1::date / $2::date — PG
  // auto-coerce date → midnight timestamp. KHÔNG cast $::timestamptz để
  // tránh mixed-type conflict trên same param (lesson lần trước).
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $3
      )`
    : '';
  const params: unknown[] = tagSlug
    ? [range.sinceIso, range.untilIso, tagSlug]
    : [range.sinceIso, range.untilIso];

  const res = await db.query<TrendRow>(
    `
    -- PLATFORM-AWARE daily reach/engagement (xem note ở fetchWithDays +
    -- dashboard-channels-table.ts). FB = daily delta; Bundle = LAG delta.
    WITH per_account AS (
      SELECT amd.date,
             amd.followers,
             CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN amd.total_reach
                  ELSE GREATEST(0, amd.total_reach
                       - LAG(amd.total_reach) OVER (PARTITION BY amd.account_id ORDER BY amd.date))
             END AS reach,
             CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN amd.total_engagement
                  ELSE GREATEST(0, amd.total_engagement
                       - LAG(amd.total_engagement) OVER (PARTITION BY amd.account_id ORDER BY amd.date))
             END AS engagement
      FROM account_metric_daily amd
      INNER JOIN social_account sa ON sa.id = amd.account_id
      WHERE amd.date >= $1::date AND amd.date <= $2::date
        AND sa.status != 'disconnected'
        ${tagFilter}
    ),
    metric_agg AS (
      SELECT date,
             SUM(reach)      AS reach,
             SUM(engagement) AS engagement,
             SUM(followers)  AS followers
      FROM per_account
      GROUP BY date
    ),
    post_agg AS (
      SELECT (sp.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
             COUNT(*) AS total_post
      FROM social_post sp
      INNER JOIN social_account sa ON sa.id = sp.account_id
      WHERE sp.published_at >= $1::date
        AND sp.published_at <  $2::date + INTERVAL '1 day'
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY (sp.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    ),
    conv_agg AS (
      SELECT lpc.occurred_date AS date,
             SUM(lpc.conversion_count) AS conversions
      FROM landing_page_conversion lpc
      INNER JOIN social_account sa ON sa.id = lpc.account_id
      WHERE lpc.occurred_date >= $1::date
        AND lpc.occurred_date <= $2::date
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY lpc.occurred_date
    ),
    msg_agg AS (
      SELECT pmd.date AS date,
             SUM(pmd.active_conversations) AS conversations
      FROM page_message_daily pmd
      INNER JOIN social_account sa ON sa.id = pmd.account_id
      WHERE pmd.date >= $1::date
        AND pmd.date <= $2::date
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY pmd.date
    )
    SELECT
      COALESCE(m.date, p.date, c.date, mm.date)::text AS date,
      COALESCE(m.reach, 0)        AS reach,
      COALESCE(m.engagement, 0)   AS engagement,
      COALESCE(m.followers, 0)    AS followers,
      COALESCE(p.total_post, 0)   AS total_post,
      COALESCE(c.conversions, 0) + COALESCE(mm.conversations, 0) AS conversions
    FROM metric_agg m
    FULL OUTER JOIN post_agg p ON p.date = m.date
    FULL OUTER JOIN conv_agg c ON c.date = COALESCE(m.date, p.date)
    FULL OUTER JOIN msg_agg mm ON mm.date = COALESCE(m.date, p.date, c.date)
    ORDER BY date ASC
  `,
    params
  );

  return mapRows(res.rows);
}

// ─── Shared helpers ──────────────────────────────────────────────────────

interface TrendRow {
  date: string;
  reach: string;
  engagement: string;
  followers: string;
  total_post: string;
  conversions: string;
}

function mapRows(rows: TrendRow[]): TrendDataPoint[] {
  return rows.map((row) => ({
    date: row.date,
    reach: Number(row.reach),
    engagement: Number(row.engagement),
    followers: Number(row.followers),
    totalPost: Number(row.total_post),
    conversions: Number(row.conversions),
  }));
}
