// Cron scheduler initializer — schedules all ingestion jobs once at server start.
// Singleton-guarded via globalThis.__cron_initialized to survive HMR reloads.
// Only called from instrumentation.ts after confirming nodejs runtime.

import cron from 'node-cron';
import { runPageInsightsJob } from '@/lib/cron/job-page-insights';
import { runPostsIngestionJob } from '@/lib/cron/job-posts-ingestion';
import { runHealthRecomputeJob } from '@/lib/cron/job-health-recompute';
import { runLadipageSyncJob } from '@/lib/cron/job-ladipage-sync';
import { runNewsIngestionJob } from '@/lib/cron/job-news-ingestion';
import { runBundleImportJob } from '@/lib/cron/job-bundle-import';
import { runBundleImportPollerJob } from '@/lib/cron/job-bundle-import-poller';
import { runBundleConnectPollerJob } from '@/lib/cron/job-bundle-connect-poller';
import { runAdsIngestionJob } from '@/lib/cron/job-ads-ingestion';
import { runMessageSyncJob } from '@/lib/cron/job-message-sync';

declare global {
  // eslint-disable-next-line no-var
  var __cron_initialized: boolean | undefined;
}

/**
 * Schedule all cron jobs. Safe to call multiple times — subsequent calls are
 * no-ops thanks to the globalThis singleton guard.
 *
 * Schedules:
 *   Job A — page_insights:    0 2 * * *         UTC      (daily 02:00 = 09:00 VN)
 *   Job B — posts_ingestion:  30 2,10,18 * * *  UTC      (3× daily — 09:30, 17:30, 01:30 VN)
 *   Job C — health_recompute: 0 3 * * *         UTC      (daily 03:00)
 *   Job D — ladipage_sync:    30 23 * * *       VN time  (daily 23:30 Asia/Ho_Chi_Minh)
 */
