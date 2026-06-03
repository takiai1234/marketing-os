// PUT    /api/settings/integrations/facebook — set FB App ID + Secret cùng lúc
// DELETE /api/settings/integrations/facebook — xoá cả 2 (fallback env)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import { FB_APP_ID_KEY, FB_APP_SECRET_KEY } from '@/lib/fb/oauth-flow';

export const runtime = 'nodejs';

const bodySchema = z.object({
  // FB App ID là chuỗi số 15-16 digits (vd 1234567890123456). Có thể có app
  // dùng dạng longer numeric, vẫn để max 30.
  appId: z
    .string()
    .trim()
    .regex(/^\d{10,30}$/, 'App ID phải là số 10-30 digits'),
  // App Secret là hex 32 chars
  appSecret: z
    .string()
    .trim()
    .min(20, 'App Secret quá ngắn')
    .max(200, 'App Secret quá dài'),
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

  // Lưu cả 2 trong cùng 1 call để consistent (nếu fail giữa chừng,
  // user retry không bị half-state)
  await setSetting(
    FB_APP_ID_KEY,
    parsed.data.appId,
    user.userId,
    'Facebook App ID — Marketing API + Pages OAuth'
  );
  await setSetting(
    FB_APP_SECRET_KEY,
    parsed.data.appSecret,
    user.userId,
    'Facebook App Secret — verify OAuth code exchange'
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const r1 = await deleteSetting(FB_APP_ID_KEY);
  const r2 = await deleteSetting(FB_APP_SECRET_KEY);
  return NextResponse.json({ ok: true, removedAppId: r1, removedSecret: r2 });
}
