-- Migration 020: Add Bundle team id to team_member
-- Up migration
--
-- Each local user gets one Bundle team lazily on first successful channel connect.
-- This keeps Bundle linkage separate from social_account rows and does not affect
-- existing Facebook channels until a user explicitly reconnects or adds a page.

ALTER TABLE team_member
  ADD COLUMN IF NOT EXISTS bundle_team_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS team_member_bundle_team_id_unique
  ON team_member (bundle_team_id)
  WHERE bundle_team_id IS NOT NULL;

COMMENT ON COLUMN team_member.bundle_team_id IS
  'Remote Bundle team id created lazily on first channel connect.';
