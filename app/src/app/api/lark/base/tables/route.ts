// GET /api/lark/base/tables
// List tất cả tables trong Lark Base app_token đã cấu hình.
// Dùng trong Settings để user chọn table muốn hiển thị.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSetting } from '@/lib/settings/api-keys';
import { listLarkBaseTables } from '@/lib/lark/base-client';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY } from '@/lib/lark/client';
import { LARK_BASE_APP_TOKEN_KEY } from '@/lib/lark/base-client';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [appId, appSecret, appToken] = await Promise.all([
    getSetting(LARK_APP_ID_KEY),
    getSetting(LARK_APP_SECRET_KEY),
    getSetting(LARK_BASE_APP_TOKEN_KEY),
  ]);

  if (!appId || !appSecret || !appToken) {
    return NextResponse.json({ error: 'Thiếu cấu hình Lark' }, { status: 400 });
  }

  try {
    const tables = await listLarkBaseTables(appId, appSecret, appToken);
    return NextResponse.json({ tables });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
