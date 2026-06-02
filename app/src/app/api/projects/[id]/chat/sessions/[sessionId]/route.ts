// DELETE /api/projects/[id]/chat/sessions/[sessionId]
// PATCH  /api/projects/[id]/chat/sessions/[sessionId] — rename title

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  deleteProjectSession,
  updateProjectSessionTitle,
} from '@/lib/queries/projects';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string; sessionId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const ok = await deleteProjectSession(sessionId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) {
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

  const ok = await updateProjectSessionTitle(sessionId, user.userId, parsed.data.title);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
