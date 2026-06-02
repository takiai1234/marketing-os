-- Migration 030: Projects — claude.ai Projects-like workspace
-- Up migration
--
-- Mục đích:
--   Cho phép user tạo "Project" — workspace cá nhân gồm:
--     - Custom instructions (system prompt mặc định)
--     - Knowledge files (txt/md/pdf/docx/json/csv) — extract text
--       lúc upload, lưu thẳng vào DB để build prompt nhanh
--     - Multiple chat sessions trong cùng project (giống Claude.ai)
--
-- Khác biệt với Skill Library:
--   - Project private theo owner (1 user → many projects)
--   - Skill global cho team (1 skill → many users dùng chung)
--   - Project: edit instructions + add/remove file lẻ trực tiếp trên web,
--     không cần đóng zip + re-upload như Skill
--
-- Storage:
--   - File gốc lưu disk: /app/storage/projects/<project_id>/<file_id>__<filename>
--   - Text extract lưu DB column content_text (TEXT) — không giới hạn size
--     ở schema, app code clamp ở ~500K chars / file để tránh prompt nổ
--
-- Cascade rules:
--   - DELETE project → cascade files + sessions + messages
--   - DELETE owner (team_member) → cascade tất cả project của họ

CREATE TYPE project_chat_message_role_t AS ENUM ('user', 'assistant');

-- ─── Project ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- System prompt mặc định cho mọi chat trong project này. Plain text,
  -- user edit qua textarea ở /projects/[id].
  instructions    TEXT NOT NULL DEFAULT '',
  -- Optional emoji/icon hiển thị ở card list (vd "📊", "🎨", "📝")
  icon            TEXT,
  -- Optional color tag cho card (hex 6 chars, không # đầu)
  color_hex       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT project_color_hex_format CHECK (
    color_hex IS NULL OR color_hex ~ '^[0-9a-fA-F]{6}$'
  )
);

-- Index: list project của user X, mới sửa trước
CREATE INDEX IF NOT EXISTS project_owner_idx
  ON project (owner_id, updated_at DESC);

-- ─── Project file ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_file (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  -- Text đã extract từ file gốc (PDF/DOCX → text qua parser, MD/TXT giữ
  -- nguyên). Build system prompt = concat tất cả content_text này.
  content_text    TEXT NOT NULL DEFAULT '',
  -- Path file gốc trên disk (relative dưới SKILL_STORAGE_PATH parent —
  -- xem lib/projects/storage.ts). Có thể NULL nếu file là pure text inline.
  storage_path    TEXT,
  -- sha256 hash của content_text để dedupe + cache invalidation
  content_sha256  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_file_filename_not_blank CHECK (length(trim(filename)) > 0)
);

-- Index: list file của project, mới nhất trước
CREATE INDEX IF NOT EXISTS project_file_project_idx
  ON project_file (project_id, created_at DESC);

-- Unique filename per project — tránh confusion khi 2 file trùng tên
CREATE UNIQUE INDEX IF NOT EXISTS project_file_unique_name_idx
  ON project_file (project_id, filename);

-- ─── Project chat session ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_chat_session (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  -- user_id luôn = project.owner_id ở MVP (project private). Để cột riêng
  -- để sau dễ mở rộng "shared project" (team members chat chung).
  user_id     UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  -- Model kie.ai (claude-sonnet-4-6, gpt-5-5, gemini-3.1-pro, ...)
  model       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_chat_session_user_proj_idx
  ON project_chat_session (user_id, project_id, updated_at DESC);

-- ─── Project chat message ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_chat_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES project_chat_session(id) ON DELETE CASCADE,
  role        project_chat_message_role_t NOT NULL,
  content     TEXT NOT NULL,
  tokens_in   INT NOT NULL DEFAULT 0,
  tokens_out  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_chat_message_session_idx
  ON project_chat_message (session_id, created_at ASC);

COMMENT ON TABLE project IS
  'Workspace giống Claude.ai Projects — instructions + files + chats riêng theo owner.';
COMMENT ON TABLE project_file IS
  'File knowledge upload vào project. content_text = text đã extract (PDF/DOCX/MD), build prompt nhanh không phải re-parse.';
COMMENT ON TABLE project_chat_session IS
  'Chat session trong project, alternating user/assistant message.';
