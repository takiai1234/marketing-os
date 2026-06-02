// GET  /api/skills/[id]/chat/sessions       — list user's sessions for skill
// POST /api/skills/[id]/chat/sessions       — create new session (no messages yet)
//
// Cả 2 require auth. Sessions filter by current user — không thấy của
// người khác.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { listSessions, createSession } from '@/lib/queries/skill-chat';
import { isValidModelId, AVAILABLE_MODELS } from '@/lib/anthropic/client';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 });
  }

  const sessions = await listSessions(id, user.userId);
  return NextResponse.json({ sessions });
}

const createSchema = z.object({
  model: z.string().refine(isValidModelId, {
    message: `model must be one of: ${AVAILABLE_MODELS.map((m) => m.id).join(', ')}`,
  }),
  title: z.string().min(1).max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const session = await createSession(
    id,
    user.userId,
    parsed.data.model,
    parsed.data.title
  );
  return NextResponse.json({ session }, { status: 201 });
}
