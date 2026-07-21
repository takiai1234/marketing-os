import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_CHAT_ID_KEY } from '../route';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return { userId: user.userId };
}

export async function POST(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const [token, chatId] = await Promise.all([
    getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY),
    getSettingOrEnv(TELEGRAM_CHAT_ID_KEY),
  ]);

  if (!token || !chatId) {
    return NextResponse.json({ error: 'Chưa cấu hình Bot Token hoặc Chat ID' }, { status: 400 });
  }

  const text = '✅ <b>Telegram đã kết nối thành công!</b>\n\nBáo cáo marketing sẽ được gửi vào đây lúc <b>07:00</b> mỗi sáng.';

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Telegram API lỗi: ${body}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
