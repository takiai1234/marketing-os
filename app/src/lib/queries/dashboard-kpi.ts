import { db } from '@/lib/db';

// All KPIs over a date window. Supports 2 calling patterns:
//
// 1. Legacy: fetchKpiData(days, tagSlug) — pass int days, window anchored
//    to today (today - days, today).
//
// 2. Custom range: fetchKpiData(days, tagSlug, {sinceIso, untilIso,
//    prevSinceIso, prevUntilIso}) — explicit ISO YYYY-MM-DD strings.
//
// CRITICAL TYPE LESSON: SQL uses $N::date cast. Caller MUST pass strings
// like "2026-06-04", NOT Date objects. Node-pg serializes Date as
// timestamptz ISO with TZ — PG infers wrong type → 42P18 "could not
// determine data type of parameter". String → cleanly castable.
//
// Channel scope: every query INNER JOINs social_account and filters out
// `status = 'disconnected'`. Keeps 'active' + 'token_expired'.
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

export interface DateRangeIso {
  /** YYYY-MM-DD start of current window (inclusive). */
  sinceIso: string;
  /** YYYY-MM-DD end of current window (inclusive). */
  untilIso: string;
  /** YYYY-MM-DD start of previous-equal-size window (inclusive). */
  prevSinceIso: string;
  /** YYYY-MM-DD end of previous-equal-size window (inclusive). */
  prevUntilIso: string;
}

export async function fetchKpiData(
  days: number,
  tagSlug?: string | null,
  range?: DateRangeIso
): Promise<KpiData> {
  // Tag filter: nếu có slug → mọi query INNER JOIN channel_tag để chỉ tính
  // kênh thuộc tag đó. Không có slug → behavior cũ (tab "Tổng").
  // Params order khi có range:
  //   $1=sinceIso $2=untilIso $3=prevSinceIso $4=prevUntilIso $5=tagSlug
  // Params order khi chỉ có days (legacy):
  //   $1=days $2=tagSlug

  if (range) {
    return fetchWithDateRange(range, tagSlug ?? null);
  }
  return fetchWithDays(days, tagSlug ?? null);
}

// ─── Legacy path: days-anchor (original SQL) ────────────────────────────

