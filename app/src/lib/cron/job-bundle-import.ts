// Daily Bundle.social import cron — Job F.
//
// Runs at 00:00 Asia/Ho_Chi_Minh. For each active social_account linked to
// Bundle (bundle_team_id IS NOT NULL, platform != 'facebook', status='active'),
// triggers a fresh import of the latest 16 posts plus an aggregate refresh.
//
// Per-account error isolation: one failing TikTok account does NOT abort the
// rest of the batch. Failures are recorded in api_sync_log.

import { db } from '@/lib/db';
import { runBundleSync } from '@/lib/bundle/sync';
import type { SocialAccount } from '@/lib/db-types';

export interface BundleImportReport {
  total: number;
  ok: number;
  failed: number;
  skipped: number;
  byPlatform: Record<string, { ok: number; failed: number; skipped: number }>;
}

const DAILY_POSTS_PER_ACCOUNT = 16;

/**
 * Entry point invoked by node-cron. Returns a summary so the caller can log
 * a single tidy line; per-account detail lives in api_sync_log.
 */
export async function runBundleImportJob(): Promise<BundleImportReport> {
  const startedAt = new Date();
  console.log(
    `[cron/bundle-import] starting at ${startedAt.toISOString()} ` +
      `(count=${DAILY_POSTS_PER_ACCOUNT}/account)`
  );

  const { rows: accounts } = await db.query<SocialAccount>(
    `SELECT id, platform, external_id, name, persona_json,
            access_token_encrypted, connected_at, last_synced_at, status, owner_member_id,
            bundle_team_id, bundle_social_account_id, bundle_username, bundle_avatar_url
       FROM social_account
      WHERE bundle_team_id IS NOT NULL
        AND platform != 'facebook'
        AND status = 'active'
      ORDER BY connected_at ASC`
  );

  const report: BundleImportReport = {
    total: accounts.length, ok: 0, failed: 0, skipped: 0, byPlatform: {},
  };

  // Sequential — Bundle has org-wide rate-limits; running 20 accounts in
  // parallel would burn through them and trigger 429s. Each account takes
  // ~30-60s including poll, so 20 accounts ~10-20 min total. Acceptable for
  // a midnight cron.
  for (const account of accounts) {
    const platformBucket = (report.byPlatform[account.platform] ??= {
      ok: 0, failed: 0, skipped: 0,
    });

    try {
      const result = await runBundleSync(account.id, account, {
        count: DAILY_POSTS_PER_ACCOUNT,
        syncType: 'posts',
      });
      if (result.status === 'success') {
        report.ok++;
        platformBucket.ok++;
      } else if (result.status === 'skipped') {
        report.skipped++;
        platformBucket.skipped++;
      } else {
        report.failed++;
        platformBucket.failed++;
      }
    } catch (err) {
      // runBundleSync converts errors to status='failed' internally — anything
      // that bubbles out here is genuinely unexpected (DB outage, bug).
      report.failed++;
      platformBucket.failed++;
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[cron/bundle-import] account=${account.id} unexpected: ${msg}`);
    }
  }

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[cron/bundle-import] done in ${(durationMs / 1000).toFixed(1)}s — ` +
      `ok=${report.ok} failed=${report.failed} skipped=${report.skipped} total=${report.total}`
  );
  return report;
}
