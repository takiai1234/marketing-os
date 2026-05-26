// Dev-only: verify total_reach value after the TikTok reach fix.
// Usage: npx tsx scripts/dev-verify-tiktok-reach.ts

import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const accountId = 'd6ff807f-c169-4978-bf58-bf0bb88f1914'; // Suhara Store
  const { rows } = await db.query(
    `SELECT to_char(date, 'YYYY-MM-DD') AS d,
            followers, total_reach, total_reach_unique, total_engagement,
            post_reactions_total, page_views
       FROM account_metric_daily
      WHERE account_id = $1
      ORDER BY date DESC
      LIMIT 5`,
    [accountId]
  );
  console.log(`Latest ${rows.length} metric rows for Suhara Store:`);
  console.table(rows);
  await db.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
