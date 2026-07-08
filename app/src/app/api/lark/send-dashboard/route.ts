// POST /api/lark/send-dashboard
// Lấy KPI dashboard rồi gửi lên Lark qua Bot API (App ID + App Secret).
//
// Body (JSON, optional):
//   { days?: number; tagSlug?: string | null }

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSetting } from '@/lib/settings/api-keys';
import { fetchKpiData } from '@/lib/queries/dashboard-kpi';
import { sendLarkCardMessage } from '@/lib/lark/client';
import { buildDashboardCard } from '@/lib/lark/dashboard-report';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY, LARK_CHAT_ID_KEY } from '@/lib/lark/client';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [appId, appSecret, chatId] = await Promise.all([
    getSetting(LARK_APP_ID_KEY),
    getSetting(LARK_APP_SECRET_KEY),
    getSetting(LARK_CHAT_ID_KEY),
  ]);

  if (!appId || !appSecret || !chatId) {
    return NextResponse.json(
      { error: 'Lark chưa được cấu hình đầy đủ. Vào Settings → Tích hợp để thêm App ID, App Secret và Chat ID.' },
      { status: 400 }
    );
  }

  let days = 30;
  let tagSlug: string | null = null;
  try {
    const body = await req.json().catch(() => ({})) as { days?: number; tagSlug?: string };
    if (body.days && typeof body.days === 'number') days = body.days;
    if (typeof body.tagSlug === 'string') tagSlug = body.tagSlug || null;
  } catch {
    // ignore
  }

  const kpi = await fetchKpiData(days, tagSlug);
  const rangeLabel = `${days} ngày qua`;
  const origin = req.headers.get('origin') ?? req.nextUrl.origin;
  const card = buildDashboardCard(kpi, rangeLabel, `${origin}/dashboard`);

  const result = await sendLarkCardMessage(appId, appSecret, chatId, card);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Gửi thất bại', detail: result.body },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
