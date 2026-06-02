-- Migration 033: Upgrade chat models lên flagship tier (June 2026)
-- Up migration
--
-- AVAILABLE_MODELS trong openrouter.ts vừa được cập nhật. Bỏ low-tier
-- (gpt-4o-mini, gemini-2.5-flash, llama-3.3-70b) và upgrade lên:
--   - claude-sonnet-latest (auto Sonnet 4.6+)
--   - claude-opus-4.8 + claude-opus-4.8-fast
--   - claude-haiku-latest
--   - gpt-5.5 + gpt-5.5-pro
--   - gemini-3.5-flash
--   - grok-4.20 (2M context!)
--
-- Existing session.model dùng slug cũ → guard ở route trả 400 "Model không
-- còn hỗ trợ — tạo cuộc trò chuyện mới". Migration này AUTO-REMAP để user
-- không cần tạo lại session — chỉ cần refresh page.

UPDATE skill_chat_session
   SET model = CASE model
                 -- Anthropic upgrade
                 WHEN 'anthropic/claude-sonnet-4.5' THEN 'anthropic/claude-sonnet-latest'
                 WHEN 'anthropic/claude-opus-4.5'   THEN 'anthropic/claude-opus-4.8'
                 WHEN 'anthropic/claude-haiku-4.5'  THEN 'anthropic/claude-haiku-latest'
                 -- OpenAI upgrade
                 WHEN 'openai/gpt-4o'               THEN 'openai/gpt-5.5'
                 WHEN 'openai/gpt-4o-mini'          THEN 'anthropic/claude-haiku-latest'
                 -- Google upgrade
                 WHEN 'google/gemini-2.5-pro'       THEN 'google/gemini-3.5-flash'
                 WHEN 'google/gemini-2.5-flash'     THEN 'google/gemini-3.5-flash'
                 -- xAI upgrade
                 WHEN 'x-ai/grok-3'                 THEN 'x-ai/grok-4.20'
                 -- Meta dropped — fallback sang Claude Haiku
                 WHEN 'meta-llama/llama-3.3-70b-instruct' THEN 'anthropic/claude-haiku-latest'
                 ELSE model
               END;

UPDATE project_chat_session
   SET model = CASE model
                 WHEN 'anthropic/claude-sonnet-4.5' THEN 'anthropic/claude-sonnet-latest'
                 WHEN 'anthropic/claude-opus-4.5'   THEN 'anthropic/claude-opus-4.8'
                 WHEN 'anthropic/claude-haiku-4.5'  THEN 'anthropic/claude-haiku-latest'
                 WHEN 'openai/gpt-4o'               THEN 'openai/gpt-5.5'
                 WHEN 'openai/gpt-4o-mini'          THEN 'anthropic/claude-haiku-latest'
                 WHEN 'google/gemini-2.5-pro'       THEN 'google/gemini-3.5-flash'
                 WHEN 'google/gemini-2.5-flash'     THEN 'google/gemini-3.5-flash'
                 WHEN 'x-ai/grok-3'                 THEN 'x-ai/grok-4.20'
                 WHEN 'meta-llama/llama-3.3-70b-instruct' THEN 'anthropic/claude-haiku-latest'
                 ELSE model
               END;
