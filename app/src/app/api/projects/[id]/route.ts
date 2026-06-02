// GET    /api/projects/[id] — get project + files
// PATCH  /api/projects/[id] — update name/instructions/icon/colorHex
// DELETE /api/projects/[id] — delete project + cascade files + chats

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getProjectForUser,
  updateProject,
  deleteProject,
  listFilesForProject,
} from '@/lib/queries/projects';
import { deleteProjectDir } from '@/lib/projects/storage';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const project = await getProjectForUser(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const files = await listFilesForProject(id);
  return NextResponse.json({ project, files });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(50_000).optional(),
  icon: z.string().max(8).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/, 'hex 6 ký tự không #')
    .nullable()
    .optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const ok = await updateProject(id, user.userId, parsed.data);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const project = await getProjectForUser(id, user.userId);
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const ok = await deleteProject(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Clean disk — DB cascade lo files row, ta lo folder
  try {
    await deleteProjectDir(id);
  } catch {
    // Không crash request nếu disk delete fail — DB đã clean
  }
  return NextResponse.json({ ok: true });
}
