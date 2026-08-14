// PUT    /api/team-members/[id] — admin-only, sửa name/email/role.
// DELETE /api/team-members/[id] — admin-only, with self-delete guard.
//
// Why guard self-delete: if the only admin removes their own row, nobody can
// log in to add a new admin. seed-admin.cjs would re-spawn admin@taki.vn on
// next container boot, but that's a recovery path — better refuse upfront.
//
// PUT cũng chặn admin TỰ HẠ QUYỀN chính mình (role → member) vì cùng lý do
// lock-out: admin cuối tự hạ quyền thì không ai vào quản trị được nữa.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { USER_ROLES } from '@/lib/auth/roles';
import { invalidateRoleCache } from '@/lib/auth/role-cache';

export const runtime = 'nodejs';

const PG_UNIQUE_VIOLATION = '23505';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
  role: z.enum(USER_ROLES),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, name, role: newRole } = parsed.data;

  // Self-demote guard — admin hạ quyền chính mình sẽ tự khoá quyền quản trị.
  if (id === user.userId && newRole !== 'admin') {
    return NextResponse.json(
      { error: 'Không thể tự hạ quyền admin của chính bạn.' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query<{ id: string }>(
      `UPDATE team_member
          SET name = $2, email = LOWER($3), role = $4
        WHERE id = $1
        RETURNING id`,
      [id, name, email, newRole]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    // Proxy cache role 15s — xoá ngay để đổi quyền có hiệu lực tức thì.
    invalidateRoleCache(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === PG_UNIQUE_VIOLATION
    ) {
      return NextResponse.json(
        { error: 'Email đã tồn tại trong hệ thống.' },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[PUT /api/team-members/:id]', message);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await context.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Self-delete guard — admin removing themselves locks everyone out
  if (id === user.userId) {
    return NextResponse.json(
      { error: 'Không thể tự xoá tài khoản của bạn' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query<{ email: string }>(
      `DELETE FROM team_member WHERE id = $1 RETURNING email`,
      [id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, email: result.rows[0]?.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[DELETE /api/team-members/:id]', message);
    return NextResponse.json({ error: 'Failed to delete member' }, { status: 500 });
  }
}
