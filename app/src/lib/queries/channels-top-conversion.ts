// Top Conversion leaderboard query — top N channels by SUM(conversion_count)
// trong 3 window (7 / 14 / 30 ngày). Source: landing_page_conversion (Ladipage
// cron sync — 1 row per (account, day)).
//
// Cùng pattern với channels-top-reach: 1 round-trip CTE pivot theo window để
// tránh fan-out 3 query song song. Tổng cost ~ same DB cost vì
// landing_page_conversion có index trên (occurred_date DESC) + (account_id,
// occurred_date DESC).

import { db } from '@/lib/db';

const TOP_N = 10;
export const TOP_CONVERSION_PERIODS = [7, 14, 30] as const;
export type TopConversionPeriod = (typeof TOP_CONVERSION_PERIODS)[number];

export interface TopConversionRow {
  accountId: string;
  externalId: string;
  name: string;
  platform: string;
  totalConversions: number;
  /** Conversion cao nhất trong 1 ngày trong window. */
  peakDayConversions: number;
  /** Ngày peak (vd "2026-05-28"). NULL nếu không có data. */
  peakDate: string | null;
}

export interface TopConversionLeaderboard {
  byPeriod: Record<TopConversionPeriod, TopConversionRow[]>;
  /** Total channels có ít nhất 1 conversion trong 30d. Hiển thị "10/N". */
  totalChannelsWithData: number;
}

export async function fetchTopConversionLeaderboard(): Promise<TopConversionLeaderboard> {
  const res = await db.query<{
    period_days: string;
    account_id: string;
    external_id: string;
    name: string;
    platform: string;
    total_conversions: string;
    peak_day_conversions: string;
    peak_date: string | null;
  }>(
    `
    WITH active_channels AS (
      SELECT id, external_id, name, platform
        FROM social_account
       WHERE status != 'disconnected'
    ),
    conversions_by_window AS (
      SELECT ac.id          AS account_id,
             ac.external_id AS external_id,
             ac.name        AS name,
             ac.platform    AS platform,
             w.period_days  AS period_days,
             COALESCE(SUM(lpc.conversion_count), 0)::BIGINT AS total_conversions,
             COALESCE(MAX(lpc.conversion_count), 0)::BIGINT AS peak_day_conversions,
             (SELECT lpc2.occurred_date::text
                FROM landing_page_conversion lpc2
               WHERE lpc2.account_id = ac.id
                 AND lpc2.occurred_date >= CURRENT_DATE - (w.period_days || ' days')::interval
                 AND lpc2.conversion_count > 0
               ORDER BY lpc2.conversion_count DESC,
                        lpc2.occurred_date DESC
               LIMIT 1)                                AS peak_date
        FROM active_channels ac
        CROSS JOIN (VALUES (7), (14), (30)) AS w(period_days)
        LEFT JOIN landing_page_conversion lpc
          ON lpc.account_id = ac.id
         AND lpc.occurred_date >= CURRENT_DATE - (w.period_days || ' days')::interval
       GROUP BY ac.id, ac.external_id, ac.name, ac.platform, w.period_days
    ),
    ranked AS (
      SELECT cbw.*,
             ROW_NUMBER() OVER (
               PARTITION BY period_days
               ORDER BY total_conversions DESC NULLS LAST, name ASC
             ) AS rn
        FROM conversions_by_window cbw
       WHERE total_conversions > 0
    )
    SELECT period_days::text, account_id, external_id, name, platform,
           total_conversions::text, peak_day_conversions::text, peak_date
      FROM ranked
     WHERE rn <= $1
     ORDER BY period_days, rn
    `,
    [TOP_N]
  );

  const byPeriod: Record<TopConversionPeriod, TopConversionRow[]> = {
    7: [], 14: [], 30: [],
  };

  for (const row of res.rows) {
    const period = Number(row.period_days) as TopConversionPeriod;
    if (!TOP_CONVERSION_PERIODS.includes(period)) continue;
    byPeriod[period].push({
      accountId: row.account_id,
      externalId: row.external_id,
      name: row.name,
      platform: row.platform,
      totalConversions: Number(row.total_conversions),
      peakDayConversions: Number(row.peak_day_conversions),
      peakDate: row.peak_date,
    });
  }

  const cntRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT sa.id)::text AS cnt
       FROM social_account sa
       JOIN landing_page_conversion lpc ON lpc.account_id = sa.id
      WHERE sa.status != 'disconnected'
        AND lpc.occurred_date >= CURRENT_DATE - INTERVAL '30 days'
        AND lpc.conversion_count > 0`
  );

  return {
    byPeriod,
    totalChannelsWithData: Number(cntRes.rows[0]?.cnt ?? 0),
  };
}
