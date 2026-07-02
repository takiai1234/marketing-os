// GET /api/ads/debug-actions — xem action_types thực tế FB trả về cho Sales campaigns
// Dùng để debug conversion = 0 cho objective Sales
// XÓA sau khi debug xong

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Lấy các action_type duy nhất từ Sales campaigns
  const res = await db.query<{
    campaign_name: string;
    objective: string;
    date: string;
    conversions: string;
    action_types: string[];
  }>(`
    SELECT
      c.name AS campaign_name,
      c.objective,
      m.date::text,
      m.conversions::text,
      ARRAY(
        SELECT jsonb_array_elements(m.extra_metrics->'actions')->>'action_type'
      ) AS action_types
    FROM ad_metric_daily m
    JOIN ad_campaign c ON c.id = m.campaign_id
    WHERE c.objective = 'sales'
      AND m.campaign_id IS NOT NULL
      AND m.extra_metrics->'actions' IS NOT NULL
      AND jsonb_array_length(m.extra_metrics->'actions') > 0
    ORDER BY m.date DESC
    LIMIT 10
  `);

  // Tổng hợp distinct action types
  const allTypes = new Set<string>();
  for (const r of res.rows) {
    for (const t of r.action_types ?? []) allTypes.add(t);
  }

  return NextResponse.json({
    rows: res.rows,
    distinctActionTypes: [...allTypes].sort(),
  });
}
