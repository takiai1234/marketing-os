// GET /api/admin/tiktok-debug — diagnostic endpoint (xóa sau khi debug xong)
// Bearer CRON_TRIGGER_TOKEN auth

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function hasValidCronToken(req: NextRequest): boolean {
  const expected = process.env.CRON_TRIGGER_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  const provided = header.slice(7);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasValidCronToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await db.query<{
    id: string;
    name: string;
    status: string;
    bundle_team_id: string | null;
    bundle_social_account_id: string | null;
    last_synced_at: string | null;
    pending_bundle_import_id: string | null;
    metric_rows: string;
    latest_date: string | null;
    followers: string | null;
    total_reach: string | null;
    raw_metrics: unknown;
  }>(
    `SELECT
       sa.id, sa.name, sa.status,
       sa.bundle_team_id, sa.bundle_social_account_id,
       sa.last_synced_at::text, sa.pending_bundle_import_id,
       COUNT(amd.id)::text          AS metric_rows,
       MAX(amd.date)::text          AS latest_date,
       MAX(amd.followers)::text     AS followers,
       MAX(amd.total_reach)::text   AS total_reach,
       (SELECT amd2.raw_metrics FROM account_metric_daily amd2
        WHERE amd2.account_id = sa.id ORDER BY amd2.date DESC LIMIT 1) AS raw_metrics
     FROM social_account sa
     LEFT JOIN account_metric_daily amd ON amd.account_id = sa.id
     WHERE sa.platform = 'tiktok'
     GROUP BY sa.id, sa.name, sa.status,
              sa.bundle_team_id, sa.bundle_social_account_id,
              sa.last_synced_at, sa.pending_bundle_import_id
     ORDER BY sa.name`
  );

  return NextResponse.json({ accounts: res.rows });
}
