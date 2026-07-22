// Telegram bot message handler — nhận update từ webhook, parse intent bằng LLM, query DB, trả lời group.
// Bot chỉ phản hồi khi: được @mention, reply vào tin nhắn của bot, hoặc câu hỏi rõ về data marketing.

import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_CHAT_ID_KEY } from '@/app/api/settings/telegram/route';
import { parseIntent } from './intent-parser';
import { executeIntent } from './query-executor';

// ─── Telegram types (minimal) ────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name: string; username?: string; is_bot?: boolean };
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { from?: { id: number; is_bot?: boolean } };
  entities?: { type: string; offset: number; length: number }[];
}

// ─── Send helper — nhận token trực tiếp để tránh gọi DB lần 2 ───────────────

async function sendMessage(token: string, chatId: number, text: string, replyToId?: number): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...(replyToId ? { reply_to_message_id: replyToId } : {}),
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      console.error('[telegram-bot] sendMessage failed:', res.status, JSON.stringify(body));
    } else {
      console.log('[telegram-bot] sendMessage OK, chatId:', chatId);
    }
  } catch (err) {
    console.error('[telegram-bot] sendMessage exception:', err instanceof Error ? err.message : String(err));
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  console.log('[telegram-bot] update received, chatId:', msg?.chat?.id, 'text:', msg?.text?.slice(0, 60));

  if (!msg?.text || msg.from?.is_bot) return;

  // Lấy token sớm — dùng cho cả sendMessage sau này
  const token = await getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY);
  if (!token) {
    console.warn('[telegram-bot] TELEGRAM_BOT_TOKEN chưa set');
    return;
  }

  // Verify tin nhắn đến từ group đã cấu hình (bảo mật cơ bản)
  const configuredChatId = await getSettingOrEnv(TELEGRAM_CHAT_ID_KEY);
  if (!configuredChatId) {
    console.warn('[telegram-bot] TELEGRAM_REPORT_CHAT_ID chưa set');
    return;
  }

  // Dùng msg.chat.id để reply — đảm bảo đúng group, không qua DB lần nữa
  const replyChatId = msg.chat.id;
  console.log('[telegram-bot] replyChatId:', replyChatId, '| configuredChatId:', configuredChatId);

  const hasMention = (msg.entities?.some((e) => e.type === 'mention') ?? false) &&
    msg.text.toLowerCase().includes('@taki_marketing_os_bot');
  const isReplyToBot = msg.reply_to_message?.from?.is_bot === true;
  const isQuestion = msg.text.includes('?') ||
    /\b(reach|lead|ads|spend|chi phí|followers|báo cáo|hôm qua|tuần|tháng|kênh|conversions)\b/i.test(msg.text);

  console.log('[telegram-bot] hasMention:', hasMention, '| isReplyToBot:', isReplyToBot, '| isQuestion:', isQuestion);

  if (!hasMention && !isReplyToBot && !isQuestion) {
    console.log('[telegram-bot] no trigger — ignored');
    return;
  }

  // Strip @mention để lấy câu hỏi thuần
  const question = msg.text.replace(/@\w+/g, '').trim();
  console.log('[telegram-bot] question:', question);

  // Typing indicator
  fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: replyChatId, action: 'typing' }),
  }).catch(() => {});

  let intent;
  try {
    intent = await parseIntent(question);
    console.log('[telegram-bot] intent:', JSON.stringify(intent));
  } catch (err) {
    console.error('[telegram-bot] parseIntent error:', err instanceof Error ? err.message : String(err));
    await sendMessage(token, replyChatId, '⚠️ Lỗi phân tích câu hỏi, thử lại sau.', msg.message_id);
    return;
  }

  if (intent.type === 'unknown') {
    await sendMessage(
      token, replyChatId,
      '🤔 Tôi chỉ trả lời câu hỏi về data marketing (reach, leads, ads, kênh...).\n\nVí dụ: <i>"leads tháng 7 là bao nhiêu?"</i>',
      msg.message_id,
    );
    return;
  }

  let answer: string;
  try {
    answer = await executeIntent(intent, question);
    console.log('[telegram-bot] answer ready, length:', answer.length);
  } catch (err) {
    console.error('[telegram-bot] executeIntent error:', err instanceof Error ? err.message : String(err));
    await sendMessage(token, replyChatId, '⚠️ Lỗi truy vấn data, thử lại sau.', msg.message_id);
    return;
  }

  await sendMessage(token, replyChatId, answer, msg.message_id);
  console.log('[telegram-bot] done');
}
