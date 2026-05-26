-- Migration 022: Track pending Bundle imports for async polling
-- Up migration
--
-- Bundle's POST /post-history-import/ returns immediately with status=PENDING and
-- can take 2-15 minutes to finish processing (sometimes longer for large channels
-- or YouTube). Polling synchronously inside the manual-sync HTTP request times
-- out at ~90s, so we now decouple:
--
--   1. Manual sync (button click): aggregate refresh inline (fast, ~2s) +
--      queue import. social_account.pending_bundle_import_id stores the ticket.
--   2. Background poller cron: every 5 min, checks each pending import and
--      finalizes (upserts posts + clears the pending column) when COMPLETED.

ALTER TABLE social_account
  ADD COLUMN IF NOT EXISTS pending_bundle_import_id  TEXT,
  ADD COLUMN IF NOT EXISTS pending_bundle_import_at  TIMESTAMPTZ;

-- Partial index so the poller can scan "anything pending" cheaply
-- regardless of how many total accounts the org has.
CREATE INDEX IF NOT EXISTS social_account_pending_bundle_import_idx
  ON social_account (pending_bundle_import_at)
  WHERE pending_bundle_import_id IS NOT NULL;

COMMENT ON COLUMN social_account.pending_bundle_import_id IS
  'Bundle post-history-import id waiting for poller to finalize. NULL when no import in flight.';
