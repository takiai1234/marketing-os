// Dev-only: trigger runBundleSync directly without the HTTP layer / auth.
// Usage:  npx tsx scripts/dev-trigger-bundle-sync.ts <accountId>
// Loads .env, looks up the social_account row, runs the sync, prints result.

import 'dotenv/config';
import { db } from '../src/lib/db';
import { runBundleSync } from '../src/lib/bundle/sync';
import type { SocialAccount } from '../src/lib/db-types';

async function main() {
  const accountId = process.argv[2];
  if (!accountId) {
    console.error('Usage: tsx scripts/dev-trigger-bundle-sync.ts <accountId>');
    process.exit(1);
  }

  const { rows } = await db.query<SocialAccount>(
    `SELECT id, platform, external_id, name, persona_json,
            access_token_encrypted, connected_at, last_synced_at, status, owner_member_id,
            bundle_team_id, bundle_social_account_id, bundle_username, bundle_avatar_url
       FROM social_account WHERE id = $1 LIMIT 1`,
    [accountId]
  );
  const account = rows[0];
  if (!account) {
    console.error(`Account not found: ${accountId}`);
    process.exit(1);
  }
  if (!account.bundle_team_id) {
    console.error(`Account ${accountId} is not a Bundle channel`);
    process.exit(1);
  }

  console.log(`[dev] Running Bundle sync for ${account.platform} channel "${account.name}"...`);
  const result = await runBundleSync(accountId, account, { syncType: 'manual_refresh' });
  console.log('[dev] Result:', JSON.stringify(result, null, 2));
  await db.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
