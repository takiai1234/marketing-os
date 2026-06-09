// GET  /api/channel-tags — list all tags (any auth user — dashboard tabs cần)
// POST /api/channel-tags — create new tag (admin only)
//
// POST body:
//   { name: string, slug?: string, sortOrder?: number }
//
// Slug auto-generate từ name nếu không cung cấp. Slug đã tồn tại → 409.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { listAllTags, createTag } from '@/lib/queries/channel-tags';
import { invalidateDashboard } from '@/lib/cache/dashboard-cache';

export const runtime = 'nodejs';

const postBodySchema = z.object({
  name: z.string().trim().min(1, 'Tên không được trống').max(50, 'Tối đa 50 ký tự'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ a-z 0-9 -')
    .max(60, 'Slug tối đa 60 ký tự')
    .optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tags = await listAllTags();
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const tag = await createTag(parsed.data.name, parsed.data.slug, parsed.data.sortOrder);
  if (!tag) {
    return NextResponse.json(
      { error: 'Slug đã tồn tại — chọn tên/slug khác.' },
      { status: 409 }
    );
  }

  // Tag mới chưa ảnh hưởng KPI nhưng tab list dashboard dùng cùng cache key
  // (listAllTags không cache — gọi trực tiếp), không cần invalidate.
  invalidateDashboard();

  return NextResponse.json({ ok: true, tag }, { status: 201 });
}
