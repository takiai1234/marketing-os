-- Fix: UNIQUE constraint trên ad_metric_daily treat NULL != NULL trong PostgreSQL.
-- Hệ quả: account-level rows (campaign_id IS NULL) bị INSERT thêm mỗi lần sync
-- thay vì UPDATE → dữ liệu bị cộng dồn.
--
-- Giải pháp: thay UNIQUE constraint bằng 3 partial unique indexes NULL-safe,
-- mỗi index cover 1 cấp độ (account / campaign / ad).

-- 1. Dọn duplicate rows trước khi tạo index (giữ row có created_at mới nhất)
DELETE FROM ad_metric_daily
WHERE id NOT IN (
  SELECT DISTINCT ON (ad_account_id,
                      COALESCE(campaign_id::text, ''),
                      COALESCE(ad_external_id, ''),
                      date)
         id
  FROM ad_metric_daily
  ORDER BY ad_account_id,
           COALESCE(campaign_id::text, ''),
           COALESCE(ad_external_id, ''),
           date,
           created_at DESC
);

-- 2. Xoá UNIQUE constraint cũ
ALTER TABLE ad_metric_daily
  DROP CONSTRAINT IF EXISTS ad_metric_daily_ad_account_id_campaign_id_ad_external_id_date_key;

-- 3. Tạo partial unique indexes NULL-safe
-- Cấp account (campaign_id NULL, ad_external_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ad_metric_daily_account_uq
  ON ad_metric_daily (ad_account_id, date)
  WHERE campaign_id IS NULL AND ad_external_id IS NULL;

-- Cấp campaign (campaign_id NOT NULL, ad_external_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ad_metric_daily_campaign_uq
  ON ad_metric_daily (ad_account_id, campaign_id, date)
  WHERE campaign_id IS NOT NULL AND ad_external_id IS NULL;

-- Cấp ad (campaign_id NOT NULL, ad_external_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ad_metric_daily_ad_uq
  ON ad_metric_daily (ad_account_id, campaign_id, ad_external_id, date)
  WHERE campaign_id IS NOT NULL AND ad_external_id IS NOT NULL;
