-- Migration 047: Backfill total_reach kênh TikTok từ views (đã lưu trong raw_metrics).
--
-- Trước đây metric-mapper dùng `likes` làm total_reach cho TikTok vì tưởng Bundle
-- trả views=0 ở cấp account. Thực tế Bundle CÓ trả views (verified: views =
-- impressions, vd 3.26M; likes chỉ ~180K). Mapper đã được sửa để dùng views từ
-- nay. Migration này sửa dữ liệu LỊCH SỬ để chuỗi cumulative nhất quán — nếu
-- không, dashboard tính reach = (snapshot cuối − snapshot đầu) sẽ nhảy vọt khi
-- giá trị chuyển từ likes (cũ) sang views (mới).
--
-- Chỉ update các dòng có views hợp lệ trong raw_metrics (>0). Dòng không có
-- raw_metrics.views giữ nguyên (không có dữ liệu để sửa).
UPDATE account_metric_daily amd
SET total_reach = (amd.raw_metrics->>'views')::bigint
FROM social_account sa
WHERE sa.id = amd.account_id
  AND sa.platform = 'tiktok'
  AND amd.raw_metrics ? 'views'
  AND (amd.raw_metrics->>'views') ~ '^[0-9]+$'
  AND (amd.raw_metrics->>'views')::bigint > 0;
