-- Migration 034: Fix OpenRouter "latest" alias slug (cần tilde prefix)
-- Up migration
--
-- Bug: migration 033 đặt slug 'anthropic/claude-sonnet-latest' và
-- 'anthropic/claude-haiku-latest'. Khi gọi OpenRouter:
--   400 "anthropic/claude-sonnet-latest is not a valid model ID"
--
-- Lý do: OpenRouter dùng tilde prefix `~` cho "latest" alias auto-router.
-- Specific version (anthropic/claude-opus-4.8) KHÔNG cần tilde.
--
-- Fix: prepend `~` cho sonnet-latest và haiku-latest trong session.model.

UPDATE skill_chat_session
   SET model = '~' || model
 WHERE model IN ('anthropic/claude-sonnet-latest', 'anthropic/claude-haiku-latest');

UPDATE project_chat_session
   SET model = '~' || model
 WHERE model IN ('anthropic/claude-sonnet-latest', 'anthropic/claude-haiku-latest');
