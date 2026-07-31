// GET /api/admin/tiktok-debug — diagnostic (xóa sau khi debug xong)
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

  try {
    const res = await db.query<{
      name: string;
      status: string;
      bundle_team_id: string | null;
      bundle_social_account_id: string | null;
      last_synced_at: string | null;
      metric_rows: string;
      latest_date: string | null;
      latest_followers: string | null;
      latest_reach: string | null;
    }>(
      `SELECT
         sa.name, sa.status,
         sa.bundle_team_id,
         sa.bundle_social_account_id,
         sa.last_synced_at::text,
         COUNT(amd.id)::text              AS metric_rows,
         MAX(amd.date)::text              AS latest_date,
         (SELECT amd2.followers::text FROM account_metric_daily amd2
          WHERE amd2.account_id = sa.id ORDER BY amd2.date DESC LIMIT 1) AS latest_followers,
         (SELECT amd3.total_reach::text FROM account_metric_daily amd3
          WHERE amd3.account_id = sa.id ORDER BY amd3.date DESC LIMIT 1) AS latest_reach
       FROM social_account sa
       LEFT JOIN account_metric_daily amd ON amd.account_id = sa.id
       WHERE sa.platform = 'tiktok'
       GROUP BY sa.id, sa.name, sa.status,
                sa.bundle_team_id, sa.bundle_social_account_id, sa.last_synced_at
       ORDER BY sa.name`
    );

    return NextResponse.json({ accounts: res.rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
