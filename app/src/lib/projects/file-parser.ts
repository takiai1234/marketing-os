// File parser cho Project knowledge files.
//
// Hỗ trợ:
//   - Plain text: txt, md, mdx, json, csv, yaml/yml, html, xml, log, py, js,
//     ts, tsx, jsx, java, go, rs, sh, ... (đọc as UTF-8)
//   - PDF: dùng pdf-parse → extract concatenated text mọi trang
//   - DOCX: dùng mammoth → extract raw text (bỏ format)
//
// Reject:
//   - Image, video, audio binary (PNG/JPG/MP4/MP3): không có text → vô nghĩa
//     trong system prompt. Caller có thể vẫn lưu file disk nhưng KHÔNG vào
//     content_text — UI mark "no preview".
//   - Executable binary (exe, dmg, zip, ...): tương tự
//   - File > MAX_FILE_BYTES: throw để API trả 413
//
// Output content_text được clamp ở MAX_TEXT_CHARS để tránh nổ prompt.

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Cap upload size — 20 MB là quá đủ cho PDF/DOCX bình thường */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Cap text extract per file — clamp để 1 file rác không nổ prompt */
export const MAX_TEXT_CHARS = 500_000;

export interface ParseResult {
  /** Text đã extract — có thể rỗng nếu file là binary không hỗ trợ */
  text: string;
  /** True nếu file thuộc kind không support extract (image/video/...) */
  isBinaryUnsupported: boolean;
  /** True nếu text bị truncate ở MAX_TEXT_CHARS */
  truncated: boolean;
  /** Số trang (chỉ PDF) — info hữu ích cho UI */
  pageCount?: number;
}

/** MIME types đọc thẳng as UTF-8 */
const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];

/** Extension → text-readable. Map ngắn các file phổ biến không có MIME tốt. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'mdx', 'json', 'jsonl', 'csv', 'tsv', 'yaml', 'yml',
  'html', 'htm', 'xml', 'svg', 'log',
  'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'sql', 'toml', 'ini', 'env', 'gitignore', 'dockerfile',
]);

const IMAGE_MIME_PREFIX = 'image/';
const VIDEO_MIME_PREFIX = 'video/';
const AUDIO_MIME_PREFIX = 'audio/';
const ARCHIVE_MIMES = new Set([
  'application/zip',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/gzip',
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

function isTextFile(filename: string, mimeType: string): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  return TEXT_EXTENSIONS.has(getExtension(filename));
}

function isPdfFile(filename: string, mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' || getExtension(filename) === 'pdf'
  );
}

function isDocxFile(filename: string, mimeType: string): boolean {
  return (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    getExtension(filename) === 'docx'
  );
}

function isBinaryUnsupported(filename: string, mimeType: string): boolean {
  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) return true;
  if (mimeType.startsWith(VIDEO_MIME_PREFIX)) return true;
  if (mimeType.startsWith(AUDIO_MIME_PREFIX)) return true;
  if (ARCHIVE_MIMES.has(mimeType)) return true;
  // Fallback theo ext (1 số browser gửi octet-stream không thông tin)
  const ext = getExtension(filename);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    // SVG là text — đã match TEXT_EXTENSIONS trước rồi, đây là fallback
    return ext !== 'svg';
  }
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return true;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return true;
  if (['zip', 'tar', 'gz', '7z', 'rar', 'dmg', 'exe', 'iso'].includes(ext)) return true;
  return false;
}

function clamp(s: string): { text: string; truncated: boolean } {
  if (s.length <= MAX_TEXT_CHARS) return { text: s, truncated: false };
  return {
    text:
      s.slice(0, MAX_TEXT_CHARS) +
      `\n\n[... TRUNCATED — file quá dài, hiển thị ${MAX_TEXT_CHARS.toLocaleString()} ký tự đầu]`,
    truncated: true,
  };
}

/**
 * Parse file buffer → text. Throws nếu file quá lớn hoặc parser lỗi (PDF
 * corrupt, DOCX không phải format chuẩn). Binary unsupported KHÔNG throw —
 * trả isBinaryUnsupported=true để caller vẫn lưu file gốc.
 */
export async function parseFile(
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<ParseResult> {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(
      `File quá lớn: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`
    );
  }

  // Binary unsupported — lưu file gốc nhưng content_text rỗng
  if (isBinaryUnsupported(filename, mimeType)) {
    return { text: '', isBinaryUnsupported: true, truncated: false };
  }

  // PDF
  if (isPdfFile(filename, mimeType)) {
    return parsePdf(buffer);
  }

  // DOCX
  if (isDocxFile(filename, mimeType)) {
    return parseDocx(buffer);
  }

  // Plain text (default)
  if (isTextFile(filename, mimeType)) {
    const raw = buffer.toString('utf8');
    const { text, truncated } = clamp(raw);
    return { text, isBinaryUnsupported: false, truncated };
  }

  // Unknown type — thử as UTF-8, nếu có quá nhiều control char thì coi như binary
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  const asText = sample.toString('utf8');
  const ctrlChars = asText.match(/[\x00-\x08\x0E-\x1F]/g)?.length ?? 0;
  if (ctrlChars > sample.length * 0.05) {
    return { text: '', isBinaryUnsupported: true, truncated: false };
  }
  // Có vẻ là text, parse cả file
  const raw = buffer.toString('utf8');
  const { text, truncated } = clamp(raw);
  return { text, isBinaryUnsupported: false, truncated };
}

// ─── PDF ─────────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const { text, truncated } = clamp(result.text);
    return {
      text,
      isBinaryUnsupported: false,
      truncated,
      pageCount: result.total,
    };
  } finally {
    // Phải destroy để giải phóng pdfjs worker
    await parser.destroy();
  }
}

// ─── DOCX ────────────────────────────────────────────────────────────────

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  // mammoth extractRawText không cần option — trả plain text
  const result = await mammoth.extractRawText({ buffer });
  const { text, truncated } = clamp(result.value);
  return { text, isBinaryUnsupported: false, truncated };
}
