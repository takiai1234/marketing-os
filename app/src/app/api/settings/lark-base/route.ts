// GET    /api/settings/lark-base — metadata (isSet)
// POST   /api/settings/lark-base — lưu app_token + table_id
// DELETE /api/settings/lark-base — xoá

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting, listSettingsMetadata } from '@/lib/settings/api-keys';
import { LARK_BASE_APP_TOKEN_KEY, LARK_BASE_TABLE_ID_KEY } from '@/lib/lark/base-client';

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

  const metas = await listSettingsMetadata([LARK_BASE_APP_TOKEN_KEY, LARK_BASE_TABLE_ID_KEY]);
  const byKey = Object.fromEntries(metas.map((m) => [m.key, m]));
  return NextResponse.json({
    appTokenIsSet: byKey[LARK_BASE_APP_TOKEN_KEY]?.isSet ?? false,
    tableIdIsSet: byKey[LARK_BASE_TABLE_ID_KEY]?.isSet ?? false,
    updatedAt: byKey[LARK_BASE_APP_TOKEN_KEY]?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { appToken?: string; tableId?: string };
  if (!body.appToken || !body.tableId) {
    return NextResponse.json({ error: 'Cần đủ appToken và tableId' }, { status: 400 });
  }

  await Promise.all([
    setSetting(LARK_BASE_APP_TOKEN_KEY, body.appToken.trim(), user.userId, 'Lark Base App Token (file ID)'),
    setSetting(LARK_BASE_TABLE_ID_KEY, body.tableId.trim(), user.userId, 'Lark Base Table ID'),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await Promise.all([
    deleteSetting(LARK_BASE_APP_TOKEN_KEY),
    deleteSetting(LARK_BASE_TABLE_ID_KEY),
  ]);

  return NextResponse.json({ ok: true });
}
