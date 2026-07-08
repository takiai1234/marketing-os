// GET /api/lark/base/records?page_token=...&page_size=100
// Lấy records từ Lark Base table đã cấu hình trong Settings.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSetting } from '@/lib/settings/api-keys';
import { fetchLarkBaseRecords } from '@/lib/lark/base-client';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY } from '@/lib/lark/client';
import { LARK_BASE_APP_TOKEN_KEY, LARK_BASE_TABLE_ID_KEY } from '@/lib/lark/base-client';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [appId, appSecret, appToken, tableId] = await Promise.all([
    getSetting(LARK_APP_ID_KEY),
    getSetting(LARK_APP_SECRET_KEY),
    getSetting(LARK_BASE_APP_TOKEN_KEY),
    getSetting(LARK_BASE_TABLE_ID_KEY),
  ]);

  if (!appId || !appSecret || !appToken || !tableId) {
    return NextResponse.json(
      { error: 'Lark Base chưa cấu hình đủ. Vào Settings → Tích hợp để thêm.' },
      { status: 400 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const pageToken = sp.get('page_token') ?? undefined;
  const pageSize = Math.min(Number(sp.get('page_size') ?? 100), 500);

  try {
    const result = await fetchLarkBaseRecords(appId, appSecret, appToken, tableId, {
      pageSize,
      pageToken,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
