// DELETE /api/landing-pages/[id] — xoá landing page
// PATCH  /api/landing-pages/[id] — toggle is_active

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const { id } = await params;
  await db.query(`DELETE FROM landing_page WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { isActive?: boolean };
  if (typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive required' }, { status: 400 });
  }
  await db.query(
    `UPDATE landing_page SET is_active = $2, updated_at = NOW() WHERE id = $1`,
    [id, body.isActive]
  );
  return NextResponse.json({ ok: true });
}
