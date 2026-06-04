import { db } from '@/lib/db';

// Messaging (inbox) analytics — Tier 1 cho CEO.
// Nguồn: page_message_daily (ghi bởi cron Job J từ FB conversations).
//
// Window math giống dashboard-kpi: kỳ hiện tại [CURRENT_DATE - days, CURRENT_DATE)
// so với kỳ trước [CURRENT_DATE - 2*days, CURRENT_DATE - days). KHÔNG tính hôm nay
// cho các con số so sánh (hôm nay chưa đủ ngày) — RIÊNG "unanswered now" là
// snapshot hiện tại nên đọc row mới nhất (có thể là hôm nay).
//
// Chỉ tính page Facebook còn kết nối (status != 'disconnected').

export interface MessagingKpis {
  /** Tin nhắn khách gửi đến (inbound) trong kỳ. */
  inbound: number;
  inboundPrev: number;
  /** Số hội thoại có hoạt động trong kỳ. */
  activeConversations: number;
  activeConversationsPrev: number;
  /** Tỉ lệ phản hồi % = responded / active. */
  responseRate: number;
  responseRatePrev: number;
  /** Thời gian phản hồi lần đầu TB (phút), weighted theo số hội thoại. */
  avgFirstResponseMinutes: number | null;
  avgFirstResponseMinutesPrev: number | null;
  /** Snapshot: số hội thoại đang còn tin chưa trả lời (ngay lúc này). */
  unansweredNow: number;
  /** Series inbound theo ngày (cũ → mới) cho sparkline. */
  inboundSeries: number[];
  /** Series tỉ lệ phản hồi % theo ngày cho sparkline. */
  responseRateSeries: number[];
}

