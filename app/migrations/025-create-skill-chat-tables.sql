-- Migration 025: Skill chat — user chat với skill qua Anthropic Claude API
-- Up migration
--
-- Architecture:
--   skill_chat_session ↔ skill_chat_message (1:N)
--   Mỗi session = 1 cuộc hội thoại với 1 skill cụ thể của 1 user.
--   User chọn model (sonnet/opus) per-session — saved cho re-create sau.
--
-- Privacy: user chỉ thấy session của chính mình (filter by user_id).
-- Admin có thể xem all qua DB query trực tiếp nếu cần (audit).
--
-- Storage notes:
--   - Cả `content` lẫn `tokens_*` lưu plain INT/TEXT — chat content KHÔNG
--     encrypt (giống các chat app khác); user trust app + DB.
--   - `tokens_in` + `tokens_out` per message → easy aggregate cost report.

CREATE TYPE skill_chat_message_role_t AS ENUM ('user', 'assistant');

CREATE TABLE IF NOT EXISTS skill_chat_session (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id    UUID NOT NULL REFERENCES skill_lib(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  -- Title auto-generated từ first user message (truncate ~60 chars), admin
  -- có thể rename sau qua PATCH.
  title       TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  -- Model dùng cho session này — fix khi tạo (đổi giữa chừng làm sai
  -- cost tracking + có thể inconsistent style)
  model       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho "list session của user X với skill Y" — query thường xuyên
CREATE INDEX IF NOT EXISTS skill_chat_session_user_skill_idx
  ON skill_chat_session (user_id, skill_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS skill_chat_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES skill_chat_session(id) ON DELETE CASCADE,
  role        skill_chat_message_role_t NOT NULL,
  content     TEXT NOT NULL,
  -- Tokens chỉ có cho role='assistant' (Claude trả về usage stats).
  -- Cho role='user', tokens_in = 0 (input tokens được tính ở message_delta
  -- của response sau đó).
  tokens_in   INT NOT NULL DEFAULT 0,
  tokens_out  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index "load messages của session theo thứ tự thời gian"
CREATE INDEX IF NOT EXISTS skill_chat_message_session_idx
  ON skill_chat_message (session_id, created_at ASC);

COMMENT ON TABLE skill_chat_session IS
  'Cuộc hội thoại của user với 1 skill qua Anthropic Claude API. Model cố định per session.';
COMMENT ON TABLE skill_chat_message IS
  'Messages trong session — alternating user/assistant. tokens_in/out lưu cost tracking.';
