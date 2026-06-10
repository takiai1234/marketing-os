// PUT  /api/settings/apify — save APIFY_API_TOKEN + APIFY_WEBHOOK_SECRET (admin only)
// DELETE /api/settings/apify — xoá cả 2 keys

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';

export const runtime = 'nodejs';

const APIFY_API_TOKEN_KEY = 'APIFY_API_TOKEN';
const APIFY_WEBHOOK_SECRET_KEY = 'APIFY_WEBHOOK_SECRET';

const putBodySchema = z.object({
  apiToken: z.string().trim().min(8, 'Token quá ngắn').max(200, 'Token quá dài'),
  webhookSecret: z
    .string()
    .trim()
    .min(8, 'Secret tối thiểu 8 ký tự')
    .max(128, 'Secret tối đa 128 ký tự'),
});

async function requireAdmin(): Promise<NextResponse | { userId: string }> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return { userId: user.userId };
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  await setSetting(
    APIFY_API_TOKEN_KEY,
    parsed.data.apiToken,
    auth.userId,
    'Apify API token (fetch dataset items khi webhook callback)'
  );
  await setSetting(
    APIFY_WEBHOOK_SECRET_KEY,
    parsed.data.webhookSecret,
    auth.userId,
    'Secret verify webhook calls từ Apify (?secret= query param)'
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await deleteSetting(APIFY_API_TOKEN_KEY);
  await deleteSetting(APIFY_WEBHOOK_SECRET_KEY);

  return NextResponse.json({ ok: true });
}
