// DB queries cho skill_chat_session + skill_chat_message tables.
// Ownership semantics: mọi query take userId — chỉ trả/sửa rows của user đó.

import { db } from '@/lib/db';
import type { MessageAttachment } from '@/lib/chat-attachments/storage';

export type ChatMessageRole = 'user' | 'assistant';

export interface ChatSession {
  id: string;
  skillId: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  /** Tổng tokens out của assistant messages — dashboard cost */
  totalTokensOut: number;
  totalTokensIn: number;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  attachments: MessageAttachment[];
}

/** List sessions của user X cho skill Y, mới nhất trước. */
export async function listSessions(
  skillId: string,
  userId: string
): Promise<ChatSession[]> {
  const res = await db.query<{
    id: string;
    skill_id: string;
    user_id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
    total_tokens_in: string;
    total_tokens_out: string;
    message_count: string;
  }>(
    `SELECT s.id, s.skill_id, s.user_id, s.title, s.model,
            s.created_at::TEXT, s.updated_at::TEXT,
            COALESCE(SUM(m.tokens_in), 0)::TEXT  AS total_tokens_in,
            COALESCE(SUM(m.tokens_out), 0)::TEXT AS total_tokens_out,
            COUNT(m.id)::TEXT                    AS message_count
       FROM skill_chat_session s
       LEFT JOIN skill_chat_message m ON m.session_id = s.id
      WHERE s.skill_id = $1 AND s.user_id = $2
      GROUP BY s.id
      ORDER BY s.updated_at DESC`,
    [skillId, userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    skillId: r.skill_id,
    userId: r.user_id,
    title: r.title,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    totalTokensIn: Number(r.total_tokens_in),
    totalTokensOut: Number(r.total_tokens_out),
    messageCount: Number(r.message_count),
  }));
}

export async function createSession(
  skillId: string,
  userId: string,
  model: string,
  title: string = 'Cuộc trò chuyện mới'
): Promise<ChatSession> {
  const res = await db.query<{
    id: string;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO skill_chat_session (skill_id, user_id, model, title)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at::TEXT, updated_at::TEXT`,
    [skillId, userId, model, title]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to create session');
  return {
    id: row.id,
    skillId,
    userId,
    title,
    model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalTokensIn: 0,
    totalTokensOut: 0,
    messageCount: 0,
  };
}

/** Load session detail — verify ownership. Trả null nếu không tồn tại hoặc
 *  user không own. UI 404 dựa trên null. */
export async function getSessionForUser(
  sessionId: string,
  userId: string
): Promise<(ChatSession & { messages: ChatMessage[] }) | null> {
  const sesRes = await db.query<{
    id: string;
    skill_id: string;
    user_id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, skill_id, user_id, title, model,
            created_at::TEXT, updated_at::TEXT
       FROM skill_chat_session
      WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const session = sesRes.rows[0];
  if (!session) return null;

  const msgRes = await db.query<{
    id: string;
    session_id: string;
    role: ChatMessageRole;
    content: string;
    tokens_in: number;
    tokens_out: number;
    created_at: string;
    attachments: MessageAttachment[] | null;
  }>(
    `SELECT id, session_id, role, content, tokens_in, tokens_out,
            created_at::TEXT, attachments
       FROM skill_chat_message
      WHERE session_id = $1
      ORDER BY created_at ASC, id ASC`,
    [sessionId]
  );

  const messages: ChatMessage[] = msgRes.rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    tokensIn: Number(r.tokens_in),
    tokensOut: Number(r.tokens_out),
    createdAt: r.created_at,
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
  }));

  const totalTokensIn = messages.reduce((s, m) => s + m.tokensIn, 0);
  const totalTokensOut = messages.reduce((s, m) => s + m.tokensOut, 0);

  return {
    id: session.id,
    skillId: session.skill_id,
    userId: session.user_id,
    title: session.title,
    model: session.model,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    totalTokensIn,
    totalTokensOut,
    messageCount: messages.length,
    messages,
  };
}

export async function appendMessage(
  sessionId: string,
  role: ChatMessageRole,
  content: string,
  tokensIn: number = 0,
  tokensOut: number = 0,
  attachments: MessageAttachment[] = []
): Promise<ChatMessage> {
  const res = await db.query<{ id: string; created_at: string }>(
    `INSERT INTO skill_chat_message
       (session_id, role, content, tokens_in, tokens_out, attachments)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, created_at::TEXT`,
    [sessionId, role, content, tokensIn, tokensOut, JSON.stringify(attachments)]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to append message');

  // Update session.updated_at để session list ORDER BY updated_at DESC đẩy lên
  await db.query(`UPDATE skill_chat_session SET updated_at = NOW() WHERE id = $1`, [
    sessionId,
  ]);

  return {
    id: row.id,
    sessionId,
    role,
    content,
    tokensIn,
    tokensOut,
    createdAt: row.created_at,
    attachments,
  };
}

/** Update title — auto-set từ first message hoặc user rename qua UI. */
export async function updateSessionTitle(
  sessionId: string,
  userId: string,
  title: string
): Promise<void> {
  await db.query(
    `UPDATE skill_chat_session SET title = $3 WHERE id = $1 AND user_id = $2`,
    [sessionId, userId, title]
  );
}

export async function deleteSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM skill_chat_session WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
