import { db } from '@/lib/db';

// All KPIs over a date range. Previous-period delta compares against the
// equal-size prior window.
//
// Window semantics:
//   - sinceDate/untilDate INCLUSIVE 2 phía (DATE column nên dùng BETWEEN).
//   - prevSinceDate/prevUntilDate cùng kích thước window, ngay sát trước.
//
//   Vd current = [03/06 → 09/06] (7 ngày) → prev = [27/05 → 02/06].
//
// Backward compat: nếu caller chỉ pass `days` (không pass dateRange), tự
// compute today-based window và prev period.
//
// Channel scope: every query INNER JOINs social_account and filters out
// `status = 'disconnected'`. Keeps 'active' + 'token_expired' (token_expired
// là temporary — user may reconnect, vẫn có data history).
//
// Tag scope: nếu `tagSlug` được pass, mỗi query chỉ tính kênh có tag đó.

export interface KpiData {
  reach: number;
  reachPrev: number;
  avgEr: number;
  avgErPrev: number;
  conversions: number;
  conversionsPrev: number;
  revenue: number;
  revenuePrev: number;
  totalFollowers: number;
  totalFollowersPrev: number;
}

export interface DateRangeOpts {
  sinceDate: Date;
  untilDate: Date;
  prevSinceDate: Date;
  prevUntilDate: Date;
}

