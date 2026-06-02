-- Migration 027: Migrate Anthropic direct → OpenRouter
-- Up migration
--
-- Switch khỏi Anthropic API direct sang OpenRouter (unified gateway cho
-- Claude + GPT + Gemini + Grok + open-source). Model IDs cần đổi format
-- để khớp với OpenRouter naming convention.
--
-- 1. Rename existing skill_chat_session.model values:
--      claude-sonnet-4-5  → anthropic/claude-sonnet-4.5
--      claude-opus-4-5    → anthropic/claude-opus-4.5
--    Existing sessions sẽ tiếp tục work với key mới (OpenRouter route
--    về cùng Anthropic backend nên output identical).
--
-- 2. Rename app_setting key:
--      ANTHROPIC_API_KEY → OPENROUTER_API_KEY
--    Giữ giá trị encrypted cũ — admin paste lại key mới ở Settings sau.
--    Đổi tên KHÔNG đổi encryption — pgp_sym_encrypt key constant.

-- 1. Migrate model IDs cũ → format OpenRouter
UPDATE skill_chat_session
   SET model = CASE model
                 WHEN 'claude-sonnet-4-5' THEN 'anthropic/claude-sonnet-4.5'
                 WHEN 'claude-opus-4-5'   THEN 'anthropic/claude-opus-4.5'
                 ELSE model
               END
 WHERE model LIKE 'claude-%';

-- 2. Rename app_setting key (giữ encrypted value cũ — admin sẽ paste key
--    mới OpenRouter sau). Nếu cùng row đã có 2 key (edge case) thì ON
--    CONFLICT bỏ qua.
UPDATE app_setting
   SET key = 'OPENROUTER_API_KEY'
 WHERE key = 'ANTHROPIC_API_KEY'
   AND NOT EXISTS (
     SELECT 1 FROM app_setting WHERE key = 'OPENROUTER_API_KEY'
   );

-- Xoá ANTHROPIC_API_KEY còn sót (đã có OPENROUTER_API_KEY row riêng)
DELETE FROM app_setting WHERE key = 'ANTHROPIC_API_KEY';
