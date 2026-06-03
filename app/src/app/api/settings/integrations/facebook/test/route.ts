// POST /api/settings/integrations/facebook/test
//
// Validate FB App ID + Secret bằng cách lấy app access token qua client
// credentials grant + ping /<app_id>?fields=id,name. Không cần user token.
//
// Endpoint:
//   GET /oauth/access_token?client_id=X&client_secret=Y&grant_type=client_credentials
//   → trả {access_token: "X|Y"}
// Sau đó:
//   GET /<X>?access_token=...&fields=id,name
//   → trả {id, name} nếu credentials đúng

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { FB_APP_ID_KEY, FB_APP_SECRET_KEY } from '@/lib/fb/oauth-flow';

export const runtime = 'nodejs';

const GRAPH_BASE = 'https://graph.facebook.com';
const FB_VERSION = 'v21.0';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const appId = await getSettingOrEnv(FB_APP_ID_KEY);
  const appSecret = await getSettingOrEnv(FB_APP_SECRET_KEY);

  if (!appId || appId === 'placeholder') {
    return NextResponse.json(
      { error: 'FB_APP_ID chưa set — paste qua form trước' },
      { status: 400 }
    );
  }
  if (!appSecret || appSecret === 'placeholder') {
    return NextResponse.json(
      { error: 'FB_APP_SECRET chưa set' },
      { status: 400 }
    );
  }

  try {
    // 1. Get app access token via client credentials grant
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'client_credentials',
    });
    const tokenRes = await fetch(
      `${GRAPH_BASE}/${FB_VERSION}/oauth/access_token?${tokenParams.toString()}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string; code?: number };
    };
    if (!tokenRes.ok || !tokenBody.access_token) {
      const errMsg =
        tokenBody.error?.message ?? `HTTP ${tokenRes.status} from FB`;
      return NextResponse.json(
        { error: `FB credentials sai: ${errMsg}` },
        { status: 502 }
      );
    }

    // 2. Verify app info qua GET /<app_id>
    const appInfoParams = new URLSearchParams({
      access_token: tokenBody.access_token,
      fields: 'id,name,namespace,link',
    });
    const infoRes = await fetch(
      `${GRAPH_BASE}/${FB_VERSION}/${appId}?${appInfoParams.toString()}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    const infoBody = (await infoRes.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      link?: string;
      error?: { message?: string };
    };
    if (!infoRes.ok || !infoBody.id) {
      return NextResponse.json(
        {
          error: `FB không tìm thấy app: ${infoBody.error?.message ?? 'unknown'}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      appId: infoBody.id,
      appName: infoBody.name ?? '(no name)',
      appLink: infoBody.link ?? null,
      note: 'Credentials hợp lệ. Có thể vào /ads/connect để OAuth với scope ads_read.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return NextResponse.json(
      { error: `Test fail: ${msg}` },
      { status: 502 }
    );
  }
}
