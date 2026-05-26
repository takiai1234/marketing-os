// Bundle.social sync — split into three independent operations.
//
// Why split? Bundle's POST /post-history-import/ returns immediately with
// status=PENDING and can take 2-15 minutes to finalize (large channels,
// YouTube parsing, etc.). Polling synchronously inside the manual-sync HTTP
// request times out at ~90s, which is too short for many real channels.
//
// New architecture:
//   1. runBundleAccountSync()    — aggregate refresh + upsert (~2s, fast feedback)
//   2. runBundleImportTrigger()  — POST import, save ticket, return immediately
//   3. runBundleImportFinalize() — poller cron consumes the ticket later
//
// `runBundleSync()` orchestrates 1 + 2 for the manual button (one click does
// what the user expects: refresh stats now, queue posts to come later).

import { db } from '@/lib/db';
import {
  checkBundleCapacity,
  fetchImportedPosts,
  forceRefreshSocialAccount,
  getImportStatus,
  triggerImport,
  type ImportedPost,
} from './import-runner';
import {
  mapAccountAggregate,
  mapBundlePostType,
  mapPostAnalytics,
} from './metric-mapper';
import {
  upsertBundleAccountMetric,
  upsertBundlePostMetric,
  upsertBundleSocialPost,
} from './upsert';
import { requirePlatform, type PlatformMeta } from '@/lib/platforms/registry';
import { logSync } from '@/lib/sync/log-sync';
import { invalidateDashboard } from '@/lib/cache/dashboard-cache';
import { vnDateKeyNow } from '@/lib/fb/tz-dates';
import { BundleError } from './types';
import type { PlatformT, SocialAccount, SyncTypeT } from '@/lib/db-types';

const DEFAULT_IMPORT_COUNT = 16;
const LOW_CAPACITY_WARN_THRESHOLD = 50;

// Narrow PlatformT (DB enum, includes 'zalo') → PlatformKey (Bundle subset).
// Zalo is stored in DB but Bundle.social does not support it; callers reach
// here only when bundle_team_id is set, so 'zalo' should never appear at
// runtime — the throw is a safety net.
function requireBundlePlatform(p: PlatformT): PlatformMeta {
  if (p === 'zalo') {
    throw new BundleError('INVALID_REQUEST', `Bundle.social does not support platform: ${p}`);
  }
  return requirePlatform(p);
}

// ─── Shared types ────────────────────────────────────────────────────────────

export interface BundleSyncResult {
  status: 'success' | 'partial' | 'failed' | 'skipped';
  accountMetricUpserted: number;
  importQueued: string | null;
  capacityRemaining: number | null;
  errorMessage?: string;
}

interface RunOptions {
  count?: number;
  syncType?: SyncTypeT;
}

// ─── 1. Account-level sync (aggregate refresh) ───────────────────────────────

/**
 * Sync ONLY the account-level metrics (followers, total views, impressions).
 * Synchronous Bundle call (~2s) — safe to await inside an HTTP request.
 */
