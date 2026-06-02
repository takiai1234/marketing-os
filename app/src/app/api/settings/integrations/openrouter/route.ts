// PUT    /api/settings/integrations/openrouter — set/update key
// DELETE /api/settings/integrations/openrouter — remove key (fall back env)
//
// Admin-only. Encrypted save via pgcrypto.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import {
  OPENROUTER_KEY_NAME,
  invalidateOpenRouterKeyCache,
} from '@/lib/llm/openrouter';

export const runtime = 'nodejs';

// OpenRouter key format: sk-or-v1-... (64 char hex sau prefix)
const bodySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, 'API key quá ngắn — kiểm tra lại')
    .max(500, 'API key quá dài — kiểm tra lại')
    .regex(
      /^sk-or-/,
      'API key phải bắt đầu "sk-or-" (OpenRouter). Bạn có paste nhầm key khác?'
    ),
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
    OPENROUTER_KEY_NAME,
    parsed.data.apiKey,
    user.userId,
    'OpenRouter API key — unified gateway cho Claude/GPT/Gemini/Grok'
  );

  invalidateOpenRouterKeyCache();

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const removed = await deleteSetting(OPENROUTER_KEY_NAME);
  invalidateOpenRouterKeyCache();

  return NextResponse.json({ ok: true, removed });
}
