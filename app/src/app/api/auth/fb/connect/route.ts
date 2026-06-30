// GET /api/auth/fb/connect?return_to=ads|channels
// Generates a CSRF state token, stores it (+ return_to) in the iron-session,
// then redirects the browser to the Facebook OAuth dialog.
// Requires an active admin session — returns 401 if unauthenticated.
//
// return_to controls post-callback redirect:
//   'ads'      → /ads (sau khi discover ad accounts, skip pages picker)
//   'channels' → /channels/new/facebook?step=pick (mặc định)

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getCurrentUser, getSession } from '@/lib/auth/get-session';
import { getPublicOrigin } from '@/lib/auth/public-origin';
import { buildAuthUrl } from '@/lib/fb/oauth-flow';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Generate a 16-byte (32 hex char) CSRF state token
  const state = randomBytes(16).toString('hex');

  const returnToParam = req.nextUrl.searchParams.get('return_to');
  const returnTo: 'ads' | 'channels' =
    returnToParam === 'ads' ? 'ads' : 'channels';

  // Persist state in the session for verification in the callback
  const session = await getSession();
  session.fb_oauth_state = state;
  session.fb_oauth_return_to = returnTo;
  await session.save();

  try {
    // Ads flow: force rerequest ads_read vì user có thể đã authorize app trước
    // đó (khi kết nối Pages) mà không có scope này. Nếu không có auth_type=rerequest,
    // FB silently skip dialog và token trả về không có ads_read.
    const authUrl = await buildAuthUrl(
      state,
      returnTo === 'ads' ? { rerequestScope: 'ads_read' } : undefined
    );
    return NextResponse.redirect(authUrl);
  } catch (err) {
    // FB_APP_ID chưa cấu hình — redirect về /ads/connect với hint rõ ràng
    const msg = err instanceof Error ? err.message : String(err);
    const url = new URL(
      returnTo === 'ads' ? '/ads/connect' : '/channels/new/facebook',
      getPublicOrigin(req)
    );
    url.searchParams.set('error', encodeURIComponent(msg));
    return NextResponse.redirect(url);
  }
}
