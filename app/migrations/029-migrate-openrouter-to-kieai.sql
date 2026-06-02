-- Migration 029: Migrate OpenRouter → kie.ai (unified provider)
-- Up migration
--
-- Switch khỏi OpenRouter sang kie.ai cho cả 3 mục đích:
--   - Chat LLM (Claude / GPT-5 / Gemini qua 1 key)
--   - Tạo ảnh (đã làm ở migration 028)
--   - Tạo video (đã làm ở migration 028)
--
-- kie.ai dùng naming convention RIÊNG cho chat model (claude-sonnet-4-6,
-- gpt-5-5, gemini-3.1-pro) — KHÔNG giống OpenRouter (anthropic/claude-*).
-- Cần map lại model IDs trong existing skill_chat_session rows.
--
-- Mapping table:
--   anthropic/claude-sonnet-4.5             → claude-sonnet-4-6
--   anthropic/claude-opus-4.5               → claude-opus-4-8
--   openai/gpt-4o                           → gpt-5-5
--   openai/gpt-4o-mini                      → claude-haiku-4-5 (cheap fallback)
--   google/gemini-2.5-pro                   → gemini-3.1-pro
--   google/gemini-2.5-flash                 → gemini-3.1-pro
--   x-ai/grok-3                             → claude-sonnet-4-6 (no Grok ở kie)
--   meta-llama/llama-3.3-70b-instruct       → claude-haiku-4-5 (cheap fallback)
--
-- Bất kỳ session nào còn model slug cũ (claude-sonnet-4-5, claude-opus-4-5)
-- chưa được migration 027 đổi qua (edge case) cũng được remap.

UPDATE skill_chat_session
   SET model = CASE model
                 -- OpenRouter slugs
                 WHEN 'anthropic/claude-sonnet-4.5'       THEN 'claude-sonnet-4-6'
                 WHEN 'anthropic/claude-opus-4.5'         THEN 'claude-opus-4-8'
                 WHEN 'openai/gpt-4o'                     THEN 'gpt-5-5'
                 WHEN 'openai/gpt-4o-mini'                THEN 'claude-haiku-4-5'
                 WHEN 'google/gemini-2.5-pro'             THEN 'gemini-3.1-pro'
                 WHEN 'google/gemini-2.5-flash'           THEN 'gemini-3.1-pro'
                 WHEN 'x-ai/grok-3'                       THEN 'claude-sonnet-4-6'
                 WHEN 'meta-llama/llama-3.3-70b-instruct' THEN 'claude-haiku-4-5'
                 -- Legacy slug từ pre-OpenRouter (nếu migration 027 chưa chạy)
                 WHEN 'claude-sonnet-4-5'                 THEN 'claude-sonnet-4-6'
                 WHEN 'claude-opus-4-5'                   THEN 'claude-opus-4-8'
                 ELSE model
               END;

-- Xoá OPENROUTER_API_KEY khỏi app_setting — không dùng nữa.
-- KIE_AI_API_KEY admin phải set riêng qua UI (encrypted key khác hẳn).
DELETE FROM app_setting WHERE key = 'OPENROUTER_API_KEY';