export function initCrons(): void {
  if (globalThis.__cron_initialized) {
    console.log('[cron] Already initialized — skipping duplicate init');
    return;
  }

  // Job A: page insights — 1× daily at 02:00 UTC (09:00 VN)
  cron.schedule('0 2 * * *', () => {
    runPageInsightsJob().catch((err) =>
      console.error('[cron] job-page-insights uncaught error:', err)
    );
  });

  // Job B: posts ingestion — 3× daily, offset 30min sau page_insights để
  // tránh đụng FB API quota cùng lúc. Chạy 02:30, 10:30, 18:30 UTC.
  cron.schedule('30 2,10,18 * * *', () => {
    runPostsIngestionJob().catch((err) =>
      console.error('[cron] job-posts-ingestion uncaught error:', err)
    );
  });

  // Job C: health recompute — daily at 03:00
  cron.schedule('0 3 * * *', () => {
    runHealthRecomputeJob().catch((err) =>
      console.error('[cron] job-health-recompute uncaught error:', err)
    );
  });

  // Job D: Ladipage conversion sync — daily at 23:30 VN.
  // Container runs UTC, so we pin schedule to Asia/Ho_Chi_Minh explicitly
  // instead of converting to 16:30 UTC (more readable, same result).
  cron.schedule(
    '30 23 * * *',
    () => {
      runLadipageSyncJob().catch((err) =>
        console.error('[cron] job-ladipage-sync uncaught error:', err)
      );
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  // Job E: News ingestion — mỗi giờ, phút 15 (lệch khỏi phút 0/30 của
  // job khác để tránh đụng DB + CPU spike cùng lúc).
  cron.schedule('15 * * * *', () => {
    runNewsIngestionJob().catch((err) =>
      console.error('[cron] job-news-ingestion uncaught error:', err)
    );
  });

  // Job F: Bundle.social import — 1× daily lúc 00:00 VN.
  // Trigger aggregate + queue import cho mỗi non-FB channel. Cron không đợi
  // import xong — Job G (poller) sẽ finalize sau.
  cron.schedule(
    '0 0 * * *',
    () => {
      runBundleImportJob().catch((err) =>
        console.error('[cron] job-bundle-import uncaught error:', err)
      );
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  // Job G: Bundle import poller — every 5 minutes.
  // Bundle imports take 2-15 phút async. Poller scans pending tickets,
  // finalizes COMPLETED ones (fetch posts + upsert), clears stuck rows.
  cron.schedule('*/5 * * * *', () => {
    runBundleImportPollerJob().catch((err) =>
      console.error('[cron] job-bundle-import-poller uncaught error:', err)
    );
  });

  // Job I: FB Ads insights — daily 04:30 VN (= 21:30 UTC previous day).
  // Pull last 30 days insights cho mọi ad_account active. Cron run after
  // FB stabilizes day-ago data (~3-4h sau UTC midnight).
  cron.schedule(
    '30 4 * * *',
    () => {
      runAdsIngestionJob().catch((err) =>
        console.error('[cron] job-ads-ingestion uncaught error:', err)
      );
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  // Job H: Bundle CONNECT poller — every 2 minutes.
  // Cross-device safety net. After "Tạo link" the user may complete OAuth
  // on a different device; the redirect lands there, not on our app. The
  // poller asks Bundle directly "team T có account platform X chưa?" and
  // finalizes when it appears, regardless of where OAuth happened.
  cron.schedule('*/2 * * * *', () => {
    runBundleConnectPollerJob().catch((err) =>
      console.error('[cron] job-bundle-connect-poller uncaught error:', err)
    );
  });

  // Job J: Page messaging (inbox) ingestion — every 2 hours (UTC).
  // Pull recent Messenger conversations per FB page → daily inbox metrics
  // (new conversations, response rate, response time, unanswered snapshot).
  // Intraday cadence keeps the "unanswered" snapshot fresh for the CEO view.
  cron.schedule('0 */2 * * *', () => {
    runMessageSyncJob().catch((err) =>
      console.error('[cron] job-message-sync uncaught error:', err)
    );
  });

  globalThis.__cron_initialized = true;

  const now = new Date();
  console.log(
    `[cron] 10 jobs scheduled at ${now.toISOString()} ` +
      `(container TZ offset=${-now.getTimezoneOffset() / 60}h, ` +
      `process.env.TZ=${process.env.TZ ?? 'unset'})`
  );

  // Surface missing per-job config so silent runtime failures don't waste
  // a scheduled run. The cron schedule itself fires, but the job's first
  // line throws and the user sees only "failed" without knowing why.
  const missing: string[] = [];
  if (!process.env.LADIPAGE_WEBHOOK_URL) missing.push('LADIPAGE_WEBHOOK_URL');
  if (!process.env.LADIPAGE_API_KEY)     missing.push('LADIPAGE_API_KEY');
  if (missing.length > 0) {
    console.warn(
      `[cron] WARNING: ladipage_sync will fail — missing env vars: ${missing.join(', ')}`
    );
  }
  console.log('[cron] schedules:');
  console.log('  - page_insights:    0 2 * * *         (UTC)');
  console.log('  - posts_ingestion:  30 2,10,18 * * *  (UTC)');
  console.log('  - health_recompute: 0 3 * * *         (UTC)');
  console.log('  - ladipage_sync:    30 23 * * *       (Asia/Ho_Chi_Minh)');
  console.log('  - news_ingestion:   15 * * * *        (UTC, hourly)');
  console.log('  - bundle_import:    0 0 * * *         (Asia/Ho_Chi_Minh, midnight VN)');
  console.log('  - bundle_poller:    */5 * * * *       (UTC, every 5 min)');
  console.log('  - connect_poller:   */2 * * * *       (UTC, every 2 min)');
  console.log('  - ads_ingestion:    30 4 * * *         (Asia/Ho_Chi_Minh, daily 04:30 VN)');
  console.log('  - message_sync:     0 */2 * * *        (UTC, every 2h)');

  // Boot-time heartbeat: log every 60s for the first 5 minutes so an
  // operator looking at `docker logs` after deploy can confirm the Node
  // event loop is alive (and by extension, node-cron's internal interval
  // is still scheduled to fire). Without this, "no log = silently dead"
  // vs "no log = no scheduled time has passed yet" are indistinguishable.
  let beats = 0;
  const heartbeat = setInterval(() => {
    beats++;
    console.log(
      `[cron] heartbeat ${beats}/5 at ${new Date().toISOString()} — scheduler alive`
    );
    if (beats >= 5) clearInterval(heartbeat);
  }, 60 * 1000);
}
