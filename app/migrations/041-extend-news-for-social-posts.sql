-- Migration 041: Extend news_article cho Twitter/Facebook posts qua Apify
--
-- Boss yêu cầu thêm 10 Twitter user + 9 FB page vào /news. Twitter/FB không có
-- RSS → pull qua Apify scrapers (user setup Apify Schedule + webhook về app).
--
-- Schema extensions:
--   - source_type: 'rss' (cũ) | 'twitter' | 'facebook'. Backwards-compat: default
--     'rss' nên row cũ không cần migrate.
--   - author_handle: vd 'sama', 'rubenhassid' (Twitter) hoặc 'HoangChironCTO'
--     (FB page slug). Dùng cho UI hiển thị + filter.
--   - author_name: full display name (vd "Sam Altman"). Optional, fallback null.
--   - author_avatar: URL avatar — dùng cho card UI.
--   - raw_payload: JSONB lưu toàn bộ Apify item gốc, debug + flexible mapping
--     sau này không cần migration.
--
-- Index thêm trên (source_type, author_handle) cho query "list posts của user X".
--
-- Note: cron job-news-ingestion vẫn chỉ pull RSS. Twitter/FB ingest qua webhook
-- POST /api/news/apify-webhook (Apify gọi sau khi actor run xong).

ALTER TABLE news_article
  ADD COLUMN IF NOT EXISTS source_type   TEXT NOT NULL DEFAULT 'rss'
    CHECK (source_type IN ('rss', 'twitter', 'facebook')),
  ADD COLUMN IF NOT EXISTS author_handle TEXT,
  ADD COLUMN IF NOT EXISTS author_name   TEXT,
  ADD COLUMN IF NOT EXISTS author_avatar TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload   JSONB;

CREATE INDEX IF NOT EXISTS idx_news_article_source_type_author
  ON news_article (source_type, author_handle)
  WHERE source_type != 'rss';

COMMENT ON COLUMN news_article.source_type IS
  'rss = RSS feed cũ; twitter/facebook = social post pull qua Apify.';
COMMENT ON COLUMN news_article.author_handle IS
  'Twitter username (vd "sama") hoặc FB page slug. NULL cho RSS.';
COMMENT ON COLUMN news_article.raw_payload IS
  'Toàn bộ Apify item gốc — debug + flexible re-mapping không cần migration.';
