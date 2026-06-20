-- Migration 042: Cho phép source_type = 'facebook_ads'
--
-- Tính năng mới: quét Facebook Ads Library theo link (nút "Scan" ở trang /news).
-- Kết quả quét (ad creatives) lưu chung bảng news_article như Twitter/FB posts,
-- nhưng source_type riêng để phân biệt + UI render badge "FB Ads".
--
-- Migration 041 tạo CHECK constraint inline khi ADD COLUMN source_type →
-- Postgres auto-name là `news_article_source_type_check`. Để mở rộng tập giá trị
-- ta DROP rồi ADD lại constraint với danh sách mới. DROP ... IF EXISTS để
-- chạy lại migration an toàn (idempotent).

ALTER TABLE news_article
  DROP CONSTRAINT IF EXISTS news_article_source_type_check;

ALTER TABLE news_article
  ADD CONSTRAINT news_article_source_type_check
  CHECK (source_type IN ('rss', 'twitter', 'facebook', 'facebook_ads'));

COMMENT ON COLUMN news_article.source_type IS
  'rss = RSS feed; twitter/facebook = social post qua Apify; facebook_ads = ad quét từ Facebook Ads Library.';
