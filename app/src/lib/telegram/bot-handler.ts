// Telegram bot message handler — nhận update từ webhook, parse intent bằng LLM, query DB, trả lời group.

import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_CHAT_ID_KEY } from '@/app/api/settings/telegram/route';
import { parseIntent } from './intent-parser';
import { executeIntent } from './query-executor';

// ─── Telegram types ───────────────────────────────────────────────────────────

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

// ─── Send helper ──────────────────────────────────────────────────────────────

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
      console.log('[telegram-bot] sendMessage OK');
    }
  } catch (err) {
    console.error('[telegram-bot] sendMessage exception:', err instanceof Error ? err.message : String(err));
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || msg.from?.is_bot) return;

  console.log('[bot] chatId:', msg.chat.id, 'text:', msg.text.slice(0, 80));

  const token = await getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY);
  if (!token) { console.warn('[bot] no token'); return; }

  // Chỉ handle group đã cấu hình
  const configuredChatId = await getSettingOrEnv(TELEGRAM_CHAT_ID_KEY);
  if (!configuredChatId) { console.warn('[bot] no chatId configured'); return; }

  if (String(msg.chat.id) !== String(configuredChatId)) {
    console.log('[bot] wrong chat, skip. got:', msg.chat.id, 'expected:', configuredChatId);
    return;
  }

  const hasMention = (msg.entities?.some((e) => e.type === 'mention') ?? false) &&
    msg.text.toLowerCase().includes('@taki_marketing_os_bot');
  const isReplyToBot = msg.reply_to_message?.from?.is_bot === true;
  const isQuestion = msg.text.includes('?') ||
    /\b(reach|lead|ads|spend|chi phí|followers|báo cáo|hôm qua|tuần|tháng|kênh|conversions)\b/i.test(msg.text);

  console.log('[bot] hasMention:', hasMention, 'isReplyToBot:', isReplyToBot, 'isQuestion:', isQuestion);

  if (!hasMention && !isReplyToBot && !isQuestion) return;

  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  // Reply ngay để user biết bot đã nhận — xác nhận pipeline hoạt động
  await sendMessage(token, chatId, '⏳ Đang tra cứu data...', msgId);

  const question = msg.text.replace(/@\w+/g, '').trim();
  console.log('[bot] question:', question);

  let intent;
  try {
    intent = await parseIntent(question);
    console.log('[bot] intent:', intent.type, intent.metric, intent.datePreset);
  } catch (err) {
    const msg2 = err instanceof Error ? err.message : String(err);
    console.error('[bot] parseIntent error:', msg2);
    await sendMessage(token, chatId, `⚠️ Lỗi phân tích: ${msg2}`, msgId);
    return;
  }

  if (intent.type === 'unknown') {
    await sendMessage(
      token, chatId,
      '🤔 Tôi chỉ trả lời câu hỏi về data marketing.\nVí dụ: <i>"leads tuần này bao nhiêu?"</i>',
      msgId,
    );
    return;
  }

  let answer: string;
  try {
    answer = await executeIntent(intent, question);
    console.log('[bot] answer len:', answer.length);
  } catch (err) {
    const msg2 = err instanceof Error ? err.message : String(err);
    console.error('[bot] executeIntent error:', msg2);
    await sendMessage(token, chatId, `⚠️ Lỗi truy vấn: ${msg2}`, msgId);
    return;
  }

  await sendMessage(token, chatId, answer, msgId);
  console.log('[bot] done');
}
