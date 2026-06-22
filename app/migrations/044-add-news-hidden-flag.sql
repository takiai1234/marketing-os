-- Migration 044: Cờ ẩn bài tin tức (soft-hide)
--
-- Cho phép admin "xóa" 1 bài khỏi danh sách hiển thị. Dùng soft-hide thay vì
-- DELETE cứng vì: nếu xóa hẳn row, lần quét/cron kế tiếp sẽ INSERT lại (dedupe
-- theo link ON CONFLICT DO NOTHING — link đã mất nên không còn trùng → thêm
-- lại). Giữ row + cờ hidden=true → quét lại vẫn DO NOTHING, bài ở yên trong ẩn.
--
-- List/count query thêm điều kiện `hidden = false`.

ALTER TABLE news_article
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- Partial index cho query hiển thị (chỉ row chưa ẩn) — feed luôn lọc hidden=false.
CREATE INDEX IF NOT EXISTS idx_news_article_visible
  ON news_article (published_at DESC NULLS LAST)
  WHERE hidden = false;

COMMENT ON COLUMN news_article.hidden IS
  'true = admin đã ẩn khỏi danh sách Tin tức. Row vẫn giữ để quét lại không thêm trùng.';
