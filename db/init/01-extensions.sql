-- Runs once when the Postgres container is first initialized (docker-entrypoint-initdb.d).
-- Enables pgcrypto for gen_random_bytes() used by encryption helpers.
-- Migration 001 also calls CREATE EXTENSION IF NOT EXISTS pgcrypto, so this is
-- purely a safety net for a clean container start before migrations run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
