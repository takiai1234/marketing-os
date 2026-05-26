// Bundle import poller — Job G.
//
// Runs every 5 minutes. For each social_account with a pending import ticket
// (pending_bundle_import_id IS NOT NULL), asks Bundle for the import status:
//
//   PENDING / RUNNING → leave alone, next tick checks again
//   COMPLETED         → fetch posts + upsert + log + clear ticket
//   FAILED            → log + clear ticket so the user can retry
//
// Bundle's import worker can take 2-15 min (longer for big YouTube channels).
// Splitting trigger and finalize lets the manual-sync HTTP request return in
// ~2-3 seconds while posts catch up in the background.

import { db } from '@/lib/db';
import {
  runBundleImportFinalize,
  type FinalizeOutcome,
} from '@/lib/bundle/sync';
import { logSync } from '@/lib/sync/log-sync';
import { invalidateDashboard } from '@/lib/cache/dashboard-cache';
import type { SocialAccount } from '@/lib/db-types';

const MAX_PENDING_AGE_MIN = 60; // give up after 1h

export interface PollerReport {
  scanned: number;
  completed: number;
  stillPending: number;
  failed: number;
  expired: number;
}

export async function runBundleImportPollerJob(): Promise<PollerReport> {
  const startedAt = new Date();
  const { rows } = await db.query<SocialAccount>(
    `SELECT id, platform, external_id, name, persona_json,
            access_token_encrypted, connected_at, last_synced_at, status, owner_member_id,
            bundle_team_id, bundle_social_account_id, bundle_username, bundle_avatar_url,
            pending_bundle_import_id, pending_bundle_import_at
       FROM social_account
      WHERE pending_bundle_import_id IS NOT NULL
      ORDER BY pending_bundle_import_at ASC`
  );

  const report: PollerReport = {
    scanned: rows.length, completed: 0, stillPending: 0, failed: 0, expired: 0,
  };
  if (rows.length === 0) return report;

  console.log(`[cron/bundle-poller] checking ${rows.length} pending import(s)`);

  for (const account of rows) {
    const importId = account.pending_bundle_import_id;
    if (!importId) continue;

    // Hard timeout: if a ticket has been sitting for >60 min, give up so we
    // don't hammer Bundle forever on a stuck job.
    const ageMs = account.pending_bundle_import_at
      ? Date.now() - new Date(account.pending_bundle_import_at).getTime()
      : 0;
    if (ageMs > MAX_PENDING_AGE_MIN * 60 * 1000) {
      await db.query(
        `UPDATE social_account
            SET pending_bundle_import_id = NULL,
                pending_bundle_import_at = NULL
          WHERE id = $1`,
        [account.id]
      );
      await logSync({
        syncType: 'manual_refresh', accountId: account.id, startedAt,
        status: 'failed', recordsUpserted: 0,
        errorMessage: `Pending import ${importId} aged out after ${MAX_PENDING_AGE_MIN}min`,
      });
      report.expired++;
      console.warn(`[cron/bundle-poller] ${account.id}: aged out import ${importId}`);
      continue;
    }

    let outcome: FinalizeOutcome;
    try {
      outcome = await runBundleImportFinalize(account, importId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/bundle-poller] ${account.id}: finalize threw — ${msg}`);
      report.failed++;
      continue;
    }

    if (outcome.status === 'still_pending') {
      report.stillPending++;
      continue;
    }

    if (outcome.status === 'completed') {
      report.completed++;
      await logSync({
        syncType: 'manual_refresh', accountId: account.id, startedAt,
        status: 'success',
        recordsUpserted: outcome.postsUpserted,
        details: [
          {
            endpoint: 'bundle:/post-history-import/posts',
            params: { importId },
            startedAt: startedAt.toISOString(),
            durationMs: Date.now() - startedAt.getTime(),
            httpStatus: 200,
            ok: true,
            responseSample: {
              postsImported: outcome.postsImported,
              postsUpserted: outcome.postsUpserted,
              source: 'poller-finalize',
            },
          },
        ],
      });
      console.log(
        `[cron/bundle-poller] ${account.id}: COMPLETED, upserted ${outcome.postsUpserted} posts`
      );
    } else {
      report.failed++;
      await logSync({
        syncType: 'manual_refresh', accountId: account.id, startedAt,
        status: 'failed', recordsUpserted: 0,
        errorMessage: outcome.errorMessage,
      });
      console.warn(
        `[cron/bundle-poller] ${account.id}: FAILED — ${outcome.errorMessage}`
      );
    }
  }

  if (report.completed > 0) {
    try {
      invalidateDashboard();
    } catch {
      // Outside request context — harmless, dashboard will refresh next render.
    }
  }

  console.log(
    `[cron/bundle-poller] done — completed=${report.completed} ` +
      `still_pending=${report.stillPending} failed=${report.failed} expired=${report.expired}`
  );
  return report;
}
