// Process attachments uploaded với FormData trong chat POST messages route.
//
// Input: array of File từ FormData (browser File objects)
// Output:
//   - DB records (MessageAttachment[]) để lưu vào JSONB column
//   - LLM content blocks (ChatContentBlock[]) để gửi cho kie.ai
//
// File text-extractable (PDF/DOCX/MD) → extract text, inject vào prompt như
//   "[File: filename.pdf]\n<content>\n[/File]" text block. KHÔNG gửi binary.
// Image → save disk + convert sang data URL base64 cho LLM.

import { randomUUID } from 'node:crypto';
import { parseFile, MAX_FILE_BYTES } from '@/lib/projects/file-parser';
import {
  writeAttachment,
  type MessageAttachment,
} from '@/lib/chat-attachments/storage';
import type { ChatContentBlock } from '@/lib/llm/openrouter';

/** Cap per-message: tổng số attachment + size đảm bảo prompt không nổ */
export const MAX_ATTACHMENTS_PER_MESSAGE = 8;
export const MAX_TOTAL_ATTACHMENT_BYTES = 60 * 1024 * 1024; // 60 MB tổng

export interface ProcessAttachmentsResult {
  /** Records để lưu DB JSONB column */
  attachments: MessageAttachment[];
  /** Content blocks bổ sung cho user message (sau text user gõ) */
  llmBlocks: ChatContentBlock[];
  /** Warnings để hiển thị cho user (file unsupported, text truncated, ...) */
  warnings: string[];
}

export async function processAttachments(
  sessionId: string,
  files: File[]
): Promise<ProcessAttachmentsResult> {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(
      `Quá nhiều file đính kèm (${files.length}). Max ${MAX_ATTACHMENTS_PER_MESSAGE} file / message.`
    );
  }

  let totalBytes = 0;
  for (const f of files) {
    totalBytes += f.size;
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(
        `File "${f.name}" quá lớn (${(f.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_BYTES / 1024 / 1024} MB)`
      );
    }
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(
      `Tổng size attachment vượt limit (${(totalBytes / 1024 / 1024).toFixed(1)} MB, max ${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024} MB)`
    );
  }

  const attachments: MessageAttachment[] = [];
  const llmBlocks: ChatContentBlock[] = [];
  const warnings: string[] = [];

  for (const f of files) {
    const attId = randomUUID();
    const filename = f.name || 'untitled';
    const mimeType = f.type || 'application/octet-stream';
    const buffer = Buffer.from(await f.arrayBuffer());
    const isImage = mimeType.startsWith('image/');

    // Lưu file gốc xuống disk (cả image lẫn file)
    const storagePath = await writeAttachment(sessionId, attId, filename, buffer);

    if (isImage) {
      // Image → save + convert data URL base64 cho LLM vision
      // (Tất cả 3 family đều accept data URL hoặc base64)
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      attachments.push({
        id: attId,
        kind: 'image',
        filename,
        mimeType,
        sizeBytes: f.size,
        storagePath,
        contentText: null,
        pageCount: null,
        isBinaryUnsupported: false,
      });
      llmBlocks.push({ type: 'image', dataUrl, mediaType: mimeType });
    } else {
      // File → parse text content
      let parsed;
      try {
        parsed = await parseFile(filename, mimeType, buffer);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Parse failed';
        warnings.push(`Không parse được "${filename}": ${msg}`);
        // Vẫn lưu metadata để user thấy file đã upload (chỉ không inject text)
        attachments.push({
          id: attId,
          kind: 'file',
          filename,
          mimeType,
          sizeBytes: f.size,
          storagePath,
          contentText: null,
          pageCount: null,
          isBinaryUnsupported: true,
        });
        continue;
      }

      attachments.push({
        id: attId,
        kind: 'file',
        filename,
        mimeType,
        sizeBytes: f.size,
        storagePath,
        contentText: parsed.text || null,
        pageCount: parsed.pageCount ?? null,
        isBinaryUnsupported: parsed.isBinaryUnsupported,
      });

      if (parsed.isBinaryUnsupported) {
        warnings.push(
          `"${filename}" không phải file text — AI sẽ không thấy nội dung.`
        );
      } else if (parsed.text) {
        // Inject vào prompt như text block
        llmBlocks.push({
          type: 'text',
          text: `\n\n[Đính kèm file: ${filename}${parsed.pageCount ? ` (${parsed.pageCount} trang)` : ''}]\n${parsed.text}\n[/${filename}]`,
        });
        if (parsed.truncated) {
          warnings.push(`Text "${filename}" bị cắt — file quá dài.`);
        }
      }
    }
  }

  return { attachments, llmBlocks, warnings };
}
