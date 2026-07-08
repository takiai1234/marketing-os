// GET    /api/settings/lark — trả metadata (isSet) cho app_id, app_secret, chat_id
// POST   /api/settings/lark — lưu app_id + app_secret + chat_id
// DELETE /api/settings/lark — xoá tất cả 3 keys
// PUT    /api/settings/lark — gửi tin nhắn test vào chat

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting, listSettingsMetadata } from '@/lib/settings/api-keys';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY, LARK_CHAT_ID_KEY, sendLarkTextMessage } from '@/lib/lark/client';
import { getSetting } from '@/lib/settings/api-keys';

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

  const metas = await listSettingsMetadata([LARK_APP_ID_KEY, LARK_APP_SECRET_KEY, LARK_CHAT_ID_KEY]);
  const byKey = Object.fromEntries(metas.map((m) => [m.key, m]));
  return NextResponse.json({
    appIdIsSet: byKey[LARK_APP_ID_KEY]?.isSet ?? false,
    appSecretIsSet: byKey[LARK_APP_SECRET_KEY]?.isSet ?? false,
    chatIdIsSet: byKey[LARK_CHAT_ID_KEY]?.isSet ?? false,
    updatedAt: byKey[LARK_APP_ID_KEY]?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { appId?: string; appSecret?: string; chatId?: string };
  const { appId, appSecret } = body;

  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'Cần đủ appId và appSecret' }, { status: 400 });
  }

  await Promise.all([
    setSetting(LARK_APP_ID_KEY, appId.trim(), user.userId, 'Lark App ID'),
    setSetting(LARK_APP_SECRET_KEY, appSecret.trim(), user.userId, 'Lark App Secret'),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await Promise.all([
    deleteSetting(LARK_APP_ID_KEY),
    deleteSetting(LARK_APP_SECRET_KEY),
    deleteSetting(LARK_CHAT_ID_KEY),
  ]);

  return NextResponse.json({ ok: true });
}

export async function PUT() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [appId, appSecret, chatId] = await Promise.all([
    getSetting(LARK_APP_ID_KEY),
    getSetting(LARK_APP_SECRET_KEY),
    getSetting(LARK_CHAT_ID_KEY),
  ]);

  if (!appId || !appSecret || !chatId) {
    return NextResponse.json({ error: 'Lark chưa cấu hình đủ' }, { status: 400 });
  }

  const result = await sendLarkTextMessage(appId, appSecret, chatId, '✅ Marketing OS đã kết nối thành công với Lark!');
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.body }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
