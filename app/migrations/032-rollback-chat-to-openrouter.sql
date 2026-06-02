-- Migration 032: Rollback chat từ kie.ai → OpenRouter
-- Up migration
--
-- Lý do rollback: kie.ai chat endpoint không stable (test thấy fail
-- thường xuyên với mọi message). Quay lại OpenRouter — đã chạy ổn từ
-- migration 027 → 028. kie.ai vẫn dùng cho image/video (đang tốt).
--
-- Remap model slugs trong existing skill_chat_session + project_chat_session:
--   claude-sonnet-4-6  → anthropic/claude-sonnet-4.5
--   claude-opus-4-8    → anthropic/claude-opus-4.5
--   claude-opus-4-7    → anthropic/claude-opus-4.5
--   claude-opus-4-6    → anthropic/claude-opus-4.5
--   claude-haiku-4-5   → anthropic/claude-haiku-4.5
--   gpt-5-5            → openai/gpt-4o
--   gemini-3.1-pro     → google/gemini-2.5-pro
--
-- Bất kỳ slug khác (legacy claude-sonnet-4-5, claude-opus-4-5) cũng nên
-- bị catch ở đây — fallback về anthropic/claude-sonnet-4.5 nếu không
-- khớp pattern nào.

UPDATE skill_chat_session
   SET model = CASE model
                 WHEN 'claude-sonnet-4-6' THEN 'anthropic/claude-sonnet-4.5'
                 WHEN 'claude-opus-4-8'   THEN 'anthropic/claude-opus-4.5'
                 WHEN 'claude-opus-4-7'   THEN 'anthropic/claude-opus-4.5'
                 WHEN 'claude-opus-4-6'   THEN 'anthropic/claude-opus-4.5'
                 WHEN 'claude-haiku-4-5'  THEN 'anthropic/claude-haiku-4.5'
                 WHEN 'gpt-5-5'           THEN 'openai/gpt-4o'
                 WHEN 'gemini-3.1-pro'    THEN 'google/gemini-2.5-pro'
                 -- Legacy slug từ migration 027 trước đó
                 WHEN 'claude-sonnet-4-5' THEN 'anthropic/claude-sonnet-4.5'
                 WHEN 'claude-opus-4-5'   THEN 'anthropic/claude-opus-4.5'
                 ELSE model
               END;

UPDATE project_chat_session
   SET model = CASE model
                 WHEN 'claude-sonnet-4-6' THEN 'anthropic/claude-sonnet-4.5'
                 WHEN 'claude-opus-4-8'   THEN 'anthropic/claude-opus-4.5'
                 WHEN 'claude-opus-4-7'   THEN 'anthropic/claude-opus-4.5'
                 WHEN 'claude-opus-4-6'   THEN 'anthropic/claude-opus-4.5'
                 WHEN 'claude-haiku-4-5'  THEN 'anthropic/claude-haiku-4.5'
                 WHEN 'gpt-5-5'           THEN 'openai/gpt-4o'
                 WHEN 'gemini-3.1-pro'    THEN 'google/gemini-2.5-pro'
                 WHEN 'claude-sonnet-4-5' THEN 'anthropic/claude-sonnet-4.5'
                 WHEN 'claude-opus-4-5'   THEN 'anthropic/claude-opus-4.5'
                 ELSE model
               END;
