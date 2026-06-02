// PUT    /api/settings/integrations/kieai — set kie.ai API key
// DELETE /api/settings/integrations/kieai — remove key

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import { KIE_AI_KEY_NAME, invalidateKieKeyCache } from '@/lib/llm/kie-ai';

export const runtime = 'nodejs';

const bodySchema = z.object({
  // kie.ai key format: hex/alphanumeric, không có prefix cụ thể.
  // Cap min 20 / max 500 để chống typo.
  apiKey: z.string().trim().min(20, 'Key quá ngắn').max(500, 'Key quá dài'),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await setSetting(
    KIE_AI_KEY_NAME,
    parsed.data.apiKey,
    user.userId,
    'kie.ai API key — image + video generation (Midjourney/Flux/Veo/Sora)'
  );

  invalidateKieKeyCache();

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const removed = await deleteSetting(KIE_AI_KEY_NAME);
  invalidateKieKeyCache();

  return NextResponse.json({ ok: true, removed });
}
