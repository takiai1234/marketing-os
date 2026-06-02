// GET  /api/projects  — list user's projects
// POST /api/projects  — create new project (no files yet)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { listProjectsForUser, createProject } from '@/lib/queries/projects';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await listProjectsForUser(user.userId);
  return NextResponse.json({ projects });
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Tên rỗng').max(200, 'Tên quá dài'),
  instructions: z.string().max(50_000).optional(),
  icon: z.string().max(8).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/, 'colorHex phải là hex 6 ký tự, không có #')
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const project = await createProject({
    ownerId: user.userId,
    name: parsed.data.name,
    instructions: parsed.data.instructions ?? '',
    icon: parsed.data.icon ?? null,
    colorHex: parsed.data.colorHex ?? null,
  });
  return NextResponse.json({ project }, { status: 201 });
}
