// PUT  /api/settings/google — lưu Google Client ID + Client Secret
// DELETE /api/settings/google — xoá credentials + refresh token

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import { GOOGLE_CLIENT_ID_KEY, GOOGLE_CLIENT_SECRET_KEY, GOOGLE_REFRESH_TOKEN_KEY } from '@/lib/google/oauth';

export const runtime = 'nodejs';

const putSchema = z.object({
  clientId: z.string().trim().min(10).max(200),
  clientSecret: z.string().trim().min(10).max(200),
});

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
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
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'clientId và clientSecret bắt buộc (tối thiểu 10 ký tự)' }, { status: 400 });
  }

  const { clientId, clientSecret } = parsed.data;
  await Promise.all([
    setSetting(GOOGLE_CLIENT_ID_KEY, clientId, auth.userId, 'Google OAuth2 Client ID'),
    setSetting(GOOGLE_CLIENT_SECRET_KEY, clientSecret, auth.userId, 'Google OAuth2 Client Secret'),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await Promise.all([
    deleteSetting(GOOGLE_CLIENT_ID_KEY),
    deleteSetting(GOOGLE_CLIENT_SECRET_KEY),
    deleteSetting(GOOGLE_REFRESH_TOKEN_KEY),
  ]);
  return NextResponse.json({ ok: true });
}
