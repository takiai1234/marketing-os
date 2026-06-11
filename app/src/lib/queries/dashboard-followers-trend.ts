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
  days: number,
  tagSlug?: string | null
): Promise<FollowerTrendResponse> {
  // Tag filter — $2 = tagSlug khi active. Bước 1 dùng $1=TOP_N, nên tag pad
  // sang $2 thẳng.
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $2
      )`
    : '';
  const topParams: unknown[] = tagSlug ? [TOP_N, tagSlug] : [TOP_N];

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
      ${tagFilter}
    ORDER BY latest.followers DESC
    LIMIT $1
    `,
    topParams
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

  // Bước 2: lấy daily followers cho các channel đó. Forward-fill làm ở JS
  // layer thay vì SQL — Postgres KHÔNG support `IGNORE NULLS` trên window
  // function (chỉ có ở SQL Server/Oracle/Snowflake). Workaround SQL cho
  // forward-fill phức tạp (cần COUNT-based grouping pattern), JS đơn giản
  // hơn và dễ debug.
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
    )
    -- Cartesian (date, account) → LEFT JOIN amd cho mỗi ngày. Followers có
    -- thể NULL khi cron skip ngày đó. JS layer fill xuôi từ giá trị non-NULL
    -- gần nhất TRƯỚC đó của cùng account.
    -- ORDER BY (account_id, date) để JS pass duy nhất, forward-fill stateful.
    SELECT
      da.date::TEXT AS date,
      ta.id::TEXT   AS account_id,
      ta.name,
      ta.platform,
      amd.followers::TEXT AS followers
    FROM date_axis da
    CROSS JOIN target_accounts ta
    LEFT JOIN account_metric_daily amd
      ON amd.account_id = ta.id AND amd.date = da.date
    ORDER BY ta.id, da.date ASC
    `,
    [accountIds, days]
  );

  // Forward-fill state per account. Pass 1 lần qua rows đã sort by
  // (account_id, date ASC) → giữ lastSeen per account, NULL → dùng lastSeen.
  const lastSeenByAccount = new Map<string, number>();
  const rows: FollowerTrendRow[] = [];
  for (const r of trendRes.rows) {
    let followers: number | null =
      r.followers !== null ? Number(r.followers) : null;

    if (followers === null) {
      // Use last non-null value of cùng account (if any)
      const prev = lastSeenByAccount.get(r.account_id);
      if (prev !== undefined) followers = prev;
    } else {
      // Update state với giá trị non-null mới
      lastSeenByAccount.set(r.account_id, followers);
    }

    // Skip rows vẫn null sau forward-fill (đầu range, account chưa có data
    // nào trước đó) — tránh gap đầu line trên chart
    if (followers === null) continue;

    rows.push({
      date: r.date,
      accountId: r.account_id,
      name: r.name,
      platform: r.platform,
      followers,
    });
  }

  // Re-sort by date asc cho chart (server trả theo account_id để forward-fill,
  // nhưng Recharts cần data point sort by x-axis date ASC).
  rows.sort((a, b) => a.date.localeCompare(b.date));

  return { rows, channels };
}
