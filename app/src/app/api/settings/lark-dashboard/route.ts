// POST /api/settings/lark-dashboard — lưu embed URL cho dashboard Lark Base
// GET  /api/settings/lark-dashboard — trả metadata

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting, listSettingsMetadata, getSetting } from '@/lib/settings/api-keys';
import { LARK_DASHBOARD_MARKETING_URL_KEY, LARK_DASHBOARD_ORDER_URL_KEY } from '@/lib/lark/base-client';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (await getUserRole(user.userId) !== 'admin') return null;
  return user;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [mkt, order] = await Promise.all([
    getSetting(LARK_DASHBOARD_MARKETING_URL_KEY),
    getSetting(LARK_DASHBOARD_ORDER_URL_KEY),
  ]);
  return NextResponse.json({ marketing: mkt ?? null, order: order ?? null });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json() as { slot?: string; url?: string };
  if (!body.slot || !body.url) return NextResponse.json({ error: 'Cần slot + url' }, { status: 400 });
  const key = body.slot === 'marketing' ? LARK_DASHBOARD_MARKETING_URL_KEY : LARK_DASHBOARD_ORDER_URL_KEY;
  await setSetting(key, body.url.trim(), user.userId, `Lark Dashboard embed URL (${body.slot})`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const slot = req.nextUrl.searchParams.get('slot') ?? 'order';
  const key = slot === 'marketing' ? LARK_DASHBOARD_MARKETING_URL_KEY : LARK_DASHBOARD_ORDER_URL_KEY;
  await deleteSetting(key);
  return NextResponse.json({ ok: true });
}
