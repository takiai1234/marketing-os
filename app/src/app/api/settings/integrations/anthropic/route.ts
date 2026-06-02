// PUT    /api/settings/integrations/anthropic — set/update key
// DELETE /api/settings/integrations/anthropic — remove key (fall back to env)
//
// Admin-only. Save encrypted via pgcrypto. Invalidate Anthropic client
// cache để next request dùng key mới ngay.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import {
  ANTHROPIC_KEY_NAME,
  invalidateAnthropicKeyCache,
} from '@/lib/anthropic/client';

export const runtime = 'nodejs';

// Anthropic key format: bắt đầu sk-ant-api03-... + 95 char hex/alpha
// Validate sớm để báo lỗi rõ ràng nếu user paste nhầm (vd User Token FB).
const bodySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(50, 'API key quá ngắn — kiểm tra lại')
    .max(500, 'API key quá dài — kiểm tra lại')
    .regex(
      /^sk-ant-/,
      'API key phải bắt đầu "sk-ant-". Bạn có paste nhầm key khác?'
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
    ANTHROPIC_KEY_NAME,
    parsed.data.apiKey,
    user.userId,
    'Anthropic Claude API key — feature Chat với Skill'
  );

  // Quan trọng: clear cache để next chat dùng key mới (KHÔNG đợi 1 phút TTL)
  invalidateAnthropicKeyCache();

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const removed = await deleteSetting(ANTHROPIC_KEY_NAME);
  invalidateAnthropicKeyCache();

  return NextResponse.json({ ok: true, removed });
}
