// GET /api/integrations/google/callback — nhận code từ Google, đổi lấy tokens,
// lưu refresh_token vào app_setting rồi redirect về /settings/integrations.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { exchangeCodeForTokens, saveRefreshToken } from '@/lib/google/oauth';

export const runtime = 'nodejs';

const BASE = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? 'https://mkt.taki.vn';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${BASE}/login`);
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.redirect(`${BASE}/settings/integrations?google_error=Admin+only`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    const msg = error ?? 'Không nhận được authorization code';
    return NextResponse.redirect(
      `${BASE}/settings/integrations?google_error=${encodeURIComponent(msg)}`
    );
  }

  try {
    const { refreshToken } = await exchangeCodeForTokens(code);
    await saveRefreshToken(refreshToken, user.userId);
    return NextResponse.redirect(`${BASE}/settings/integrations?google_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối Google';
    return NextResponse.redirect(
      `${BASE}/settings/integrations?google_error=${encodeURIComponent(msg)}`
    );
  }
}
