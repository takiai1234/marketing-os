// Dev-only: probe Bundle's account-level aggregate for TikTok to see what
// fields actually come back (impressions vs views vs likes etc).
//
// Usage: npx tsx scripts/dev-probe-tiktok-aggregate.ts [accountId]
// If no accountId given, lists all TikTok accounts + probes each one + sample posts.

import 'dotenv/config';
import { db } from '../src/lib/db';
import {
  forceRefreshSocialAccount,
  fetchImportedPosts,
} from '../src/lib/bundle/import-runner';

interface TikTokAccount {
  id: string;
  platform: string;
  name: string;
  external_id: string;
  bundle_team_id: string | null;
  bundle_social_account_id: string | null;
}

async function probeAccount(acc: TikTokAccount) {
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`Account: ${acc.name} (${acc.id})`);
  console.log(`  external_id: ${acc.external_id}`);
  console.log(`  bundle_team_id: ${acc.bundle_team_id}`);

  if (!acc.bundle_team_id) {
    console.log('  → Skipped: no bundle_team_id');
    return;
  }

  try {
    const agg = await forceRefreshSocialAccount({
      teamId: acc.bundle_team_id,
      platformType: 'TIKTOK',
    });
    console.log('\n  ─ Account-level aggregate ─');
    const keys = [
      'impressions', 'impressionsUnique', 'views', 'viewsUnique',
      'likes', 'comments', 'postCount', 'followers', 'following',
    ] as const;
    for (const k of keys) {
      const v = (agg as unknown as Record<string, unknown>)[k];
      console.log(`    ${k.padEnd(20)} = ${v}`);
    }
  } catch (err) {
    console.log(`  → Aggregate call failed: ${(err as Error).message}`);
  }

  try {
    const page = await fetchImportedPosts({
      teamId: acc.bundle_team_id,
      socialAccountType: 'TIKTOK',
      limit: 3,
    });
    const posts = page.posts ?? [];
    console.log(`\n  ─ Posts found: ${posts.length} (showing up to 3) ─`);
    for (const p of posts) {
      const a = p.analytics?.[0];
      console.log(`    post ${p.externalId ?? p.id}: type=${p.type}`);
      if (a) {
        console.log(
          `      impressions=${a.impressions} impressionsUnique=${a.impressionsUnique} ` +
          `views=${a.views} likes=${a.likes} comments=${a.comments} shares=${a.shares}`
        );
      } else {
        console.log('      (no analytics rows)');
      }
    }
  } catch (err) {
    console.log(`  → Posts call failed: ${(err as Error).message}`);
  }
}

async function main() {
  const argId = process.argv[2];
  const query = argId
    ? `SELECT id, platform, name, external_id, bundle_team_id, bundle_social_account_id
         FROM social_account WHERE id = $1 LIMIT 1`
    : `SELECT id, platform, name, external_id, bundle_team_id, bundle_social_account_id
         FROM social_account WHERE platform = 'tiktok' ORDER BY connected_at DESC NULLS LAST`;

  const { rows } = await db.query<TikTokAccount>(query, argId ? [argId] : []);
  if (rows.length === 0) {
    console.error('No TikTok accounts found.');
    process.exit(1);
  }

  console.log(`Found ${rows.length} TikTok account(s)\n`);
  for (const acc of rows) {
    await probeAccount(acc);
  }

  await db.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
