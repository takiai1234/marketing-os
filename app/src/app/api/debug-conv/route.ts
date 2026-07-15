import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getResultCount } from '@/lib/fb/ads-api-client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get('s');
  if (secret !== 'taki-debug-2026') return NextResponse.json({ error: 'no' }, { status: 403 });

  const accountId = new URL(req.url).searchParams.get('account') ?? 'act_1235460691260099';

  const [camps, raw] = await Promise.all([
    db.query(`
      SELECT c.name, c.objective,
        SUM(m.conversions) AS total_conv,
        ROUND(SUM(m.spend_micros)/1000000) AS spend_vnd,
        COUNT(DISTINCT m.date) AS days
      FROM ad_campaign c
      JOIN ad_metric_daily m ON m.campaign_id = c.id
      JOIN ad_account a ON a.id = c.ad_account_id
      WHERE a.external_id = $1
        AND m.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY c.id, c.name, c.objective
      ORDER BY spend_vnd DESC
    `, [accountId]),
    db.query(`
      SELECT c.name, c.objective, m.date, m.conversions,
        ROUND(m.spend_micros/1000000) AS spend_vnd,
        m.extra_metrics->'actions' AS actions
      FROM ad_metric_daily m
      JOIN ad_campaign c ON c.id = m.campaign_id
      JOIN ad_account a ON a.id = c.ad_account_id
      WHERE a.external_id = $1
        AND m.date >= CURRENT_DATE - INTERVAL '7 days'
        AND m.spend_micros > 0
      ORDER BY m.date DESC, spend_vnd DESC
      LIMIT 30
    `, [accountId]),
  ]);

  // Recalculate conversion từ raw actions với logic mới
  const recalculated = raw.rows.map((r: Record<string, unknown>) => {
    const actions = r.actions as { value: string; action_type: string }[] | null;
    const newConv = getResultCount(actions ?? undefined, r.objective as string);
    return {
      name: r.name,
      date: r.date,
      spend_vnd: r.spend_vnd,
      old_conv: r.conversions,
      new_conv: newConv,
      diff: newConv - Number(r.conversions),
    };
  });

  return NextResponse.json({ campaigns: camps.rows, recalculated });
}
