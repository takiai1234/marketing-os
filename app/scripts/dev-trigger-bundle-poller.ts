// Dev-only: trigger the Bundle import poller once without waiting for the
// 5-minute cron schedule. Useful when verifying split-sync end-to-end.

import 'dotenv/config';
import { runBundleImportPollerJob } from '../src/lib/cron/job-bundle-import-poller';
import { db } from '../src/lib/db';

(async () => {
  const report = await runBundleImportPollerJob();
  console.log('[dev] Poller report:', JSON.stringify(report, null, 2));
  await db.end();
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
