// GET /api/auth/fb/callback?code=...&state=...
// Verifies CSRF state, exchanges code for tokens, lists pages.
// Stores page list in short-lived iron-session field, then redirects to
// /channels/new/facebook?step=pick (FB connect flow moved into its own subroute
// after the multi-platform picker landed at /channels/new).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getSession } from '@/lib/auth/get-session';
import { getPublicOrigin } from '@/lib/auth/public-origin';
import {
  exchangeCodeForUserToken,
  extendUserToken,
  listUserPages,
} from '@/lib/fb/oauth-flow';
import { fetchAdAccounts } from '@/lib/fb/ads-api-client';
import { upsertAdAccount } from '@/lib/queries/ad-accounts';
import { encryptToken } from '@/lib/fb/token-encryption';
import { db } from '@/lib/db';
import type { FBPage } from '@/lib/fb/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Public origin — APP_URL env (vd https://test002.taki.vn). Tuyệt đối
  // KHÔNG dùng req.nextUrl.origin vì sau proxy/Docker nó là 0.0.0.0:3000
  // → user click thấy ERR_ADDRESS_INVALID.
  const origin = getPublicOrigin(req);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    const url = new URL('/channels/new/facebook', origin);
    url.searchParams.set('step', 'connect');
    url.searchParams.set('error', errorParam);
    return NextResponse.redirect(url);
  }

  if (!code || !state) {
    const url = new URL('/channels/new/facebook', origin);
    url.searchParams.set('step', 'connect');
    url.searchParams.set('error', 'missing_params');
    return NextResponse.redirect(url);
  }

  const session = await getSession();
  const expectedState = session.fb_oauth_state;

  if (!expectedState || expectedState !== state) {
    const url = new URL('/channels/new/facebook', origin);
    url.searchParams.set('step', 'connect');
    url.searchParams.set('error', 'invalid_state');
    return NextResponse.redirect(url);
  }

  // Clear CSRF state immediately
  session.fb_oauth_state = undefined;

  try {
    const shortToken = await exchangeCodeForUserToken(code);
    const userToken = await extendUserToken(shortToken);
    const pages: FBPage[] = await listUserPages(userToken);

    // Store pages in session — expires in 5 minutes. Token stays server-side only.
    session.fb_oauth_pages = {
      pages: pages.slice(0, 30).map((p) => ({
        id: p.id,
        name: p.name,
        access_token: p.access_token,
        category: p.category,
      })),
      userToken,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    await session.save();

    // ─── Ad accounts: discover qua /me/adaccounts (cần scope ads_read) ──
    // Best-effort: nếu user chưa approve ads_read scope, fetchAdAccounts
    // throw FB error #100/200 — catch + skip (Pages flow vẫn tiếp tục).
    // Token được encrypt + lưu vào ad_account.encrypted_token để cron sau
    // dùng cho /act_<id>/insights call. User token có lifespan ~60 days
    // sau extendUserToken — đủ cho daily sync.
    try {
      const adAccounts = await fetchAdAccounts(userToken);
      if (adAccounts.length > 0) {
        const encryptedToken = await encryptToken(userToken);
        for (const acc of adAccounts) {
          const dbAccount = await upsertAdAccount({
            ownerId: user.userId,
            platform: 'facebook',
            externalId: acc.id, // 'act_<numeric>'
            name: acc.name,
            currency: acc.currency,
            timezone: acc.timezone_name ?? null,
            businessManagerId: acc.business?.id ?? null,
            businessManagerName: acc.business?.name ?? null,
          });
          // Cập nhật token cho row vừa upsert (separate query vì
          // upsertAdAccount không nhận token — token là cấp user, dùng chung)
          await db.query(
            `UPDATE ad_account SET encrypted_token = $2 WHERE id = $1`,
            [dbAccount.id, encryptedToken]
          );
        }
        console.log(
          `[fb/callback] Discovered ${adAccounts.length} ad accounts for user ${user.userId}`
        );
      }
    } catch (err) {
      // Không kill Pages flow — chỉ log
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[fb/callback] Ad accounts discovery skipped (likely ads_read scope missing): ${msg.slice(0, 200)}`
      );
    }

    // Honor return_to — user từ /ads/connect → redirect về /ads (skip pages picker).
    // Default → channels picker (existing behavior cho user kết nối từ /channels/new).
    const returnTo = session.fb_oauth_return_to;
    session.fb_oauth_return_to = undefined;
    await session.save();

    if (returnTo === 'ads') {
      // Clear pages picker session — user không cần pick pages từ /ads flow
      session.fb_oauth_pages = undefined;
      await session.save();
      return NextResponse.redirect(new URL('/ads', origin));
    }

    const redirectUrl = new URL('/channels/new/facebook', origin);
    redirectUrl.searchParams.set('step', 'pick');
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    // Clear partial state on error
    session.fb_oauth_pages = undefined;
    await session.save();

    const message = err instanceof Error ? err.message : 'oauth_failed';
    const url = new URL('/channels/new/facebook', origin);
    url.searchParams.set('step', 'connect');
    url.searchParams.set('error', encodeURIComponent(message));
    return NextResponse.redirect(url);
  }
}
