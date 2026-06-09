// PATCH /api/channel-tags/[id]  — rename / reorder (admin only)
// DELETE /api/channel-tags/[id]  — delete + cascade unassign (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { updateTag, deleteTag } from '@/lib/queries/channel-tags';
import { invalidateDashboard } from '@/lib/cache/dashboard-cache';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function requireAdmin(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  await updateTag(id, parsed.data);
  invalidateDashboard();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });
  }

  await deleteTag(id);
  // Cascade đã bóc mọi mapping → dashboard view có thể bị mất tab. Invalidate
  // để mọi tab cũ bị unmount/refresh.
  invalidateDashboard();
  return NextResponse.json({ ok: true });
}
