-- Migration 021: Multi-platform Bundle.social support
-- Up migration
--
-- Extends Facebook-only schema to support Bundle-mediated platforms (TikTok, YouTube,
-- Instagram, Threads, LinkedIn, Pinterest, Reddit, Mastodon, Bluesky, Twitter).
-- New columns are nullable / additive so existing Facebook channels are unaffected.
--
-- Strategy:
--   * 1 Bundle team per channel → bundle_team_id lives on social_account (not team_member)
--   * Platform-specific metrics → raw_metrics JSONB on metric tables (typed cols stay for
--     common fields: reach, impressions, likes, comments, shares)
--   * Pending OAuth handshakes tracked in social_connect_session with 10-min TTL

-- 1. Extend platform_t enum with Bundle-supported platforms missing from original list.
--    ALTER TYPE ... ADD VALUE requires its own statement (cannot be inside a DO block
--    in a transaction on older PG); node-pg-migrate wraps each statement separately.
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'pinterest';
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'reddit';
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'mastodon';
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'bluesky';
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'twitter';

-- 2. Connect-session status enum
DO $$ BEGIN
  CREATE TYPE connect_session_status_t AS ENUM ('pending', 'completed', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. social_account: add Bundle linkage columns (nullable for backward compat with FB rows)
ALTER TABLE social_account
  ADD COLUMN IF NOT EXISTS bundle_team_id            TEXT,
  ADD COLUMN IF NOT EXISTS bundle_social_account_id  TEXT,
  ADD COLUMN IF NOT EXISTS bundle_username           TEXT,
  ADD COLUMN IF NOT EXISTS bundle_avatar_url         TEXT;

-- Index to find a channel by its Bundle team id during the finalize callback.
CREATE INDEX IF NOT EXISTS social_account_bundle_team_id_idx
  ON social_account (bundle_team_id)
  WHERE bundle_team_id IS NOT NULL;

-- 4. Platform-specific metric blobs (JSONB) on existing metric tables
ALTER TABLE account_metric_daily
  ADD COLUMN IF NOT EXISTS raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE post_metric_daily
  ADD COLUMN IF NOT EXISTS raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Bundle's imported post id, used as dedup key when re-importing nightly.
ALTER TABLE social_post
  ADD COLUMN IF NOT EXISTS bundle_imported_post_id TEXT;

CREATE INDEX IF NOT EXISTS social_post_bundle_imported_post_id_idx
  ON social_post (bundle_imported_post_id)
  WHERE bundle_imported_post_id IS NOT NULL;

-- 5. Connect-session table — tracks pending OAuth handshakes between client and Bundle
CREATE TABLE IF NOT EXISTS social_connect_session (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token       TEXT NOT NULL UNIQUE,
  owner_member_id   UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  platform          platform_t NOT NULL,
  bundle_team_id    TEXT NOT NULL,
  status            connect_session_status_t NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS social_connect_session_owner_pending_idx
  ON social_connect_session (owner_member_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS social_connect_session_expires_at_idx
  ON social_connect_session (expires_at)
  WHERE status = 'pending';

COMMENT ON COLUMN social_account.bundle_team_id IS
  'Bundle.social team id (1 team per channel for non-FB platforms). NULL for native FB channels.';
COMMENT ON TABLE social_connect_session IS
  'Pending Bundle.social OAuth handshakes — state_token is CSRF guard, expires_at is 10 min TTL.';
