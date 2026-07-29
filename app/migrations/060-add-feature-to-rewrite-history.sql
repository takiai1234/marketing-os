-- Mở rộng rewrite_history để ghi thêm lịch sử chat Skill Library.
-- feature: 'rewrite' (Viết lại nội dung) | 'skill_chat' (Chat Skill Library)
-- tone/platform/length nullable vì skill_chat không có các trường này.

ALTER TABLE rewrite_history
  ADD COLUMN IF NOT EXISTS feature TEXT NOT NULL DEFAULT 'rewrite';

ALTER TABLE rewrite_history
  ALTER COLUMN tone     DROP NOT NULL,
  ALTER COLUMN platform DROP NOT NULL,
  ALTER COLUMN length   DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rewrite_history_feature ON rewrite_history(feature);
