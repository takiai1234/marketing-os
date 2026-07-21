// Telegram webhook endpoint — Telegram POST vào đây mỗi khi có tin nhắn mới.
// URL phải được đăng ký với Telegram qua setWebhook (xem /api/settings/telegram/register-webhook).
// Không cần auth header — verify bằng secret_token trong URL path (Telegram feature).

import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUpdate, type TelegramUpdate } from '@/lib/telegram/bot-handler';

export const runtime = 'nodejs';

// Telegram gọi endpoint này với POST body là Update object.
// Phải trả về 200 nhanh (< 2s) — xử lý async không blocking.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let update: TelegramUpdate;
  try {
    update = await req.json() as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Await xử lý — Next.js nodejs runtime có thể terminate async work sau khi
  // response trả về. Telegram cho 60s timeout nên await an toàn.
  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    console.error('[telegram-webhook] unhandled error:', err);
  }

  return NextResponse.json({ ok: true });
}
