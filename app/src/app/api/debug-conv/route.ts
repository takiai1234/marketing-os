import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get('s');
  if (secret !== 'taki-debug-2026') return NextResponse.json({ error: 'no' }, { status: 403 });

  const accountId = new URL(req.url).searchParams.get('account') ?? 'act_1235460691260099';

  const [camps, raw] = await Promise.all([
    db.query(`
      SELECT c.name, c.objective, c.external_id,
        SUM(m.conversions) AS total_conv,
        ROUND(SUM(m.spend_micros)/1000000) AS spend_vnd,
        COUNT(DISTINCT m.date) AS days
      FROM ad_campaigns c
      JOIN ad_metrics m ON m.campaign_id = c.id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.external_id = $1
        AND m.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY c.id, c.name, c.objective, c.external_id
      ORDER BY spend_vnd DESC
    `, [accountId]),
    db.query(`
      SELECT c.name, m.date, m.conversions,
        ROUND(m.spend_micros/1000000) AS spend_vnd,
        m.extra_metrics->'actions' AS actions
      FROM ad_metrics m
      JOIN ad_campaigns c ON c.id = m.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.external_id = $1
        AND m.date >= CURRENT_DATE - INTERVAL '7 days'
        AND m.spend_micros > 0
      ORDER BY m.date DESC, spend_vnd DESC
      LIMIT 30
    `, [accountId]),
  ]);

  return NextResponse.json({ campaigns: camps.rows, rawActions: raw.rows });
}
