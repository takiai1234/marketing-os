// DELETE /api/landing-pages/[id] — xoá landing page
// PATCH  /api/landing-pages/[id] — cập nhật is_active, name, sheetId, sheetName

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

interface Ctx { params: Promise<{ id: string }> }

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
  sheetId: z.string().trim().max(200).nullable().optional(),
  sheetName: z.string().trim().max(200).nullable().optional(),
  sheetSourceFilter: z.string().trim().max(200).nullable().optional(),
  sheetSourceColumn: z.string().trim().max(5).nullable().optional(),
});

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

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });

  const data = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [id];

  if (typeof data.isActive === 'boolean') { sets.push(`is_active = $${vals.length + 1}`); vals.push(data.isActive); }
  if (data.name !== undefined) { sets.push(`name = $${vals.length + 1}`); vals.push(data.name); }
  if ('sheetId' in data) { sets.push(`sheet_id = $${vals.length + 1}`); vals.push(data.sheetId ?? null); }
  if ('sheetName' in data) { sets.push(`sheet_name = $${vals.length + 1}`); vals.push(data.sheetName ?? null); }
  if ('sheetSourceFilter' in data) { sets.push(`sheet_source_filter = $${vals.length + 1}`); vals.push(data.sheetSourceFilter ?? null); }
  if ('sheetSourceColumn' in data) { sets.push(`sheet_source_column = $${vals.length + 1}`); vals.push(data.sheetSourceColumn ?? null); }

  if (sets.length === 0) return NextResponse.json({ error: 'Không có gì để cập nhật' }, { status: 400 });

  sets.push(`updated_at = NOW()`);
  await db.query(`UPDATE landing_page SET ${sets.join(', ')} WHERE id = $1`, vals);
  return NextResponse.json({ ok: true });
}
