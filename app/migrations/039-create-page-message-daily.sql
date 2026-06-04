-- Migration 039: page_message_daily — daily inbox/messaging metrics per page
-- Up migration
--
-- Tier 1 messaging analytics cho CEO. 1 row / (account, date).
-- Nguồn: FB Graph `/{page-id}/conversations` (cần token có scope
-- `pages_messaging`). Cron Job J (job-message-sync) ghi vào bảng này mỗi 2h.
--
-- Semantics các cột (tính từ messages của mỗi conversation trong cửa sổ sync):
--   active_conversations     — số hội thoại có ≥1 tin nhắn trong ngày
--   inbound_messages         — tin nhắn KHÁCH gửi đến trong ngày (from != page)
--   outbound_messages        — tin nhắn PAGE gửi đi trong ngày (from == page)
--   responded_conversations  — số hội thoại trong ngày mà page có trả lời sau
--                              tin đầu của khách
--   unanswered_conversations — SNAPSHOT hiện tại: số hội thoại đang còn tin
--                              chưa đọc (unread_count > 0). Chỉ ghi vào row
--                              của ngày hôm nay (ngày chạy cron gần nhất).
--   avg_first_response_minutes — TB thời gian page phản hồi lần đầu (phút),
--                              tính trên các hội thoại có cả tin khách + tin
--                              page trả lời trong cửa sổ. NULL nếu chưa có.
--
-- Lưu ý độ chính xác: cron chỉ lấy 25 tin gần nhất mỗi hội thoại (messages
-- .limit(25)), đủ cho khối lượng SME. Hội thoại cực nhiều tin trong 1 ngày
-- có thể bị đếm thiếu ở các ngày cũ → upsert dùng GREATEST để không tụt số.

CREATE TABLE IF NOT EXISTS page_message_daily (
  account_id                 UUID NOT NULL REFERENCES social_account(id) ON DELETE CASCADE,
  date                       DATE NOT NULL,
  active_conversations       INT NOT NULL DEFAULT 0,
  inbound_messages           INT NOT NULL DEFAULT 0,
  outbound_messages          INT NOT NULL DEFAULT 0,
  responded_conversations    INT NOT NULL DEFAULT 0,
  unanswered_conversations   INT NOT NULL DEFAULT 0,
  avg_first_response_minutes NUMERIC(10, 2),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, date)
);

CREATE INDEX IF NOT EXISTS page_message_daily_account_date_idx
  ON page_message_daily (account_id, date DESC);

COMMENT ON TABLE page_message_daily IS
  'Daily inbox/messaging metrics per page (FB conversations). Written by cron Job J.';

-- Extend sync_type_t enum để job-message-sync log được vào api_sync_log.
-- ADD VALUE chạy được trong transaction (PG 12+) miễn không dùng value ngay
-- trong cùng transaction — giống precedent migration 015 / 018.
ALTER TYPE sync_type_t ADD VALUE IF NOT EXISTS 'message_sync';
