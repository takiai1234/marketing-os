// Storage helpers cho chat attachments (file + image đính kèm trong 1 message).
//
// Path layout: <root>/<sessionId>/<attId>__<sanitizedFilename>
//   - sessionId scope theo project/skill chat session
//   - attId là UUID internal → tránh collision khi 2 attachment cùng tên
//
// Khác project file:
//   - Project file ở /app/storage/projects (persistent knowledge)
//   - Chat attachment ở /app/storage/chat-attachments (ephemeral per message)

import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_STORAGE = './storage/chat-attachments';

export function getAttachmentStorageDir(): string {
  const dir = process.env.CHAT_ATTACHMENT_STORAGE_PATH || DEFAULT_STORAGE;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1F]/g, '')
    .slice(0, 200);
}

/** Resolve absolute path. Throws nếu relativePath escape khỏi storage root. */
function resolveAttachmentPath(relativePath: string): string {
  const root = getAttachmentStorageDir();
  const full = resolve(root, relativePath);
  if (!full.startsWith(resolve(root))) {
    throw new Error('Path traversal detected');
  }
  return full;
}

export async function writeAttachment(
  sessionId: string,
  attId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const root = getAttachmentStorageDir();
  const dir = resolve(root, sessionId);
  if (!dir.startsWith(resolve(root))) {
    throw new Error('Path traversal detected');
  }
  await mkdir(dir, { recursive: true });
  const relativePath = `${sessionId}/${attId}__${sanitizeFilename(filename)}`;
  const fullPath = resolveAttachmentPath(relativePath);
  await writeFile(fullPath, buffer);
  return relativePath;
}

export async function readAttachment(relativePath: string): Promise<Buffer> {
  const fullPath = resolveAttachmentPath(relativePath);
  return readFile(fullPath);
}

export async function deleteAttachment(relativePath: string): Promise<void> {
  if (!relativePath) return;
  try {
    const fullPath = resolveAttachmentPath(relativePath);
    await unlink(fullPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
}

// ─── Attachment metadata type — match JSONB shape trong DB ──────────────

export interface MessageAttachment {
  id: string;
  kind: 'image' | 'file';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Relative path từ getAttachmentStorageDir() — internal-only */
  storagePath: string;
  /** Text extract (cho file PDF/DOCX/MD/...) — null nếu là image hoặc binary unsupported */
  contentText: string | null;
  /** PDF page count nếu là PDF */
  pageCount: number | null;
  /** True nếu file binary không hỗ trợ extract text (image/video/archive/...) */
  isBinaryUnsupported: boolean;
}
