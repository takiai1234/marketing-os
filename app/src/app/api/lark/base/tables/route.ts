// GET /api/lark/base/tables?slot=marketing|order
// List tables trong Lark Base đã cấu hình cho slot tương ứng.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getCurrentUser } from '@/lib/auth/get-session';
import { getSetting } from '@/lib/settings/api-keys';
import { listLarkBaseTables } from '@/lib/lark/base-client';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY } from '@/lib/lark/client';
import {
  LARK_BASE_MARKETING_APP_TOKEN_KEY, LARK_BASE_MARKETING_DOMAIN_KEY,
  LARK_BASE_ORDER_APP_TOKEN_KEY, LARK_BASE_ORDER_DOMAIN_KEY,
} from '@/lib/lark/base-client';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slot = req.nextUrl.searchParams.get('slot') ?? 'order';
  const isMarketing = slot === 'marketing';

  const appTokenKey = isMarketing ? LARK_BASE_MARKETING_APP_TOKEN_KEY : LARK_BASE_ORDER_APP_TOKEN_KEY;
  const domainKey   = isMarketing ? LARK_BASE_MARKETING_DOMAIN_KEY    : LARK_BASE_ORDER_DOMAIN_KEY;

  const [appId, appSecret, appToken, domain] = await Promise.all([
    getSetting(LARK_APP_ID_KEY),
    getSetting(LARK_APP_SECRET_KEY),
    getSetting(appTokenKey),
    getSetting(domainKey),
  ]);

  if (!appId || !appSecret || !appToken) {
    return NextResponse.json({ error: 'Thiếu cấu hình Lark' }, { status: 400 });
  }

  try {
    const tables = await listLarkBaseTables(appId, appSecret, appToken, domain);
    return NextResponse.json({ tables });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
