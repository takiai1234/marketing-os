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
  return NextResponse.json(rows);
}