export async function runBundleAccountSync(
  account: SocialAccount
): Promise<{ upserted: number; errorMessage?: string }> {
  if (!account.bundle_team_id) {
    return { upserted: 0, errorMessage: 'no bundle_team_id' };
  }
  const platform = requireBundlePlatform(account.platform);

  try {
    const aggregate = await forceRefreshSocialAccount({
      teamId: account.bundle_team_id,
      platformType: platform.bundleType,
    });
    const metric = mapAccountAggregate(aggregate, account.platform);
    const todayVn = new Date(`${vnDateKeyNow()}T00:00:00.000Z`);
    await upsertBundleAccountMetric({ accountId: account.id, date: todayVn, metric });
    return { upserted: 1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[bundle-sync] ${account.id}: aggregate failed — ${msg}`);
    return { upserted: 0, errorMessage: msg };
  }
}

// ─── 2. Trigger async post import ────────────────────────────────────────────

/**
 * Trigger a post-history-import on Bundle. Saves the importId on
 * social_account.pending_bundle_import_id so the poller cron can finalize
 * later. Returns the importId without waiting — Bundle may take 2-15 min.
 *
 * Skips if there's already an import pending for this account (prevents
 * duplicate-trigger when user spams the button).
 */
export async function runBundleImportTrigger(
  account: SocialAccount,
  count: number = DEFAULT_IMPORT_COUNT
): Promise<{ importId: string | null; capacityRemaining: number | null; errorMessage?: string }> {
  if (!account.bundle_team_id || !account.bundle_social_account_id) {
    return { importId: null, capacityRemaining: null, errorMessage: 'missing bundle ids' };
  }
  if (account.pending_bundle_import_id) {
    return {
      importId: account.pending_bundle_import_id,
      capacityRemaining: null,
      errorMessage: 'import already pending — wait for poller',
    };
  }

  const platform = requireBundlePlatform(account.platform);
  let capacityRemaining: number | null = null;

  try {
    const cap = await checkBundleCapacity({
      teamId: account.bundle_team_id,
      bundleSocialAccountId: account.bundle_social_account_id,
    });
    if (cap) {
      capacityRemaining = cap.remaining;
      if (cap.remaining === 0) {
        return {
          importId: null, capacityRemaining: 0,
          errorMessage: `capacity exhausted ${cap.used}/${cap.limit}`,
        };
      }
      if (cap.remaining < LOW_CAPACITY_WARN_THRESHOLD) {
        console.warn(`[bundle-sync] ${account.id}: capacity low ${cap.remaining}`);
      }
    }

    const trigger = await triggerImport({
      teamId: account.bundle_team_id,
      socialAccountType: platform.bundleType,
      count,
      withAnalytics: true,
    });

    await db.query(
      `UPDATE social_account
          SET pending_bundle_import_id = $2,
              pending_bundle_import_at = NOW()
        WHERE id = $1`,
      [account.id, trigger.importId]
    );

    return { importId: trigger.importId, capacityRemaining };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[bundle-sync] ${account.id}: import trigger failed — ${msg}`);
    return { importId: null, capacityRemaining, errorMessage: msg };
  }
}

// ─── 3. Finalize a pending import (called by poller) ─────────────────────────

export type FinalizeOutcome =
  | { status: 'still_pending' }
  | { status: 'completed'; postsUpserted: number; postsImported: number }
  | { status: 'failed'; errorMessage: string };

/**
 * Check Bundle for the status of a queued import. If COMPLETED, fetch the
 * posts and upsert. If FAILED, clear the pending ticket so the user can
 * retry. If still PENDING/RUNNING, leave the row alone — caller retries next
 * tick.
 */
