-- Lịch sử mỗi lần thành viên dùng AI viết lại nội dung.
-- Ghi sau mỗi lần POST /api/rewrite thành công.

CREATE TABLE IF NOT EXISTS rewrite_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES team_member(id) ON DELETE SET NULL,
  user_name     TEXT,                        -- snapshot tên lúc ghi (tránh JOIN khi user bị xóa)
  model         TEXT        NOT NULL,        -- vd cc/claude-sonnet-4-5-20250929
  source_type   TEXT        NOT NULL,        -- 'library_post' | 'news'
  source_context TEXT,                       -- tên kênh / nguồn tin
  tone          TEXT        NOT NULL,        -- friendly | professional | gen-z | ...
  platform      TEXT        NOT NULL,        -- facebook_post | tiktok | ...
  length        TEXT        NOT NULL,        -- short | medium | long
  skill_id      UUID        REFERENCES skill_lib(id) ON DELETE SET NULL,
  skill_name    TEXT,                        -- snapshot tên skill
  tokens_in     INT         NOT NULL DEFAULT 0,
  tokens_out    INT         NOT NULL DEFAULT 0,
  finish_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewrite_history_user_id    ON rewrite_history(user_id);
CREATE INDEX IF NOT EXISTS idx_rewrite_history_created_at ON rewrite_history(created_at DESC);
