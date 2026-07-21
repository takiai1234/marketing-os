import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';

export const runtime = 'nodejs';

export const TELEGRAM_BOT_TOKEN_KEY = 'TELEGRAM_BOT_TOKEN';
export const TELEGRAM_CHAT_ID_KEY = 'TELEGRAM_REPORT_CHAT_ID';

const putSchema = z.object({
  botToken: z.string().trim().min(20, 'Bot token không hợp lệ'),
  chatId: z.string().trim().min(3, 'Chat ID không hợp lệ'),
});

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return { userId: user.userId };
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  await Promise.all([
    setSetting(TELEGRAM_BOT_TOKEN_KEY, parsed.data.botToken, auth.userId, 'Telegram Bot Token cho báo cáo sáng 07:00'),
    setSetting(TELEGRAM_CHAT_ID_KEY, parsed.data.chatId, auth.userId, 'Telegram Group Chat ID nhận báo cáo sáng'),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await Promise.all([
    deleteSetting(TELEGRAM_BOT_TOKEN_KEY),
    deleteSetting(TELEGRAM_CHAT_ID_KEY),
  ]);

  return NextResponse.json({ ok: true });
}