export async function runBundleImportFinalize(
  account: SocialAccount,
  importId: string
): Promise<FinalizeOutcome> {
  let status;
  try {
    status = await getImportStatus(importId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 404 = Bundle has no record of this import (rare; possibly purged after
    // very long delays). Clear the ticket so we don't loop forever.
    if (err instanceof BundleError && err.httpStatus === 404) {
      await clearPendingImport(account.id);
      return { status: 'failed', errorMessage: `import ${importId} not found on Bundle` };
    }
    return { status: 'failed', errorMessage: `getImportStatus error: ${msg}` };
  }

  if (status.status === 'PENDING' || status.status === 'RUNNING') {
    return { status: 'still_pending' };
  }

  // Terminal state — clear ticket regardless of success/failure so we don't
  // poll forever on a dead job.
  await clearPendingImport(account.id);

  if (status.status === 'FAILED') {
    return {
      status: 'failed',
      errorMessage: status.error ?? 'Bundle import failed without error message',
    };
  }

  if (status.status !== 'COMPLETED') {
    return {
      status: 'failed',
      errorMessage: `unexpected import status: ${status.status}`,
    };
  }

  // COMPLETED — fetch posts and upsert.
  const platform = requireBundlePlatform(account.platform);
  try {
    const page = await fetchImportedPosts({
      teamId: account.bundle_team_id!,
      socialAccountType: platform.bundleType,
      limit: DEFAULT_IMPORT_COUNT,
    });
    const postsUpserted = await persistPosts(account.id, page.posts);
    await db.query(
      `UPDATE social_account SET last_synced_at = NOW() WHERE id = $1`,
      [account.id]
    );
    return {
      status: 'completed',
      postsUpserted,
      postsImported: status.postsImported,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', errorMessage: `persist posts failed: ${msg}` };
  }
}

async function clearPendingImport(accountId: string): Promise<void> {
  await db.query(
    `UPDATE social_account
        SET pending_bundle_import_id = NULL,
            pending_bundle_import_at = NULL
      WHERE id = $1`,
    [accountId]
  );
}

// ─── Orchestrator (account sync + import trigger combined) ───────────────────

/**
 * Manual button / cron entry point: refresh aggregate inline (fast) AND
 * queue a fresh post-history import (async, finalized later by the poller).
 *
 * Returns quickly — never waits for the post import to complete.
 */
export async function runBundleSync(
  accountId: string,
  account: SocialAccount,
  options: RunOptions = {}
): Promise<BundleSyncResult> {
  const startedAt = new Date();
  const syncType: SyncTypeT = options.syncType ?? 'manual_refresh';
  const count = options.count ?? DEFAULT_IMPORT_COUNT;

  // 1. Aggregate refresh (sync, fast)
  const aggResult = await runBundleAccountSync(account);

  // 2. Trigger import (no wait)
  const triggerResult = await runBundleImportTrigger(account, count);

  // 3. Roll up + log
  const errors: string[] = [];
  if (aggResult.errorMessage) errors.push(`aggregate: ${aggResult.errorMessage}`);
  if (triggerResult.errorMessage) errors.push(`import-trigger: ${triggerResult.errorMessage}`);

  const overall: BundleSyncResult['status'] =
    aggResult.upserted > 0 && triggerResult.importId
      ? 'success'
      : aggResult.upserted > 0 || triggerResult.importId
        ? 'partial'
        : 'failed';

  const durationMs = Date.now() - startedAt.getTime();
  await logSync({
    syncType, accountId, startedAt,
    status: overall === 'failed' ? 'failed' : 'success',
    recordsUpserted: aggResult.upserted,
    errorMessage: errors.length > 0 ? errors.join(' | ') : undefined,
    details: [
      {
        endpoint: 'bundle:/account-sync + /import-trigger',
        params: {
          teamId: account.bundle_team_id ?? '',
          socialAccountType: requireBundlePlatform(account.platform).bundleType,
          count: String(count),
        },
        startedAt: startedAt.toISOString(),
        durationMs,
        httpStatus: overall === 'success' ? 200 : overall === 'partial' ? 207 : 500,
        ok: overall !== 'failed',
        error: errors.length > 0 ? errors.join(' | ') : undefined,
        responseSample: {
          accountMetricUpserted: aggResult.upserted,
          importQueued: triggerResult.importId,
          capacityRemaining: triggerResult.capacityRemaining,
          platform: account.platform,
          note: triggerResult.importId
            ? 'Posts will appear after the next poller run (every 5 min).'
            : undefined,
        },
      },
    ],
  });

  // Cache invalidation safe outside request context (cron/script).
  try {
    invalidateDashboard();
  } catch (cacheErr) {
    const msg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr);
    if (!/static generation store missing/.test(msg)) {
      console.warn(`[bundle-sync] ${accountId}: cache invalidate failed — ${msg}`);
    }
  }

  return {
    status: overall,
    accountMetricUpserted: aggResult.upserted,
    importQueued: triggerResult.importId,
    capacityRemaining: triggerResult.capacityRemaining,
    errorMessage: errors.length > 0 ? errors.join(' | ') : undefined,
  };
}

// ─── Internal: persist posts (shared by finalize) ────────────────────────────

async function persistPosts(
  accountId: string,
  posts: ImportedPost[]
): Promise<number> {
  if (posts.length === 0) return 0;
  const todayVn = new Date(`${vnDateKeyNow()}T00:00:00.000Z`);
  let upserted = 0;

  for (const p of posts) {
    if (!p.externalId) continue;
    try {
      const internalPostId = await upsertBundleSocialPost({
        account_id: accountId,
        external_id: p.externalId,
        bundle_imported_post_id: p.id,
        content: p.description ?? p.title ?? null,
        media_url: p.thumbnail ?? null,
        post_type: mapBundlePostType(p.type),
        published_at: new Date(p.publishedAt),
        permalink: p.permalink ?? null,
      });
      await upsertBundlePostMetric({
        postId: internalPostId,
        date: todayVn,
        metric: mapPostAnalytics(p),
      });
      upserted++;
    } catch (err) {
      console.warn(
        `[bundle-sync] post upsert failed account=${accountId} ext=${p.externalId}:`,
        err
      );
    }
  }
  return upserted;
}
