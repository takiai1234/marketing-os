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
import {
  upsertAdAccount,
  markStaleAdAccounts,
} from '@/lib/queries/ad-accounts';
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

  // Read returnTo NGAY — quyết định pipeline trước khi gọi FB API.
  // 'ads' flow: chỉ cần fetchAdAccounts, KHÔNG lưu pages vào session
  //             (tránh cookie too big với user có nhiều page).
  // 'channels' flow (default): fetch pages → lưu session → picker.
  const returnTo = session.fb_oauth_return_to;
  session.fb_oauth_return_to = undefined;

  try {
    const shortToken = await exchangeCodeForUserToken(code);
    const userToken = await extendUserToken(shortToken);

    // ─── Ad accounts: discover qua /me/adaccounts (cần scope ads_read) ──
    // Best-effort cho cả 2 flow. Cron sẽ dùng encrypted_token sync sau.
    try {
      const adAccounts = await fetchAdAccounts(userToken);
      console.log(
        `[fb/callback] FB returned ${adAccounts.length} ad accounts. IDs: ${adAccounts.map((a) => a.id).join(', ')}`
      );
      if (adAccounts.length > 0) {
        const encryptedToken = await encryptToken(userToken);
        for (const acc of adAccounts) {
          const dbAccount = await upsertAdAccount({
            ownerId: user.userId,
            platform: 'facebook',
            externalId: acc.id,
            name: acc.name,
            currency: acc.currency,
            timezone: acc.timezone_name ?? null,
            businessManagerId: acc.business?.id ?? null,
            businessManagerName: acc.business?.name ?? null,
          });
          await db.query(
            `UPDATE ad_account SET encrypted_token = $2 WHERE id = $1`,
            [dbAccount.id, encryptedToken]
          );
        }
        console.log(
          `[fb/callback] Discovered ${adAccounts.length} ad accounts for user ${user.userId}`
        );

        // Auto-cleanup: mark old ad_accounts không có trong fetch hiện tại
        // thành 'disconnected'. Trường hợp user đổi FB app, revoke account
        // permission, BM transfer ownership, ...
        const currentIds = adAccounts.map((a) => a.id);
        const staleCount = await markStaleAdAccounts(
          user.userId,
          'facebook',
          currentIds
        );
        if (staleCount > 0) {
          console.log(
            `[fb/callback] Marked ${staleCount} stale ad accounts as disconnected for user ${user.userId}`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[fb/callback] Ad accounts discovery skipped: ${msg.slice(0, 200)}`
      );
    }

    if (returnTo === 'ads') {
      // Ads flow: KHÔNG cần list pages, KHÔNG cần lưu session payload nặng.
      // Chỉ save (để clear fb_oauth_state + return_to) rồi redirect.
      session.fb_oauth_pages = undefined;
      await session.save();
      return NextResponse.redirect(new URL('/ads', origin));
    }

    // Channels flow: cần pages để picker render. Giới hạn slice cứng để
    // không vượt browser cookie limit ~4-8KB.
    // 10 pages × ~200B/page (id + name + access_token + category) ≈ 2KB raw
    // + userToken 200B + iron-session overhead → ~6KB encrypted, fit cookie.
    const pages: FBPage[] = await listUserPages(userToken);
    const PAGE_LIMIT = 10;
    session.fb_oauth_pages = {
      pages: pages.slice(0, PAGE_LIMIT).map((p) => ({
        id: p.id,
        name: p.name,
        access_token: p.access_token,
        category: p.category,
      })),
      userToken,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    await session.save();

    if (pages.length > PAGE_LIMIT) {
      console.warn(
        `[fb/callback] User ${user.userId} có ${pages.length} pages — chỉ hiện ${PAGE_LIMIT} đầu trong picker do cookie limit.`
      );
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
