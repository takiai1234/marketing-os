import { db } from '@/lib/db';

// All KPIs over the last `days` days.
// Previous-period delta compares against the prior `days`-day window.
//
// Window math:
//   FB metrics (reach, ER, followers) — EXCLUDE today (still syncing from FB):
//     current  = [CURRENT_DATE - days,    CURRENT_DATE)        ← exclusive of today
//     previous = [CURRENT_DATE - 2*days,  CURRENT_DATE - days) ← prior equal window
//
//   Manual/auto VN metrics (conversions, revenue) — INCLUDE today (data is final
//   the moment it's logged, no sync lag):
//     current  = [CURRENT_DATE - days,    CURRENT_DATE]        ← inclusive of today
//     previous = [CURRENT_DATE - 2*days,  CURRENT_DATE - days) ← prior equal window
//
// Channel scope: every query INNER JOINs social_account and filters out
// `status = 'disconnected'`. Keeps 'active' + 'token_expired' (token_expired
// is temporary — user may reconnect, so we still want their historical data).
// Without this filter, kênh đã hủy kết nối vẫn được tính vào tổng KPI.
//
// Tag scope: nếu `tagSlug` được pass, mỗi query chỉ tính kênh có tag đó (qua
// social_account_tag). Tab "Tổng" trên dashboard pass null → behavior cũ.
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

export async function fetchKpiData(
  days: number,
  tagSlug?: string | null
): Promise<KpiData> {
  // Tag filter: nếu có slug → mọi query INNER JOIN channel_tag để chỉ tính
  // kênh thuộc tag đó. Không có slug → behavior cũ (tab "Tổng").
  // Params: $1=days, $2=tagSlug (chỉ dùng khi tagFilter active).
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
      SELECT
        COALESCE(SUM(amd.total_reach) FILTER (
          WHERE amd.date >= CURRENT_DATE - $1::int AND amd.date < CURRENT_DATE
        ), 0) AS reach,
        COALESCE(SUM(amd.total_reach) FILTER (
          WHERE amd.date >= CURRENT_DATE - ($1::int * 2) AND amd.date < CURRENT_DATE - $1::int
        ), 0) AS reach_prev
      FROM account_metric_daily amd
      INNER JOIN social_account sa ON sa.id = amd.account_id
      WHERE sa.status != 'disconnected'
        ${tagFilter}
    `,
      params
    ),
    db.query<{ avg_er: string; avg_er_prev: string }>(
      // Engagement Rate dùng WEIGHTED average: SUM(eng) / SUM(reach) thay vì
      // AVG(per_post_ratio). AVG-of-ratios bị Simpson's paradox: post nhỏ 0
      // engagement kéo trung bình xuống không đại diện. Weighted phản ánh
      // đúng engagement rate tổng thể.
      // Nhân 100 để convert ratio (0.03) → percent (3.00) cho UI hiển thị
      // "3.00%" thay vì "0.03%".
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
    // Lead = Ladipage conversions + tin nhắn (số hội thoại Messenger).
    // Định nghĩa của sếp: mỗi hội thoại = 1 người quan tâm = 1 lead.
    // UNION ALL gộp 2 nguồn vào 1 stream rồi SUM theo window.
    // Cả 2 nguồn INCLUDE today (data final ngay khi ghi, không có sync lag).
    //
    // ⚠️ Lưu ý: bug đã xảy ra khi rewrite cho tag filter — mất phần
    // page_message_daily. Restore lại (Lead 48 chỉ là landing → thực tế
    // landing + inbox sẽ cao hơn nhiều).
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
      ) u
    `,
      params
    ),
    // Revenue — SUM(amount_vnd) from manual_revenue.
    // INCLUDES today (entered manually, always final).
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
    // Followers — current = latest snapshot per account.
    // Previous = latest snapshot per account on/before (CURRENT_DATE - days).
    // Delta tells us net follower growth across the window.
    db.query<{ total_followers: string; total_followers_prev: string }>(
      `
      WITH latest_now AS (
        SELECT DISTINCT ON (amd.account_id) amd.account_id, amd.followers
        FROM account_metric_daily amd
        INNER JOIN social_account sa ON sa.id = amd.account_id
        WHERE amd.date < CURRENT_DATE AND sa.status != 'disconnected'
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
