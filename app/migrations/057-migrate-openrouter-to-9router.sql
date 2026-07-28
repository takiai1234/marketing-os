-- Migration 057: Switch từ OpenRouter sang 9Router
--
-- 1. Remap model IDs trong skill_chat_session + project_chat_session
--    từ OpenRouter format (anthropic/claude-sonnet-4.6, openai/gpt-5.5, ...)
--    sang 9Router subscription format (cc/..., cx/...).
--
-- 2. Xoá app_setting key OPENROUTER_API_KEY (không còn dùng).
--    Admin sẽ set key mới NINE_ROUTER_API_KEY qua Settings UI.

-- 1a. Migrate skill_chat_session model IDs
UPDATE skill_chat_session
   SET model = CASE model
     WHEN 'anthropic/claude-sonnet-4.6'   THEN 'cc/claude-sonnet-4-5-20250929'
     WHEN 'anthropic/claude-sonnet-4.5'   THEN 'cc/claude-sonnet-4-5-20250929'
     WHEN 'anthropic/claude-opus-4.8'     THEN 'cc/claude-opus-4-5-20251101'
     WHEN 'anthropic/claude-opus-4.8-fast' THEN 'cc/claude-opus-4-5-20251101'
     WHEN 'anthropic/claude-haiku-4.5'    THEN 'cc/claude-haiku-4-5-20251001'
     WHEN 'openai/gpt-5.5'                THEN 'cx/gpt-5.2-codex'
     WHEN 'openai/gpt-5.5-pro'            THEN 'cx/gpt-5.1-codex-max'
     WHEN 'google/gemini-3.5-flash'       THEN 'cc/claude-sonnet-4-5-20250929'
     WHEN 'x-ai/grok-4.20'               THEN 'cc/claude-sonnet-4-5-20250929'
     ELSE 'cc/claude-sonnet-4-5-20250929'
   END
 WHERE model IN (
   'anthropic/claude-sonnet-4.6',
   'anthropic/claude-sonnet-4.5',
   'anthropic/claude-opus-4.8',
   'anthropic/claude-opus-4.8-fast',
   'anthropic/claude-haiku-4.5',
   'openai/gpt-5.5',
   'openai/gpt-5.5-pro',
   'google/gemini-3.5-flash',
   'x-ai/grok-4.20'
 );

-- 1b. Migrate project_chat_session nếu bảng tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_chat_session') THEN
    UPDATE project_chat_session
       SET model = CASE model
         WHEN 'anthropic/claude-sonnet-4.6'   THEN 'cc/claude-sonnet-4-5-20250929'
         WHEN 'anthropic/claude-sonnet-4.5'   THEN 'cc/claude-sonnet-4-5-20250929'
         WHEN 'anthropic/claude-opus-4.8'     THEN 'cc/claude-opus-4-5-20251101'
         WHEN 'anthropic/claude-opus-4.8-fast' THEN 'cc/claude-opus-4-5-20251101'
         WHEN 'anthropic/claude-haiku-4.5'    THEN 'cc/claude-haiku-4-5-20251001'
         WHEN 'openai/gpt-5.5'                THEN 'cx/gpt-5.2-codex'
         WHEN 'openai/gpt-5.5-pro'            THEN 'cx/gpt-5.1-codex-max'
         WHEN 'google/gemini-3.5-flash'       THEN 'cc/claude-sonnet-4-5-20250929'
         WHEN 'x-ai/grok-4.20'               THEN 'cc/claude-sonnet-4-5-20250929'
         ELSE 'cc/claude-sonnet-4-5-20250929'
       END
     WHERE model IN (
       'anthropic/claude-sonnet-4.6',
       'anthropic/claude-sonnet-4.5',
       'anthropic/claude-opus-4.8',
       'anthropic/claude-opus-4.8-fast',
       'anthropic/claude-haiku-4.5',
       'openai/gpt-5.5',
       'openai/gpt-5.5-pro',
       'google/gemini-3.5-flash',
       'x-ai/grok-4.20'
     );
  END IF;
END $$;

-- 2. Xoá OPENROUTER_API_KEY — key không còn hợp lệ cho 9Router.
--    Admin paste key mới từ 9Router dashboard qua Settings UI.
DELETE FROM app_setting WHERE key = 'OPENROUTER_API_KEY';
