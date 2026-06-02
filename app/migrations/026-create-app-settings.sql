-- Migration 026: Generic encrypted key/value store cho app-level settings
-- Up migration
--
-- Use cases:
--   - ANTHROPIC_API_KEY — admin paste qua UI thay vì SSH/Coolify
--   - OPENAI_API_KEY (sau này — image generation)
--   - Các API key của 3rd party tools
--
-- Encryption: pgp_sym_encrypt với ENCRYPTION_KEY env (giống FB token).
-- value_enc là BYTEA → KHÔNG log được plaintext nếu lộ DB dump.
--
-- Access: API layer enforce admin-only. Caller helper auto-decrypt cho
-- internal use. UI không hiển thị plaintext — chỉ "Đã set" / "Chưa set" +
-- masked preview (vd "sk-ant-***...xxxx").

CREATE TABLE IF NOT EXISTS app_setting (
  key          TEXT PRIMARY KEY,
  value_enc    BYTEA NOT NULL,
  -- Description hiển thị trong UI (vd "Anthropic Claude API key cho chat skill")
  description  TEXT,
  -- Audit: ai update lần cuối
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES team_member(id) ON DELETE SET NULL
);

COMMENT ON TABLE app_setting IS
  'Encrypted key-value store cho secrets app-level (API keys của 3rd party). Decrypt via pgp_sym_decrypt với ENCRYPTION_KEY. Admin-only access enforce ở API layer.';