export async function fetchKpiData(
  days: number,
  tagSlug?: string | null,
  range?: DateRangeOpts
): Promise<KpiData> {
  // Compute date params:
  // - Nếu caller pass range → dùng dates explicit (custom mode hoặc dashboard mới)
  // - Else fallback compute từ `days` anchor today (backward compat)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sinceDate =
    range?.sinceDate ?? new Date(today.getTime() - days * 86_400_000);
  const untilDate =
    range?.untilDate ?? new Date(today.getTime() - 86_400_000);
  const prevSinceDate =
    range?.prevSinceDate ?? new Date(today.getTime() - days * 2 * 86_400_000);
  const prevUntilDate =
    range?.prevUntilDate ?? new Date(today.getTime() - (days + 1) * 86_400_000);

  // Params order: $1=sinceDate $2=untilDate $3=prevSinceDate $4=prevUntilDate
  //               $5=tagSlug (nếu có)
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $5
      )`
    : '';
  const params: unknown[] = tagSlug
    ? [sinceDate, untilDate, prevSinceDate, prevUntilDate, tagSlug]
    : [sinceDate, untilDate, prevSinceDate, prevUntilDate];

  const [reachRes, erRes, convRes, revenueRes, followersRes] = await Promise.all([
    db.query<{ reach: string; reach_prev: string }>(
      `
      SELECT
        COALESCE(SUM(amd.total_reach) FILTER (
          WHERE amd.date >= $1::date AND amd.date <= $2::date
        ), 0) AS reach,
        COALESCE(SUM(amd.total_reach) FILTER (
          WHERE amd.date >= $3::date AND amd.date <= $4::date
        ), 0) AS reach_prev
      FROM account_metric_daily amd
      INNER JOIN social_account sa ON sa.id = amd.account_id
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    db.query<{ avg_er: string; avg_er_prev: string }>(
      // Engagement Rate weighted: SUM(eng) / SUM(reach) — không bị Simpson's
      // paradox. Nhân 100 convert ratio → percent.
      `
      SELECT
        COALESCE(
          (SUM(pmd.reactions + pmd.comments + pmd.shares) FILTER (
            WHERE pmd.date >= $1::date AND pmd.date <= $2::date
          ))::NUMERIC
          / NULLIF(SUM(pmd.reach) FILTER (
            WHERE pmd.date >= $1::date AND pmd.date <= $2::date
          ), 0) * 100,
          0
        ) AS avg_er,
        COALESCE(
          (SUM(pmd.reactions + pmd.comments + pmd.shares) FILTER (
            WHERE pmd.date >= $3::date AND pmd.date <= $4::date
          ))::NUMERIC
          / NULLIF(SUM(pmd.reach) FILTER (
            WHERE pmd.date >= $3::date AND pmd.date <= $4::date
          ), 0) * 100,
          0
        ) AS avg_er_prev
      FROM post_metric_daily pmd
      INNER JOIN social_post sp ON sp.id = pmd.post_id
      INNER JOIN social_account sa ON sa.id = sp.account_id
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    // Lead = Ladipage conversions + tin nhắn (số hội thoại Messenger).
    // UNION ALL gộp 2 nguồn vào 1 stream rồi SUM theo window.
    db.query<{ conv: string; conv_prev: string }>(
      `
      SELECT
        COALESCE(SUM(u.cnt) FILTER (
          WHERE u.d >= $1::date AND u.d <= $2::date
        ), 0) AS conv,
        COALESCE(SUM(u.cnt) FILTER (
          WHERE u.d >= $3::date AND u.d <= $4::date
        ), 0) AS conv_prev
      FROM (
        SELECT lpc.occurred_date AS d, lpc.conversion_count AS cnt
        FROM landing_page_conversion lpc
        INNER JOIN social_account sa ON sa.id = lpc.account_id
        WHERE sa.status != 'disconnected'
          ${tagFilter}
        UNION ALL
        SELECT pmd.date AS d, pmd.active_conversations AS cnt
        FROM page_message_daily pmd
        INNER JOIN social_account sa ON sa.id = pmd.account_id
        WHERE sa.status != 'disconnected'
          ${tagFilter}
      ) u
    `,
      params
    ),
    db.query<{ rev: string; rev_prev: string }>(
      `
      SELECT
        COALESCE(SUM(mr.amount_vnd) FILTER (
          WHERE mr.occurred_date >= $1::date AND mr.occurred_date <= $2::date
        ), 0) AS rev,
        COALESCE(SUM(mr.amount_vnd) FILTER (
          WHERE mr.occurred_date >= $3::date AND mr.occurred_date <= $4::date
        ), 0) AS rev_prev
      FROM manual_revenue mr
      INNER JOIN social_account sa ON sa.id = mr.account_id
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    // Followers — current = snapshot mới nhất tại/trước untilDate.
    // Previous = snapshot mới nhất tại/trước prevUntilDate.
    db.query<{ total_followers: string; total_followers_prev: string }>(
      `
      WITH latest_now AS (
        SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE amd.date <= $2::date AND sa.status != 'disconnected'
          ${tagFilter}
        ORDER BY amd.account_id, amd.date DESC
      ),
      latest_prev AS (
        SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE amd.date <= $4::date AND sa.status != 'disconnected'
          ${tagFilter}
        ORDER BY amd.account_id, amd.date DESC
      )
      SELECT
        COALESCE((SELECT SUM(followers) FROM latest_now), 0)  AS total_followers,
        COALESCE((SELECT SUM(followers) FROM latest_prev), 0) AS total_followers_prev
    `,
      params
    ),
  ]);

  const reachRow = reachRes.rows[0];
  const erRow = erRes.rows[0];
  const convRow = convRes.rows[0];
  const revenueRow = revenueRes.rows[0];
  const followersRow = followersRes.rows[0];

  return {
    reach: Number(reachRow?.reach ?? 0),
    reachPrev: Number(reachRow?.reach_prev ?? 0),
    avgEr: Number(erRow?.avg_er ?? 0),
    avgErPrev: Number(erRow?.avg_er_prev ?? 0),
    conversions: Number(convRow?.conv ?? 0),
    conversionsPrev: Number(convRow?.conv_prev ?? 0),
    revenue: Number(revenueRow?.rev ?? 0),
    revenuePrev: Number(revenueRow?.rev_prev ?? 0),
    totalFollowers: Number(followersRow?.total_followers ?? 0),
    totalFollowersPrev: Number(followersRow?.total_followers_prev ?? 0),
  };
}
