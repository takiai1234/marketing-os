-- Migration 039: Add inbox_messages column to ad_metric_daily
--
-- Boss's lead definition: lead = landing data + inbox messages started from ads.
-- "Inbox messages" = FB Ads action_type 'onsite_conversion.messaging_conversation_started_7d'
-- (count of new Messenger conversations initiated by users who clicked an ad,
-- attributed within 7-day window).
--
-- Why dedicated column (vs extra_metrics JSONB):
--   - Aggregated by dashboard query daily — column lookup is faster than JSON ops
--   - Need indexing-friendly type for SUM() across millions of rows over time
--
-- Backfill: cron job will re-pull insights next run, populating the column.
-- Until then, value defaults to 0 (no inbox attributed) which is a safe under-count.

ALTER TABLE ad_metric_daily
  ADD COLUMN IF NOT EXISTS inbox_messages BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ad_metric_daily.inbox_messages IS
  'Số inbox mới (messaging_conversation_started_7d) attributed về ad. Dùng cho định nghĩa lead = landing + inbox.';
