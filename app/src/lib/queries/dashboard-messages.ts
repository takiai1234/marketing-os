import { db } from '@/lib/db';

// Messaging (inbox) detail — dùng cho chart "Tin nhắn 7 ngày qua" ở trang chi
// tiết kênh. Nguồn: page_message_daily (ghi bởi cron Job J từ FB conversations).
//
// Lưu ý: con số tin nhắn dạng tổng quan KHÔNG còn hiển thị riêng ở Dashboard —
// đã gộp vào KPI "Lead" (mỗi hội thoại = 1 lead). Xem dashboard-kpi.ts /
// dashboard-trend.ts / dashboard-channels-table.ts.

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