export async function fetchMessagingKpis(days: number): Promise<MessagingKpis> {
  const [aggRes, unansweredRes, seriesRes] = await Promise.all([
    db.query<{
      inbound: string | null;
      inbound_prev: string | null;
      active: string | null;
      active_prev: string | null;
      responded: string | null;
      responded_prev: string | null;
      resp_num: string | null;
      resp_den: string | null;
      resp_num_prev: string | null;
      resp_den_prev: string | null;
    }>(
      `
      SELECT
        SUM(pmd.inbound_messages)        FILTER (WHERE cur)  AS inbound,
        SUM(pmd.inbound_messages)        FILTER (WHERE prv)  AS inbound_prev,
        SUM(pmd.active_conversations)    FILTER (WHERE cur)  AS active,
        SUM(pmd.active_conversations)    FILTER (WHERE prv)  AS active_prev,
        SUM(pmd.responded_conversations) FILTER (WHERE cur)  AS responded,
        SUM(pmd.responded_conversations) FILTER (WHERE prv)  AS responded_prev,
        -- weighted avg-first-response: chỉ tính row có avg không NULL
        SUM(pmd.avg_first_response_minutes * pmd.responded_conversations)
          FILTER (WHERE cur AND pmd.avg_first_response_minutes IS NOT NULL) AS resp_num,
        SUM(pmd.responded_conversations)
          FILTER (WHERE cur AND pmd.avg_first_response_minutes IS NOT NULL) AS resp_den,
        SUM(pmd.avg_first_response_minutes * pmd.responded_conversations)
          FILTER (WHERE prv AND pmd.avg_first_response_minutes IS NOT NULL) AS resp_num_prev,
        SUM(pmd.responded_conversations)
          FILTER (WHERE prv AND pmd.avg_first_response_minutes IS NOT NULL) AS resp_den_prev
      FROM page_message_daily pmd
      INNER JOIN social_account sa ON sa.id = pmd.account_id
      CROSS JOIN LATERAL (
        SELECT
          (pmd.date >= CURRENT_DATE - $1::INT AND pmd.date < CURRENT_DATE)               AS cur,
          (pmd.date >= CURRENT_DATE - (2 * $1)::INT AND pmd.date < CURRENT_DATE - $1::INT) AS prv
      ) w
      WHERE sa.status != 'disconnected'
        AND pmd.date >= CURRENT_DATE - (2 * $1)::INT
        AND pmd.date < CURRENT_DATE
      `,
      [days]
    ),
    db.query<{ unanswered_now: string | null }>(
      `
      SELECT COALESCE(SUM(u.unanswered), 0)::TEXT AS unanswered_now
      FROM social_account sa
      LEFT JOIN LATERAL (
        SELECT unanswered_conversations AS unanswered
        FROM page_message_daily
        WHERE account_id = sa.id
        ORDER BY date DESC
        LIMIT 1
      ) u ON TRUE
      WHERE sa.status != 'disconnected'
      `
    ),
    db.query<{ inbound: string; rate: string }>(
      `
      SELECT
        SUM(pmd.inbound_messages)::TEXT AS inbound,
        (CASE WHEN SUM(pmd.active_conversations) > 0
              THEN SUM(pmd.responded_conversations)::FLOAT / SUM(pmd.active_conversations) * 100
              ELSE 0 END)::TEXT AS rate
      FROM page_message_daily pmd
      INNER JOIN social_account sa ON sa.id = pmd.account_id
      WHERE sa.status != 'disconnected'
        AND pmd.date >= CURRENT_DATE - $1::INT
        AND pmd.date < CURRENT_DATE
      GROUP BY pmd.date
      ORDER BY pmd.date ASC
      `,
      [days]
    ),
  ]);

  const a = aggRes.rows[0];
  const num = (v: string | null | undefined): number => (v != null ? Number(v) : 0);

  const responded = num(a?.responded);
  const active = num(a?.active);
  const respondedPrev = num(a?.responded_prev);
  const activePrev = num(a?.active_prev);

  const respDen = num(a?.resp_den);
  const respDenPrev = num(a?.resp_den_prev);

  return {
    inbound: num(a?.inbound),
    inboundPrev: num(a?.inbound_prev),
    activeConversations: active,
    activeConversationsPrev: activePrev,
    responseRate: active > 0 ? (responded / active) * 100 : 0,
    responseRatePrev: activePrev > 0 ? (respondedPrev / activePrev) * 100 : 0,
    avgFirstResponseMinutes:
      respDen > 0 ? Math.round((num(a?.resp_num) / respDen) * 10) / 10 : null,
    avgFirstResponseMinutesPrev:
      respDenPrev > 0 ? Math.round((num(a?.resp_num_prev) / respDenPrev) * 10) / 10 : null,
    unansweredNow: num(unansweredRes.rows[0]?.unanswered_now),
    inboundSeries: seriesRes.rows.map((r) => Number(r.inbound)),
    responseRateSeries: seriesRes.rows.map((r) => Number(r.rate)),
  };
}

export interface ChannelMessageDay {
  date: string;
  inboundMessages: number;
  outboundMessages: number;
  activeConversations: number;
  respondedConversations: number;
  unansweredConversations: number;
  avgFirstResponseMinutes: number | null;
}

/** Last 7 days of messaging metrics for one page (channel detail chart).
 *  Includes today so the unanswered snapshot is visible. */
export async function fetchChannelMessages7d(
  accountId: string
): Promise<ChannelMessageDay[]> {
  const res = await db.query<{
    date: string;
    inbound_messages: number;
    outbound_messages: number;
    active_conversations: number;
    responded_conversations: number;
    unanswered_conversations: number;
    avg_first_response_minutes: string | null;
  }>(
    `
    SELECT
      to_char(date, 'YYYY-MM-DD') AS date,
      inbound_messages,
      outbound_messages,
      active_conversations,
      responded_conversations,
      unanswered_conversations,
      avg_first_response_minutes
    FROM page_message_daily
    WHERE account_id = $1
      AND date >= CURRENT_DATE - 7
      AND date <= CURRENT_DATE
    ORDER BY date ASC
    `,
    [accountId]
  );

  return res.rows.map((r) => ({
    date: r.date,
    inboundMessages: Number(r.inbound_messages),
    outboundMessages: Number(r.outbound_messages),
    activeConversations: Number(r.active_conversations),
    respondedConversations: Number(r.responded_conversations),
    unansweredConversations: Number(r.unanswered_conversations),
    avgFirstResponseMinutes:
      r.avg_first_response_minutes != null ? Number(r.avg_first_response_minutes) : null,
  }));
}