async function fetchWithDays(days: number, tagSlug: string | null): Promise<KpiData> {
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $2
      )`
    : '';
  const params: unknown[] = tagSlug ? [days, tagSlug] : [days];

  const [reachRes, erRes, convRes, revenueRes, followersRes] = await Promise.all([
    db.query<{ reach: string; reach_prev: string }>(
      `
      -- PLATFORM-AWARE reach:
      --   • Facebook: total_reach = daily delta → SUM trong window.
      --   • Bundle (TikTok/YT/IG): total_reach = snapshot cumulative lifetime
      --     → reach_cur = row mới nhất (không lọc theo ngày vì dữ liệu lịch sử
      --     có thể = 0 nếu sync mới chạy lần đầu hôm nay).
      --     reach_prev = snapshot tại cuối kỳ trước (trước window).
      SELECT
        COALESCE(SUM(r.reach_cur), 0)::text  AS reach,
        COALESCE(SUM(r.reach_prev), 0)::text AS reach_prev
      FROM social_account sa
      LEFT JOIN LATERAL (
        SELECT
          CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual)
            THEN COALESCE((SELECT SUM(total_reach) FROM account_metric_daily
                           WHERE account_id = sa.id
                             AND date >= CURRENT_DATE - $1::int AND date < CURRENT_DATE), 0)
            ELSE COALESCE((SELECT total_reach FROM account_metric_daily
                           WHERE account_id = sa.id
                           ORDER BY date DESC LIMIT 1), 0)
          END AS reach_cur,
          CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual)
            THEN COALESCE((SELECT SUM(total_reach) FROM account_metric_daily
                           WHERE account_id = sa.id
                             AND date >= CURRENT_DATE - ($1::int * 2)
                             AND date < CURRENT_DATE - $1::int), 0)
            ELSE COALESCE((SELECT total_reach FROM account_metric_daily
                           WHERE account_id = sa.id AND date < CURRENT_DATE - $1::int
                           ORDER BY date DESC LIMIT 1), 0)
          END AS reach_prev
      ) r ON TRUE
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    db.query<{ avg_er: string; avg_er_prev: string }>(
      `
      SELECT
        COALESCE(
          (SUM(pmd.reactions + pmd.comments + pmd.shares) FILTER (
            WHERE pmd.date >= CURRENT_DATE - $1::int AND pmd.date < CURRENT_DATE
          ))::NUMERIC
          / NULLIF(SUM(pmd.reach) FILTER (
            WHERE pmd.date >= CURRENT_DATE - $1::int AND pmd.date < CURRENT_DATE
          ), 0) * 100,
          0
        ) AS avg_er,
        COALESCE(
          (SUM(pmd.reactions + pmd.comments + pmd.shares) FILTER (
            WHERE pmd.date >= CURRENT_DATE - ($1::int * 2) AND pmd.date < CURRENT_DATE - $1::int
          ))::NUMERIC
          / NULLIF(SUM(pmd.reach) FILTER (
            WHERE pmd.date >= CURRENT_DATE - ($1::int * 2) AND pmd.date < CURRENT_DATE - $1::int
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
    db.query<{ conv: string; conv_prev: string }>(
      `
      SELECT
        COALESCE(SUM(u.cnt) FILTER (
          WHERE u.d >= CURRENT_DATE - $1::int AND u.d <= CURRENT_DATE
        ), 0) AS conv,
        COALESCE(SUM(u.cnt) FILTER (
          WHERE u.d >= CURRENT_DATE - ($1::int * 2) AND u.d < CURRENT_DATE - $1::int
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
        UNION ALL
        SELECT amd.date AS d, amd.manual_leads AS cnt
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE sa.is_manual AND sa.status != 'disconnected' AND amd.manual_leads > 0
          ${tagFilter}
      ) u
    `,
      params
    ),
    db.query<{ rev: string; rev_prev: string }>(
      `
      SELECT
        COALESCE(SUM(mr.amount_vnd) FILTER (
          WHERE mr.occurred_date >= CURRENT_DATE - $1::int AND mr.occurred_date <= CURRENT_DATE
        ), 0) AS rev,
        COALESCE(SUM(mr.amount_vnd) FILTER (
          WHERE mr.occurred_date >= CURRENT_DATE - ($1::int * 2) AND mr.occurred_date < CURRENT_DATE - $1::int
        ), 0) AS rev_prev
      FROM manual_revenue mr
      INNER JOIN social_account sa ON sa.id = mr.account_id
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    db.query<{ total_followers: string; total_followers_prev: string }>(
      `
      WITH latest_now AS (
        -- Lấy row MỚI NHẤT (không lọc date) vì dữ liệu lịch sử có thể = 0
        -- nếu sync mới chạy lần đầu hôm nay (TikTok/Bundle).
        SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE sa.status != 'disconnected'
          ${tagFilter}
        ORDER BY amd.account_id, amd.date DESC
      ),
      latest_prev AS (
        SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE amd.date < CURRENT_DATE - $1::int AND sa.status != 'disconnected'
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

  return parseRows(reachRes, erRes, convRes, revenueRes, followersRes);
}

// ─── New path: explicit date range (ISO strings) ─────────────────────────

async function fetchWithDateRange(
  range: DateRangeIso,
  tagSlug: string | null
): Promise<KpiData> {
  // Params order: $1=sinceIso $2=untilIso $3=prevSinceIso $4=prevUntilIso
  //               $5=tagSlug (chỉ dùng khi tagFilter active)
  // All 4 date params cast $N::date — ISO YYYY-MM-DD string PG parse rõ ràng.
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $5
      )`
    : '';
  const baseParams = [
    range.sinceIso,
    range.untilIso,
    range.prevSinceIso,
    range.prevUntilIso,
  ];
  const params: unknown[] = tagSlug ? [...baseParams, tagSlug] : baseParams;

  const [reachRes, erRes, convRes, revenueRes, followersRes] = await Promise.all([
    db.query<{ reach: string; reach_prev: string }>(
      `
      -- Total Reach = TỔNG reach mọi nền tảng (per-account rồi SUM):
      --   • Facebook: total_reach = daily delta → SUM trong window [$1,$2].
      --   • Bundle (TikTok = views, YT/IG…): total_reach = snapshot cumulative
      --     → reach_cur = row mới nhất (không lọc date vì dữ liệu lịch sử có
      --     thể = 0 nếu sync mới chạy lần đầu hôm nay).
      --     reach_prev = snapshot cuối kỳ trước.
      SELECT
        COALESCE(SUM(r.reach_cur), 0)::text  AS reach,
        COALESCE(SUM(r.reach_prev), 0)::text AS reach_prev
      FROM social_account sa
      LEFT JOIN LATERAL (
        SELECT
          CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual)
            THEN COALESCE((SELECT SUM(total_reach) FROM account_metric_daily
                           WHERE account_id = sa.id AND date >= $1::date AND date <= $2::date), 0)
            ELSE COALESCE((SELECT total_reach FROM account_metric_daily
                           WHERE account_id = sa.id
                           ORDER BY date DESC LIMIT 1), 0)
          END AS reach_cur,
          CASE WHEN (sa.platform = 'facebook' AND NOT sa.is_manual)
            THEN COALESCE((SELECT SUM(total_reach) FROM account_metric_daily
                           WHERE account_id = sa.id AND date >= $3::date AND date <= $4::date), 0)
            ELSE COALESCE((SELECT total_reach FROM account_metric_daily
                           WHERE account_id = sa.id AND date <= $4::date
                           ORDER BY date DESC LIMIT 1), 0)
          END AS reach_prev
      ) r ON TRUE
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    db.query<{ avg_er: string; avg_er_prev: string }>(
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
        UNION ALL
        SELECT amd.date AS d, amd.manual_leads AS cnt
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE sa.is_manual AND sa.status != 'disconnected' AND amd.manual_leads > 0
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
    // Followers query CHỈ dùng untilIso + prevUntilIso (anchor points).
    // KHÔNG share params array với 4 query trên — vì nếu share, $1/$3 (sinceIso,
    // prevSinceIso) sẽ unused trong query này → PG 42P18 "could not determine
    // data type" trên position unreferenced. Pass riêng params [untilIso,
    // prevUntilIso] + tagSlug nếu có. Tag pad sang $3.
    (() => {
      const followersTagFilter = tagSlug
        ? `AND sa.id IN (
            SELECT sat.account_id FROM social_account_tag sat
            INNER JOIN channel_tag ct ON ct.id = sat.tag_id
            WHERE ct.slug = $3
          )`
        : '';
      const followersParams: unknown[] = tagSlug
        ? [range.untilIso, range.prevUntilIso, tagSlug]
        : [range.untilIso, range.prevUntilIso];
      return db.query<{ total_followers: string; total_followers_prev: string }>(
        `
        WITH latest_now AS (
          -- Lấy row MỚI NHẤT (không lọc date) vì dữ liệu lịch sử có thể = 0
          -- nếu sync mới chạy lần đầu hôm nay (TikTok/Bundle).
          SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
          FROM account_metric_daily amd
          INNER JOIN social_account sa ON sa.id = amd.account_id
          WHERE sa.status != 'disconnected'
            ${followersTagFilter}
          ORDER BY amd.account_id, amd.date DESC
        ),
        latest_prev AS (
          SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
          FROM account_metric_daily amd
          INNER JOIN social_account sa ON sa.id = amd.account_id
          WHERE amd.date <= $2::date AND sa.status != 'disconnected'
            ${followersTagFilter}
          ORDER BY amd.account_id, amd.date DESC
        )
        SELECT
          COALESCE((SELECT SUM(followers) FROM latest_now), 0)  AS total_followers,
          COALESCE((SELECT SUM(followers) FROM latest_prev), 0) AS total_followers_prev
      `,
        followersParams
      );
    })(),
  ]);

  return parseRows(reachRes, erRes, convRes, revenueRes, followersRes);
}

// ─── Helper: parse query results into KpiData ────────────────────────────

function parseRows(
  reachRes: { rows: { reach: string; reach_prev: string }[] },
  erRes: { rows: { avg_er: string; avg_er_prev: string }[] },
  convRes: { rows: { conv: string; conv_prev: string }[] },
  revenueRes: { rows: { rev: string; rev_prev: string }[] },
  followersRes: {
    rows: { total_followers: string; total_followers_prev: string }[];
  }
): KpiData {
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
