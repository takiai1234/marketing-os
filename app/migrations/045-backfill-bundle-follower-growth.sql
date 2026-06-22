-- Migration 045: Backfill follower_growth cho kênh Bundle (non-FB)
--
-- Trước đây mapAccountAggregate để follower_growth = 0 cứng cho mọi kênh Bundle
-- (TikTok/YouTube/IG…) → KPI team "Follow growth (30d)" thiếu hẳn phần Bundle.
-- Code đã sửa để tính growth tại upsert (diff vs ngày trước) cho dữ liệu MỚI.
-- Migration này backfill DỮ LIỆU CŨ: tính lại follower_growth = followers hôm
-- đó − followers ngày gần nhất trước đó, để KPI 30 ngày hiện ngay.
--
-- Chỉ đụng row của kênh KHÁC facebook (FB path đã tính growth đúng), đang = 0,
-- followers > 0, và có 1 ngày trước hợp lệ. Idempotent: chạy lại cho cùng kết quả.

UPDATE account_metric_daily amd
SET follower_growth = amd.followers - (
      SELECT p.followers
      FROM account_metric_daily p
      WHERE p.account_id = amd.account_id
        AND p.date < amd.date
        AND p.followers > 0
      ORDER BY p.date DESC
      LIMIT 1
    )
WHERE amd.account_id IN (
        SELECT id FROM social_account WHERE platform <> 'facebook'
      )
  AND amd.follower_growth = 0
  AND amd.followers > 0
  AND EXISTS (
        SELECT 1 FROM account_metric_daily p
        WHERE p.account_id = amd.account_id
          AND p.date < amd.date
          AND p.followers > 0
      );
