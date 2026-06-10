import { db } from '@/lib/db';

// Daily trend over a date range (sinceDate..untilDate inclusive).
// reach + followers: SUM across accounts từ account_metric_daily.
// total_post: counted từ social_post.published_at (VN-aware bucket).
// conversions: SUM Ladipage + tin nhắn Messenger per ngày.
//
// Backward compat: nếu chỉ pass `days` (no range), tự compute from today.

export interface TrendDataPoint {
  date: string;
  reach: number;
  engagement: number;
  followers: number;
  totalPost: number;
  conversions: number;
}

export interface TrendDateRangeOpts {
  sinceDate: Date;
  untilDate: Date;
}

export async function fetchTrendData(
  days: number,
  tagSlug?: string | null,
  range?: TrendDateRangeOpts
): Promise<TrendDataPoint[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sinceDate =
    range?.sinceDate ?? new Date(today.getTime() - days * 86_400_000);
  const untilDate =
    range?.untilDate ?? new Date(today.getTime() - 86_400_000);

  // Pass dates as ISO strings — tránh 42P18 (Date object → timestamptz
  // inference conflict với $::date cast). Xem dashboard-kpi.ts.
  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  // Params: $1=sinceDate $2=untilDate $3=tagSlug (nếu có)
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $3
      )`
    : '';
  const params: unknown[] = tagSlug
    ? [toIso(sinceDate), toIso(untilDate), tagSlug]
    : [toIso(sinceDate), toIso(untilDate)];

  const res = await db.query<{
    date: string;
    reach: string;
    engagement: string;
    followers: string;
    total_post: string;
    conversions: string;
  }>(
    `
    WITH metric_agg AS (
      SELECT amd.date,
             SUM(amd.total_reach)      AS reach,
             SUM(amd.total_engagement) AS engagement,
             SUM(amd.followers)        AS followers
      FROM account_metric_daily amd
      INNER JOIN social_account sa ON sa.id = amd.account_id
      WHERE amd.date >= $1::date AND amd.date <= $2::date
        AND sa.status != 'disconnected'
        ${tagFilter}
      GROUP BY amd.date
    ),
    post_agg AS (
      -- Group post theo VN date — align với account_metric_daily.date (VN).
      SELECT (sp.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
             COUNT(*) AS total_post
      FROM social_post sp
      INNER JOIN social_account sa ON sa.id = sp.account_id
      -- $1/$2 ::date — published_at timestamptz auto-coerce ($1 dùng cast
      -- ::date ở các CTE khác, type phải đồng nhất → tránh PG 42P18).
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
    -- Lead cũng gồm tin nhắn (1 hội thoại = 1 lead).
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

  return res.rows.map((row) => ({
    date: row.date,
    reach: Number(row.reach),
    engagement: Number(row.engagement),
    followers: Number(row.followers),
    totalPost: Number(row.total_post),
    conversions: Number(row.conversions),
  }));
}
