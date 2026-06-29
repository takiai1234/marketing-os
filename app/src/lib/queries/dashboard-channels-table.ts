import { db } from '@/lib/db';

// Channels table cho dashboard — 1 row / channel với:
//   - reach / engagement: PLATFORM-AWARE (xem CASE trong SQL).
//       • Facebook: account_metric_daily lưu daily delta từ Page Insights
//         (`page_impressions`/`page_engaged_users` per ngày) → SUM hợp lệ.
//       • Bundle.social platforms (TikTok / YouTube / IG / ...): chỉ ghi 1
//         snapshot cumulative lifetime per ngày (xem bundle/metric-mapper.ts).
//         SUM nhiều snapshot là vô nghĩa → dùng (end - start) trong range.
//         Anchor strategy (2 nấc):
//           1. PREFERRED: snapshot mới nhất tại/trước đầu range (f_start).
//              Cho con số đúng "reach phát sinh trong N ngày qua".
//           2. FALLBACK: snapshot sớm nhất TRONG range (f_start_in_range).
//              Dùng khi account vừa connect (chưa có data ≥ N ngày trước).
//              Con số có nghĩa "reach since first sync" — ít chính xác hơn
//              nhưng có ý nghĩa hơn 0.
//   - leads: SUM(conversion_count) từ landing_page_conversion (include today)
//   - posts/kpi: COUNT(social_post) / (kpi_per_day * N)
//   - growth: % thay đổi followers so với điểm đầu range (KHÔNG dùng fallback —
//     growth không có history thì hiển thị "—" mới đúng).
//
// Filter status != 'disconnected' giống ChannelHealth widget. Sort theo reach DESC
// để channel "khỏe" nhất lên đầu — UX nhất quán với health widget.

export interface ChannelTableRow {
  accountId: string;
  name: string;
  platform: string;
  reach: number;
  /** Lead = Ladipage conversions + tin nhắn (số hội thoại Messenger) trong range. */
  leads: number;
  engagementRate: number;
  postsCount: number;
  kpiTotal: number;
  /** Tăng trưởng followers % trong range. null nếu thiếu data đầu range. */
  growthPercent: number | null;
  /** Followers tuyệt đối hiện tại (snapshot mới nhất). null khi account
   *  chưa có metric row nào (vừa connect, chưa sync). */
  followers: number | null;
  /** Delta tuyệt đối = followers_end - followers_start. null khi thiếu 1
   *  trong 2 anchor — phân biệt với 0 (đứng yên thật sự). */
  followersDelta: number | null;
}

export interface ChannelsTableDateRangeIso {
  sinceIso: string;
  untilIso: string;
}

export async function fetchChannelsTable(
  days: number,
  tagSlug?: string | null,
  range?: ChannelsTableDateRangeIso
): Promise<ChannelTableRow[]> {
  if (range) {
    return fetchWithDateRange(days, range, tagSlug ?? null);
  }
  return fetchWithDays(days, tagSlug ?? null);
}

// ─── Legacy days-anchor path ────────────────────────────────────────────

