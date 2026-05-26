// Dev-only: run the cross-device connect poller once without waiting for
// the 2-minute cron schedule.

import 'dotenv/config';
import { runBundleConnectPollerJob } from '../src/lib/cron/job-bundle-connect-poller';
import { db } from '../src/lib/db';

(async () => {
  const report = await runBundleConnectPollerJob();
  console.log('[dev] Connect poller report:', JSON.stringify(report, null, 2));
  await db.end();
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
