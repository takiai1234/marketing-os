// Follower trend chart query — multi-line, mỗi line 1 kênh.
//
// Strategy:
//   1. Pick top 10 active channels by CURRENT follower count (snapshot mới nhất
//      trước hôm nay). Lý do limit 10: nhiều hơn → chart rối, label đè nhau.
//   2. Cho mỗi kênh, lấy daily follower count trong range N ngày qua (loại
//      trừ hôm nay vì data hôm nay chưa đủ — match exclusion rule của
//      PerformanceTrendChart và channels table).
//   3. Trả về long-format rows {date, accountId, name, platform, followers}.
//      Component pivot sang wide format cho Recharts.
//
// Forward fill: nếu kênh không có amd row cho 1 ngày cụ thể (vd cron bị skip
// hoặc account vừa connect mid-range), follower của ngày đó dùng giá trị
// gần nhất TRƯỚC đó (carry-forward). Tránh hole-trong-line-chart trông xấu.

import { db } from '@/lib/db';

const TOP_N = 10;

export interface FollowerTrendRow {
  date: string;       // YYYY-MM-DD
  accountId: string;
  name: string;
  platform: string;
  followers: number;
}

export interface FollowerTrendResponse {
  /** Long-format rows — component pivot sang wide format theo channel name. */
  rows: FollowerTrendRow[];
  /** Channel meta sorted theo current followers DESC. Dùng để legend stable
   *  order + assign màu deterministic theo position. */
  channels: Array<{
    accountId: string;
    name: string;
    platform: string;
    currentFollowers: number;
  }>;
}

export async function fetchFollowersTrend(
  days: number
): Promise<FollowerTrendResponse> {
  // Bước 1: identify top N channels by current followers
  const topChannelsRes = await db.query<{
    account_id: string;
    name: string;
    platform: string;
    current_followers: string;
  }>(
    `
    SELECT
      sa.id AS account_id,
      sa.name,
      sa.platform,
      latest.followers::TEXT AS current_followers
    FROM social_account sa
    INNER JOIN LATERAL (
      SELECT followers
      FROM account_metric_daily
      WHERE account_id = sa.id
        AND date < CURRENT_DATE
        AND followers IS NOT NULL
      ORDER BY date DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE sa.status != 'disconnected'
      AND latest.followers > 0
    ORDER BY latest.followers DESC
    LIMIT $1
    `,
    [TOP_N]
  );

  const channels = topChannelsRes.rows.map((r) => ({
    accountId: r.account_id,
    name: r.name,
    platform: r.platform,
    currentFollowers: Number(r.current_followers),
  }));

  if (channels.length === 0) {
    return { rows: [], channels: [] };
  }

  // Bước 2: lấy daily followers cho các channel đó với forward-fill.
  // generate_series tạo full date axis → LEFT JOIN amd để có row mọi ngày →
  // window LAST_VALUE IGNORE NULLS carry-forward.
  const accountIds = channels.map((c) => c.accountId);

  const trendRes = await db.query<{
    date: string;
    account_id: string;
    name: string;
    platform: string;
    followers: string | null;
  }>(
    `
    WITH date_axis AS (
      SELECT generate_series(
        CURRENT_DATE - $2::INT,
        CURRENT_DATE - 1,
        '1 day'::INTERVAL
      )::DATE AS date
    ),
    target_accounts AS (
      SELECT sa.id, sa.name, sa.platform
      FROM social_account sa
      WHERE sa.id = ANY($1::UUID[])
    ),
    -- Cartesian: every (date, account) tuple, LEFT JOIN amd để có row dù
    -- ngày đó không có metric (forward-fill ở next CTE).
    raw AS (
      SELECT
        da.date,
        ta.id AS account_id,
        ta.name,
        ta.platform,
        amd.followers
      FROM date_axis da
      CROSS JOIN target_accounts ta
      LEFT JOIN account_metric_daily amd
        ON amd.account_id = ta.id AND amd.date = da.date
    )
    -- Forward-fill: nếu followers NULL ở 1 ngày, dùng giá trị non-NULL gần
    -- nhất TRƯỚC đó của cùng account. Window function LAST_VALUE với frame
    -- ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW + IGNORE NULLS.
    SELECT
      date::TEXT AS date,
      account_id::TEXT AS account_id,
      name,
      platform,
      COALESCE(
        followers,
        last_value(followers) IGNORE NULLS OVER (
          PARTITION BY account_id ORDER BY date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
      )::TEXT AS followers
    FROM raw
    ORDER BY date ASC, name ASC
    `,
    [accountIds, days]
  );

  const rows: FollowerTrendRow[] = trendRes.rows
    // Filter NULL followers (xảy ra với những ngày đầu range NẾU account chưa
    // có data nào trước range). Tránh gap đầu line nhưng giữ tail-fill OK.
    .filter((r) => r.followers !== null)
    .map((r) => ({
      date: r.date,
      accountId: r.account_id,
      name: r.name,
      platform: r.platform,
      followers: Number(r.followers),
    }));

  return { rows, channels };
}
