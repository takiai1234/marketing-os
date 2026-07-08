// GET    /api/settings/lark-base — metadata
// POST   /api/settings/lark-base — lưu slot (marketing|order) + appToken + tableId + domain
// DELETE /api/settings/lark-base?slot=marketing|order — xoá slot

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting, listSettingsMetadata } from '@/lib/settings/api-keys';
import {
  LARK_BASE_MARKETING_APP_TOKEN_KEY, LARK_BASE_MARKETING_TABLE_ID_KEY, LARK_BASE_MARKETING_DOMAIN_KEY,
  LARK_BASE_ORDER_APP_TOKEN_KEY,      LARK_BASE_ORDER_TABLE_ID_KEY,      LARK_BASE_ORDER_DOMAIN_KEY,
} from '@/lib/lark/base-client';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return null;
  return user;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const metas = await listSettingsMetadata([
    LARK_BASE_MARKETING_APP_TOKEN_KEY, LARK_BASE_MARKETING_TABLE_ID_KEY,
    LARK_BASE_ORDER_APP_TOKEN_KEY,     LARK_BASE_ORDER_TABLE_ID_KEY,
  ]);
  const byKey = Object.fromEntries(metas.map((m) => [m.key, m]));
  return NextResponse.json({
    marketing: {
      appTokenIsSet: byKey[LARK_BASE_MARKETING_APP_TOKEN_KEY]?.isSet ?? false,
      tableIdIsSet:  byKey[LARK_BASE_MARKETING_TABLE_ID_KEY]?.isSet  ?? false,
      updatedAt:     byKey[LARK_BASE_MARKETING_APP_TOKEN_KEY]?.updatedAt ?? null,
    },
    order: {
      appTokenIsSet: byKey[LARK_BASE_ORDER_APP_TOKEN_KEY]?.isSet ?? false,
      tableIdIsSet:  byKey[LARK_BASE_ORDER_TABLE_ID_KEY]?.isSet  ?? false,
      updatedAt:     byKey[LARK_BASE_ORDER_APP_TOKEN_KEY]?.updatedAt ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { slot?: string; appToken?: string; tableId?: string; domain?: string };
  if (!body.appToken || !body.tableId || !body.slot) {
    return NextResponse.json({ error: 'Cần đủ slot, appToken, tableId' }, { status: 400 });
  }

  const isMarketing = body.slot === 'marketing';
  const appTokenKey = isMarketing ? LARK_BASE_MARKETING_APP_TOKEN_KEY : LARK_BASE_ORDER_APP_TOKEN_KEY;
  const tableIdKey  = isMarketing ? LARK_BASE_MARKETING_TABLE_ID_KEY  : LARK_BASE_ORDER_TABLE_ID_KEY;
  const domainKey   = isMarketing ? LARK_BASE_MARKETING_DOMAIN_KEY    : LARK_BASE_ORDER_DOMAIN_KEY;

  await Promise.all([
    setSetting(appTokenKey, body.appToken.trim(), user.userId, `Lark Base App Token (${body.slot})`),
    setSetting(tableIdKey,  body.tableId.trim(),  user.userId, `Lark Base Table ID (${body.slot})`),
    setSetting(domainKey,   body.domain?.trim() ?? '', user.userId, `Lark tenant domain (${body.slot})`),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const slot = req.nextUrl.searchParams.get('slot') ?? 'order';
  const isMarketing = slot === 'marketing';

  await Promise.all([
    deleteSetting(isMarketing ? LARK_BASE_MARKETING_APP_TOKEN_KEY : LARK_BASE_ORDER_APP_TOKEN_KEY),
    deleteSetting(isMarketing ? LARK_BASE_MARKETING_TABLE_ID_KEY  : LARK_BASE_ORDER_TABLE_ID_KEY),
    deleteSetting(isMarketing ? LARK_BASE_MARKETING_DOMAIN_KEY    : LARK_BASE_ORDER_DOMAIN_KEY),
  ]);

  return NextResponse.json({ ok: true });
}
