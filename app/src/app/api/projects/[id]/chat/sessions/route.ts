// GET  /api/projects/[id]/chat/sessions — list user's sessions for project
// POST /api/projects/[id]/chat/sessions — create new session (no messages yet)

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  listProjectSessions,
  createProjectSession,
  getProjectForUser,
} from '@/lib/queries/projects';
import { isValidModelId, AVAILABLE_MODELS } from '@/lib/llm/openrouter';

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
  // Verify project ownership trước khi list session
  const project = await getProjectForUser(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sessions = await listProjectSessions(id, user.userId);
  return NextResponse.json({ sessions });
}

const createSchema = z.object({
  model: z.string().refine(isValidModelId, {
    message: `model must be one of: ${AVAILABLE_MODELS.map((m) => m.id).join(', ')}`,
  }),
  title: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const project = await getProjectForUser(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  const session = await createProjectSession(
    id,
    user.userId,
    parsed.data.model,
    parsed.data.title
  );
  return NextResponse.json({ session }, { status: 201 });
}
