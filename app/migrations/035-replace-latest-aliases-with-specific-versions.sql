-- Migration 035: Replace OpenRouter "latest" aliases với specific versions
-- Up migration
--
-- Lý do: OpenRouter accept slug "latest" trong /api/v1/models nhưng có lúc
-- reject ở chat completions với 400 "is not a valid model ID". Tilde prefix
-- (migration 034) cũng không reliable. Specific version (vd
-- anthropic/claude-sonnet-4.6) là an toàn nhất.
--
-- Mapping:
--   ~anthropic/claude-sonnet-latest  → anthropic/claude-sonnet-4.6
--   anthropic/claude-sonnet-latest   → anthropic/claude-sonnet-4.6
--   ~anthropic/claude-haiku-latest   → anthropic/claude-haiku-4.5
--   anthropic/claude-haiku-latest    → anthropic/claude-haiku-4.5

UPDATE skill_chat_session
   SET model = CASE model
                 WHEN '~anthropic/claude-sonnet-latest' THEN 'anthropic/claude-sonnet-4.6'
                 WHEN  'anthropic/claude-sonnet-latest' THEN 'anthropic/claude-sonnet-4.6'
                 WHEN '~anthropic/claude-haiku-latest'  THEN 'anthropic/claude-haiku-4.5'
                 WHEN  'anthropic/claude-haiku-latest'  THEN 'anthropic/claude-haiku-4.5'
                 ELSE model
               END;

UPDATE project_chat_session
   SET model = CASE model
                 WHEN '~anthropic/claude-sonnet-latest' THEN 'anthropic/claude-sonnet-4.6'
                 WHEN  'anthropic/claude-sonnet-latest' THEN 'anthropic/claude-sonnet-4.6'
                 WHEN '~anthropic/claude-haiku-latest'  THEN 'anthropic/claude-haiku-4.5'
                 WHEN  'anthropic/claude-haiku-latest'  THEN 'anthropic/claude-haiku-4.5'
                 ELSE model
               END;
