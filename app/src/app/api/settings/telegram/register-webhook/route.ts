// Đăng ký webhook URL với Telegram để bot nhận được tin nhắn từ group.
// Phải gọi 1 lần sau khi deploy (hoặc đổi domain).

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { TELEGRAM_BOT_TOKEN_KEY } from '../route';

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

  const token = await getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY);
  if (!token) {
    return NextResponse.json({ error: 'Bot Token chưa được cấu hình' }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: 'APP_URL chưa được set trong env' }, { status: 500 });
  }

  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message'],
    }),
  });

  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok) {
    return NextResponse.json({ error: `Telegram: ${data.description}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, webhookUrl });
}
