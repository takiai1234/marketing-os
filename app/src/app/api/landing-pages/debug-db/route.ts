import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { rows } = await db.query(
    `SELECT id, name, page_path, ga4_property_id, sheet_id, sheet_name, sheet_source_filter, sheet_source_column, is_active FROM landing_page ORDER BY name`
  );

  // Leads per day (30d) cho từng landing page
  const { rows: leadRows } = await db.query(
    `SELECT lp.name, lld.date, lld.leads
       FROM landing_page_leads_daily lld
       JOIN landing_page lp ON lp.id = lld.landing_page_id
      WHERE lld.date >= CURRENT_DATE - 29
      ORDER BY lp.name, lld.date DESC`
  );

  return NextResponse.json({ pages: rows, leadsPerDay: leadRows });
}
