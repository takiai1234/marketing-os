// GET /api/integrations/google/auth — redirect admin đến Google consent screen
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { buildAuthUrl } from '@/lib/google/oauth';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const url = await buildAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi';
    const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? 'https://mkt.taki.vn';
    return NextResponse.redirect(
      `${base}/settings/integrations?google_error=${encodeURIComponent(msg)}`
    );
  }
}
