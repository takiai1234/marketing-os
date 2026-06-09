// GET  /api/channels/[id]/tags — list tag đang gán cho 1 kênh (any auth user)
// PUT  /api/channels/[id]/tags — replace full tag set (admin only)
//
// PUT body shape:
//   { tagIds: ['<uuid>', '<uuid>', ...] }
//
// Empty array OK = bỏ tất cả tag (kênh chỉ còn hiện ở tab "Tổng").

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getTagsForAccount, setTagsForAccount } from '@/lib/queries/channel-tags';
import { invalidateDashboard } from '@/lib/cache/dashboard-cache';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const putBodySchema = z.object({
  tagIds: z
    .array(z.string().regex(UUID_RE, 'Invalid tag UUID'))
    .max(20, 'Tối đa 20 tag / kênh'),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
  }

  const tags = await getTagsForAccount(id);
  return NextResponse.json({ tags });
}

export async function PUT(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only — gán tag là quyết định phân nhóm tổ chức.
  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Dedup phòng hờ — composite PK sẽ throw nhưng catch sớm để 400 friendly.
  const uniqueIds = Array.from(new Set(parsed.data.tagIds));

  try {
    await setTagsForAccount(id, uniqueIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Tag thay đổi → dashboard cache bị stale (KPI/trend group theo tag).
  invalidateDashboard();

  const tags = await getTagsForAccount(id);
  return NextResponse.json({ ok: true, tags });
}
