-- Migration 056: Thêm cột engagement cho news_article
-- likes_count: tổng likes/reactions (Twitter likes, Facebook reactions)
-- shares_count: tổng chia sẻ (Twitter retweets, Facebook shares)
-- NULL = không có dữ liệu (RSS, web clips, facebook_ads)
-- 0   = có dữ liệu nhưng chưa có ai tương tác

ALTER TABLE news_article
  ADD COLUMN IF NOT EXISTS likes_count  INTEGER,
  ADD COLUMN IF NOT EXISTS shares_count INTEGER;

-- Index cho sort "nhiều tương tác nhất": likes + shares DESC
CREATE INDEX IF NOT EXISTS idx_news_article_engagement
  ON news_article ((COALESCE(likes_count, 0) + COALESCE(shares_count, 0)) DESC);
