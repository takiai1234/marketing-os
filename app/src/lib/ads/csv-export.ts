// CSV export helpers cho /ads pages.
//
// RFC 4180 escape: bao quanh quote (") nếu field chứa "," / "\n" / """.
// Double up quote inside quoted field: `say "hi"` → `"say ""hi"""`.
// BOM ﻿ prefix giúp Excel mở UTF-8 đúng (không bị mojibake tiếng Việt).

const BOM = '﻿';

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/["\n\r,]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build CSV from header + rows. */
export function buildCsv(header: string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines: string[] = [];
  lines.push(header.map(escapeCsvField).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Convert spend_micros sang display unit theo currency. KHÔNG include
 *  currency symbol — đơn giản cho CSV import vào Excel/Sheets. */
export function microsToCsvAmount(micros: number, _currency: string): string {
  return (micros / 1_000_000).toFixed(2);
}

/** Filename-safe slug từ name. */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

/** Build Content-Disposition header với filename UTF-8 safe. */
export function csvDispositionHeader(filename: string): string {
  // RFC 5987 — UTF-8 filename* để hỗ trợ Vietnamese
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${utf8}`;
}
