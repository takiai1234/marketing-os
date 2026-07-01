-- Thêm cột manual_leads vào account_metric_daily để kênh thủ công nhập số lead.
-- Kênh có sync tự động (Facebook, TikTok...) vẫn dùng landing_page_conversion.
-- Kênh is_manual dùng cột này để hiển thị lead30d trên channel card.

ALTER TABLE account_metric_daily
  ADD COLUMN IF NOT EXISTS manual_leads INT NOT NULL DEFAULT 0;
