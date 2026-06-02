// GET /api/chat-attachments/[messageId]/[attId]
//
// Serve 1 attachment (image/file) đính kèm message. Auth check:
//   - User phải là owner của session chứa message này
//   - Tìm message trong cả 2 bảng (project_chat_message + skill_chat_message)
//   - Look up attachment trong JSONB attachments[] theo attId
//
// Response: binary stream với Content-Type chuẩn từ DB.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { db } from '@/lib/db';
import { readAttachment, type MessageAttachment } from '@/lib/chat-attachments/storage';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ messageId: string; attId: string }>;
}

interface MessageRow {
  attachments: MessageAttachment[];
  user_id: string;
}

async function findMessage(messageId: string): Promise<MessageRow | null> {
  // Try project chat first
  const proj = await db.query<MessageRow>(
    `SELECT m.attachments, s.user_id
       FROM project_chat_message m
       JOIN project_chat_session s ON s.id = m.session_id
      WHERE m.id = $1`,
    [messageId]
  );
  if (proj.rows[0]) return proj.rows[0];

  // Fallback skill chat
  const skill = await db.query<MessageRow>(
    `SELECT m.attachments, s.user_id
       FROM skill_chat_message m
       JOIN skill_chat_session s ON s.id = m.session_id
      WHERE m.id = $1`,
    [messageId]
  );
  return skill.rows[0] ?? null;
}

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messageId, attId } = await params;
  if (!UUID_RE.test(messageId) || !UUID_RE.test(attId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const msg = await findMessage(messageId);
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Ownership: user phải là owner session chứa message
  if (msg.user_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Locate attachment trong JSONB array
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  const att = attachments.find((a) => a.id === attId);
  if (!att) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

  try {
    const buffer = await readAttachment(att.storagePath);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        // Image hiển thị inline; file khác để browser tự quyết
        'Content-Disposition': att.kind === 'image'
          ? `inline; filename="${encodeURIComponent(att.filename)}"`
          : `attachment; filename="${encodeURIComponent(att.filename)}"`,
        // Cache 1h — attachment immutable theo ID
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const msg2 = err instanceof Error ? err.message : 'Read failed';
    return NextResponse.json({ error: `Đọc file lỗi: ${msg2}` }, { status: 500 });
  }
}
