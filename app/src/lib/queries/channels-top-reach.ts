// Top Reach leaderboard query — top N channels by SUM(reach) trong 3 window
// (7 / 14 / 30 ngày). Trả về 1 object có sẵn 3 list để client toggle qua tab
// mà không cần round-trip API.
//
// Query design: 1 round-trip duy nhất dùng CTE pivot theo window — tránh
// fan-out 3 query song song (mỗi query 1 connection pool slot).

import { db } from '@/lib/db';

const TOP_N = 10;
export const TOP_REACH_PERIODS = [7, 14, 30] as const;
export type TopReachPeriod = (typeof TOP_REACH_PERIODS)[number];

export interface TopReachRow {
  accountId: string;
  externalId: string;
  name: string;
  platform: string;
  totalReach: number;
  /** Single-day peak reach trong cùng window. Dùng cho col "Peak day". */
  peakDayReach: number;
  /** Ngày peak (vd "2026-05-28"). NULL nếu không có data. */
  peakDate: string | null;
}

export interface TopReachLeaderboard {
  byPeriod: Record<TopReachPeriod, TopReachRow[]>;
  /** Total channels có ít nhất 1 row reach > 0 trong 30d (mẫu so sánh để
   *  hiển thị "10/N kênh" nếu cần). */
  totalChannelsWithData: number;
}

/**
 * Lấy top N channel theo SUM(reach) cho 3 window song song.
 * Bỏ qua channel disconnected hoặc không có data nào (NULL → loại).
 */
export async function fetchTopReachLeaderboard(): Promise<TopReachLeaderboard> {
  const res = await db.query<{
    period_days: string;
    account_id: string;
    external_id: string;
    name: string;
    platform: string;
    total_reach: string;
    peak_day_reach: string;
    peak_date: string | null;
  }>(
    `
    WITH active_channels AS (
      SELECT id, external_id, name, platform
        FROM social_account
       WHERE status != 'disconnected'
    ),
    metrics_by_window AS (
      -- Một row cho mỗi (account, window). Window = 7|14|30.
      SELECT ac.id           AS account_id,
             ac.external_id  AS external_id,
             ac.name         AS name,
             ac.platform     AS platform,
             w.period_days   AS period_days,
             COALESCE(SUM(amd.total_reach), 0)::BIGINT AS total_reach,
             COALESCE(MAX(amd.total_reach), 0)::BIGINT AS peak_day_reach,
             (SELECT amd2.date::text
                FROM account_metric_daily amd2
               WHERE amd2.account_id = ac.id
                 AND amd2.date >= CURRENT_DATE - (w.period_days || ' days')::interval
                 AND amd2.total_reach IS NOT NULL
               ORDER BY amd2.total_reach DESC NULLS LAST,
                        amd2.date DESC
               LIMIT 1)                                AS peak_date
        FROM active_channels ac
        CROSS JOIN (VALUES (7), (14), (30)) AS w(period_days)
        LEFT JOIN account_metric_daily amd
          ON amd.account_id = ac.id
         AND amd.date >= CURRENT_DATE - (w.period_days || ' days')::interval
       GROUP BY ac.id, ac.external_id, ac.name, ac.platform, w.period_days
    ),
    -- Rank trong từng window, giữ top N
    ranked AS (
      SELECT mw.*,
             ROW_NUMBER() OVER (
               PARTITION BY period_days
               ORDER BY total_reach DESC NULLS LAST, name ASC
             ) AS rn
        FROM metrics_by_window mw
       WHERE total_reach > 0
    )
    SELECT period_days::text, account_id, external_id, name, platform,
           total_reach::text, peak_day_reach::text, peak_date
      FROM ranked
     WHERE rn <= $1
     ORDER BY period_days, rn
    `,
    [TOP_N]
  );

  // Pivot result theo period_days.
  const byPeriod: Record<TopReachPeriod, TopReachRow[]> = {
    7: [], 14: [], 30: [],
  };

  for (const row of res.rows) {
    const period = Number(row.period_days) as TopReachPeriod;
    if (!TOP_REACH_PERIODS.includes(period)) continue;
    byPeriod[period].push({
      accountId: row.account_id,
      externalId: row.external_id,
      name: row.name,
      platform: row.platform,
      totalReach: Number(row.total_reach),
      peakDayReach: Number(row.peak_day_reach),
      peakDate: row.peak_date,
    });
  }

  // Đếm số channel có data thực sự trong 30d (window rộng nhất → catch hết).
  const cntRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT sa.id)::text AS cnt
       FROM social_account sa
       JOIN account_metric_daily amd ON amd.account_id = sa.id
      WHERE sa.status != 'disconnected'
        AND amd.date >= CURRENT_DATE - INTERVAL '30 days'
        AND amd.total_reach > 0`
  );

  return {
    byPeriod,
    totalChannelsWithData: Number(cntRes.rows[0]?.cnt ?? 0),
  };
}
