-- Migration 043: Cho phép source_type = 'web'
--
-- Tính năng "Clip trang web": extension lưu bất kỳ trang web nào (landing page,
-- bài báo...) vào news_article — tiêu đề + ảnh + đoạn text + link. Nhãn nguồn
-- riêng 'web' để UI hiển thị badge "Web" + phân biệt với RSS/social/ads.
--
-- Mở rộng CHECK constraint giống migration 042 (DROP rồi ADD lại, idempotent).

ALTER TABLE news_article
  DROP CONSTRAINT IF EXISTS news_article_source_type_check;

ALTER TABLE news_article
  ADD CONSTRAINT news_article_source_type_check
  CHECK (source_type IN ('rss', 'twitter', 'facebook', 'facebook_ads', 'web'));

COMMENT ON COLUMN news_article.source_type IS
  'rss = RSS; twitter/facebook = social qua Apify; facebook_ads = ad từ Ads Library; web = clip trang web bất kỳ qua extension.';
