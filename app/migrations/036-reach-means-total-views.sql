-- Migration 036: Đổi semantic cột reach từ "unique users" → "total views"
-- Up migration
--
-- Lý do: sếp phản ánh data hiển thị "reach" là unique users thay vì tổng
-- view. Code cũ map post_impressions_unique → reach (chuẩn FB nhưng không
-- match expect của marketing team Việt).
--
-- Đổi:
--   reach column NEW semantic = TỔNG VIEW (total impressions)
--     - Cho media post: dùng post_media_view (total)
--     - Cho text post (không có media_view): fallback post_impressions_unique
--       (unique) với UI badge "(unique)"
--
-- Backfill data cũ: existing rows có reach = unique, impressions = total media.
-- Nếu impressions > 0 (post có media) → reach = impressions (total).
-- Nếu impressions = 0 (text post) → giữ reach cũ (unique fallback).
-- → UI tự render: rows có impressions = 0 → badge "(unique)".
--
-- KHÔNG drop column nào — schema giữ nguyên, chỉ đổi nghĩa giá trị.

UPDATE post_metric_daily
   SET reach = impressions
 WHERE impressions > 0
   AND impressions > reach;  -- chỉ overwrite khi impressions LỚN HƠN reach
                              -- (tránh edge case data sample sai)

COMMENT ON COLUMN post_metric_daily.reach IS
  'Tổng view (impressions). Cho text post (không media) fallback về unique users từ post_impressions_unique — UI hiện badge "(unique)" khi impressions = 0.';
COMMENT ON COLUMN post_metric_daily.impressions IS
  'Total media views từ post_media_view. = 0 cho text post (FB v25 không có metric total cho text).';