async function fetchWithDays(
  days: number,
  tagSlug: string | null
): Promise<ChannelTableRow[]> {
  // Tag filter — chỉ inject khi tagSlug active. $2 = tagSlug, $1 = days.
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $2
      )`
    : '';
  const queryParams: unknown[] = tagSlug ? [days, tagSlug] : [days];
  const res = await db.query<{
    account_id: string;
    name: string;
    platform: string;
    kpi_posts_per_day: number;
    reach: string | null;
    engagement: string | null;
    posts_count: string;
    leads: string | null;
    follower_start: string | null;
    follower_end: string | null;
    inbox_conv: string | null;
  }>(
    `
    SELECT
      sa.id              AS account_id,
      sa.name,
      sa.platform,
      sa.kpi_posts_per_day,
      -- Reach: FB lưu daily delta → SUM hợp lệ. Bundle (TikTok/YT/IG) lưu
      -- cumulative lifetime → end - start.
      -- QUAN TRỌNG: NULL propagate qua phép trừ. Nếu f_start NULL, kết
      -- quả NULL → COALESCE chuyển sang fallback anchor (sớm nhất trong
      -- range). Nếu cả 2 anchor đều NULL (account chưa có data) → 0.
      -- KHÔNG được COALESCE(_,0) TRƯỚC phép trừ — sẽ ra (end - 0) = lifetime.
      CASE
        WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN COALESCE(agg.reach, 0)
        ELSE COALESCE(f_end.total_reach, 0)
      END::TEXT          AS reach,
      CASE
        WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN COALESCE(agg.engagement, 0)
        ELSE COALESCE(f_end.total_engagement, 0)
      END::TEXT          AS engagement,
      COALESCE(p.posts_count, 0)::TEXT AS posts_count,
      lc.leads,
      f_start.followers  AS follower_start,
      f_end.followers    AS follower_end,
      COALESCE(mc.inbox_conv, 0)::TEXT AS inbox_conv
    FROM social_account sa
    -- agg: SUM range — dùng cho FB (daily delta). Non-FB sẽ ignore via CASE.
    LEFT JOIN LATERAL (
      SELECT
        SUM(total_reach)::NUMERIC      AS reach,
        SUM(total_engagement)::NUMERIC AS engagement
      FROM account_metric_daily
      WHERE account_id = sa.id
        AND date >= CURRENT_DATE - $1::INT
        AND date < CURRENT_DATE
    ) agg ON TRUE
    -- Posts count from social_post (published_at falls in range)
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS posts_count
      FROM social_post
      WHERE account_id = sa.id
        AND published_at >= CURRENT_DATE - $1::INT
        AND published_at < CURRENT_DATE
    ) p ON TRUE
    -- Leads (= conversion_count) từ landing_page_conversion.
    -- INCLUDE today vì cron Ladipage pull data hôm nay lúc 23:30 VN, không có sync lag.
    -- Logic này nhất quán với dashboard-kpi.ts (conversions cũng include today).
    LEFT JOIN LATERAL (
      SELECT SUM(conversion_count)::TEXT AS leads
      FROM landing_page_conversion
      WHERE account_id = sa.id
        AND occurred_date >= CURRENT_DATE - $1::INT
        AND occurred_date <= CURRENT_DATE
    ) lc ON TRUE
    -- Snapshot ĐẦU range: followers cho growth + reach/engagement cumulative cho non-FB
    LEFT JOIN LATERAL (
      SELECT followers, total_reach, total_engagement
      FROM account_metric_daily
      WHERE account_id = sa.id AND date <= CURRENT_DATE - $1::INT
      ORDER BY date DESC LIMIT 1
    ) f_start ON TRUE
    -- Snapshot CUỐI range (gần hôm nay nhất, không bao gồm hôm nay)
    LEFT JOIN LATERAL (
      SELECT followers, total_reach, total_engagement
      FROM account_metric_daily
      WHERE account_id = sa.id AND date < CURRENT_DATE
      ORDER BY date DESC LIMIT 1
    ) f_end ON TRUE
    -- FALLBACK start anchor cho non-FB: snapshot SỚM NHẤT trong range.
    -- Chỉ kick in khi f_start NULL (account vừa connect, chưa đủ history).
    -- Không dùng cho followers/growth — growth thiếu data nên hiển thị "—".
    LEFT JOIN LATERAL (
      SELECT total_reach, total_engagement
      FROM account_metric_daily
      WHERE account_id = sa.id
        AND date > CURRENT_DATE - $1::INT
        AND date < CURRENT_DATE
      ORDER BY date ASC LIMIT 1
    ) f_start_in_range ON TRUE
    -- Lead gồm tin nhắn: số hội thoại Messenger trong range (include today,
    -- giống lc.leads). Page chưa có data messaging → 0.
    LEFT JOIN LATERAL (
      SELECT SUM(active_conversations) AS inbox_conv
      FROM page_message_daily
      WHERE account_id = sa.id
        AND date >= CURRENT_DATE - $1::INT
        AND date <= CURRENT_DATE
    ) mc ON TRUE
    WHERE sa.status != 'disconnected'
      ${tagFilter}
    ORDER BY
      CASE
        WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN COALESCE(agg.reach, 0)
        ELSE COALESCE(f_end.total_reach, 0)
      END DESC,
      sa.name ASC
    `,
    queryParams
  );

  return res.rows.map((row) => mapRow(row, days));
}

// ─── New custom range path (ISO strings) ────────────────────────────────

interface RawRow {
  account_id: string;
  name: string;
  platform: string;
  kpi_posts_per_day: number;
  reach: string | null;
  engagement: string | null;
  posts_count: string;
  leads: string | null;
  follower_start: string | null;
  follower_end: string | null;
  inbox_conv: string | null;
}

async function fetchWithDateRange(
  days: number,
  range: ChannelsTableDateRangeIso,
  tagSlug: string | null
): Promise<ChannelTableRow[]> {
  // Params: $1=sinceIso $2=untilIso $3=tagSlug (nếu có).
  // EVERY LATERAL reference cả $1 và $2 (hoặc ít nhất 1 trong 2 nhưng các
  // LATERAL khác bù) → không có position unreferenced (PG 42P18 lesson).
  // Specifically:
  //   - agg, p, lc, f_start_in_range, mc dùng cả $1 và $2
  //   - f_start dùng $1 ($1::date - 1 cho snapshot trước range)
  //   - f_end dùng $2 ($2::date cho snapshot cuối range)
  const tagFilter = tagSlug
    ? `AND sa.id IN (
        SELECT sat.account_id FROM social_account_tag sat
        INNER JOIN channel_tag ct ON ct.id = sat.tag_id
        WHERE ct.slug = $3
      )`
    : '';
  const queryParams: unknown[] = tagSlug
    ? [range.sinceIso, range.untilIso, tagSlug]
    : [range.sinceIso, range.untilIso];

  const res = await db.query<RawRow>(
    `
    SELECT
      sa.id              AS account_id,
      sa.name,
      sa.platform,
      sa.kpi_posts_per_day,
      CASE
        WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN COALESCE(agg.reach, 0)
        ELSE COALESCE(f_end.total_reach, 0)
      END::TEXT          AS reach,
      CASE
        WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN COALESCE(agg.engagement, 0)
        ELSE COALESCE(f_end.total_engagement, 0)
      END::TEXT          AS engagement,
      COALESCE(p.posts_count, 0)::TEXT AS posts_count,
      lc.leads,
      f_start.followers  AS follower_start,
      f_end.followers    AS follower_end,
      COALESCE(mc.inbox_conv, 0)::TEXT AS inbox_conv
    FROM social_account sa
    LEFT JOIN LATERAL (
      SELECT
        SUM(total_reach)::NUMERIC      AS reach,
        SUM(total_engagement)::NUMERIC AS engagement
      FROM account_metric_daily
      WHERE account_id = sa.id
        AND date >= $1::date
        AND date <= $2::date
    ) agg ON TRUE
    LEFT JOIN LATERAL (
      -- published_at timestamptz so sánh với $::date — PG auto-coerce midnight.
      SELECT COUNT(*) AS posts_count
      FROM social_post
      WHERE account_id = sa.id
        AND published_at >= $1::date
        AND published_at <  $2::date + INTERVAL '1 day'
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(conversion_count)::TEXT AS leads
      FROM landing_page_conversion
      WHERE account_id = sa.id
        AND occurred_date >= $1::date
        AND occurred_date <= $2::date
    ) lc ON TRUE
    -- Snapshot ĐẦU range = snapshot mới nhất TRƯỚC sinceIso ($1).
    LEFT JOIN LATERAL (
      SELECT followers, total_reach, total_engagement
      FROM account_metric_daily
      WHERE account_id = sa.id AND date < $1::date
      ORDER BY date DESC LIMIT 1
    ) f_start ON TRUE
    -- Snapshot CUỐI range = snapshot mới nhất TẠI/TRƯỚC untilIso ($2).
    LEFT JOIN LATERAL (
      SELECT followers, total_reach, total_engagement
      FROM account_metric_daily
      WHERE account_id = sa.id AND date <= $2::date
      ORDER BY date DESC LIMIT 1
    ) f_end ON TRUE
    -- FALLBACK start anchor: snapshot SỚM NHẤT trong range.
    LEFT JOIN LATERAL (
      SELECT total_reach, total_engagement
      FROM account_metric_daily
      WHERE account_id = sa.id
        AND date >= $1::date
        AND date <= $2::date
      ORDER BY date ASC LIMIT 1
    ) f_start_in_range ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(active_conversations) AS inbox_conv
      FROM page_message_daily
      WHERE account_id = sa.id
        AND date >= $1::date
        AND date <= $2::date
    ) mc ON TRUE
    WHERE sa.status != 'disconnected'
      ${tagFilter}
    ORDER BY
      CASE
        WHEN (sa.platform = 'facebook' AND NOT sa.is_manual) THEN COALESCE(agg.reach, 0)
        ELSE COALESCE(f_end.total_reach, 0)
      END DESC,
      sa.name ASC
    `,
    queryParams
  );

  return res.rows.map((row) => mapRow(row, days));
}

// ─── Shared row mapper ──────────────────────────────────────────────────

function mapRow(row: RawRow, days: number): ChannelTableRow {
  const reach = row.reach !== null ? Number(row.reach) : 0;
  const engagement = row.engagement !== null ? Number(row.engagement) : 0;
  const postsCount = Number(row.posts_count);
  // Lead = Ladipage conversions + số hội thoại Messenger.
  const landingLeads = row.leads !== null ? Number(row.leads) : 0;
  const inboxConv = row.inbox_conv !== null ? Number(row.inbox_conv) : 0;
  const leads = landingLeads + inboxConv;
  const kpiPerDay = Number(row.kpi_posts_per_day);
  const followerStart =
    row.follower_start !== null ? Number(row.follower_start) : null;
  const followerEnd =
    row.follower_end !== null ? Number(row.follower_end) : null;

  let growthPercent: number | null = null;
  if (followerStart !== null && followerStart > 0 && followerEnd !== null) {
    growthPercent = ((followerEnd - followerStart) / followerStart) * 100;
  }

  const followersDelta =
    followerStart !== null && followerEnd !== null
      ? followerEnd - followerStart
      : null;

  return {
    accountId: row.account_id,
    name: row.name,
    platform: row.platform,
    reach,
    leads,
    engagementRate: reach > 0 ? (engagement / reach) * 100 : 0,
    postsCount,
    kpiTotal: kpiPerDay * days,
    growthPercent,
    followers: followerEnd,
    followersDelta,
  };
}
