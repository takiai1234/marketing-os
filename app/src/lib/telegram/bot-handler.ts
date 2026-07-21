// Telegram bot message handler — nhận update từ webhook, parse intent bằng LLM,
// query DB, trả lời trong group.
// Bot chỉ phản hồi khi: được @mention hoặc reply vào tin nhắn của bot.

import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_CHAT_ID_KEY } from '@/app/api/settings/telegram/route';
import { parseIntent, type Intent } from './intent-parser';
import { executeIntent } from './query-executor';

// ─── Telegram types (minimal) ────────────────────────────────────────────

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

// ─── Send helper ─────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, replyToId?: number): Promise<void> {
  const token = await getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY);
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(replyToId ? { reply_to_message_id: replyToId } : {}),
    }),
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  console.log('[telegram-bot] update received:', JSON.stringify({ chatId: msg?.chat?.id, text: msg?.text?.slice(0, 50) }));

  if (!msg?.text || msg.from?.is_bot) return;

  const token = await getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY);
  if (!token) {
    console.warn('[telegram-bot] TELEGRAM_BOT_TOKEN chưa set');
    return;
  }

  // Xác định có phải tin nhắn gửi cho bot không:
  // 1. Có @mention bot trong text
  // 2. Reply vào tin nhắn của bot
  const hasMention = (msg.entities?.some((e) => e.type === 'mention') ?? false) &&
    msg.text.toLowerCase().includes('@taki_marketing_os_bot');
  const isReplyToBot = msg.reply_to_message?.from?.is_bot === true;

  console.log('[telegram-bot] hasMention:', hasMention, '| isReplyToBot:', isReplyToBot, '| text:', msg.text?.slice(0, 60));

  if (!hasMention && !isReplyToBot) return;

  // Strip @mention khỏi câu hỏi
  const question = msg.text
    .replace(/@\w+/g, '')
    .trim();

  if (!question) {
    await sendMessage(msg.chat.id, '❓ Bạn muốn hỏi gì? Ví dụ: <i>reach tuần này bao nhiêu?</i>', msg.message_id);
    return;
  }

  // Typing indicator
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: msg.chat.id, action: 'typing' }),
  });

  // Gửi ack ngay để xác nhận bot nhận được message
  await sendMessage(msg.chat.id, '⏳ Đang tra cứu data...', msg.message_id);

  let intent: Intent;
  try {
    intent = await parseIntent(question);
  } catch (err) {
    console.error('[telegram-bot] parseIntent error:', err);
    await sendMessage(msg.chat.id, `⚠️ Lỗi phân tích câu hỏi: ${err instanceof Error ? err.message : String(err)}`, msg.message_id);
    return;
  }

  if (intent.type === 'unknown') {
    await sendMessage(msg.chat.id, `🤔 Tôi chỉ trả lời được câu hỏi về data marketing (reach, leads, ads, kênh...). Thử hỏi: <i>"leads tháng 7 là bao nhiêu?"</i>`, msg.message_id);
    return;
  }

  let answer: string;
  try {
    answer = await executeIntent(intent, question);
  } catch (err) {
    console.error('[telegram-bot] executeIntent error:', err);
    await sendMessage(msg.chat.id, '⚠️ Lỗi khi truy vấn data. Thử lại sau nhé.', msg.message_id);
    return;
  }

  await sendMessage(msg.chat.id, answer, msg.message_id);
}
