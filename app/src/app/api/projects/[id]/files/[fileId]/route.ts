// DELETE /api/projects/[id]/files/[fileId] — xoá 1 file khỏi project

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getProjectForUser, deleteFile } from '@/lib/queries/projects';
import { deleteProjectFile } from '@/lib/projects/storage';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string; fileId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, fileId } = await params;
  if (!UUID_RE.test(projectId) || !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Verify project ownership
  const project = await getProjectForUser(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await deleteFile(fileId, projectId);
  if (!result.deleted) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  if (result.storagePath) {
    try {
      await deleteProjectFile(result.storagePath);
    } catch {
      // Best-effort — không crash request nếu disk delete fail
    }
  }
  return NextResponse.json({ ok: true });
}
