// Google Sheets API v4 — đọc cột Thời gian, đếm leads theo ngày.
// Dùng: GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}

import { getAccessToken } from './oauth';

export interface SheetLeadRow {
  date: string;  // 'YYYY-MM-DD'
  count: number;
}

export interface FetchSheetOptions {
  timeColumn?: string;   // Cột thời gian, default 'A'
  startRow?: number;     // Dòng bắt đầu (bỏ header), default 2
  sourceColumn?: string; // Cột Nguồn, default 'E'
  sourceFilter?: string; // Giá trị cần lọc, VD: 'aiplus.vn'. Null = không lọc
}

/**
 * Đọc cột thời gian + nguồn từ sheet, đếm leads theo ngày.
 * Nếu sourceFilter được truyền, chỉ đếm các dòng có cột nguồn chứa giá trị đó (không phân biệt hoa thường).
 */
export async function fetchSheetLeadsByDay(
  spreadsheetId: string,
  sheetName: string,
  options: FetchSheetOptions = {}
): Promise<SheetLeadRow[]> {
  const {
    timeColumn = 'A',
    startRow = 2,
    sourceColumn = 'E',
    sourceFilter,
  } = options;

  const accessToken = await getAccessToken();

  // Lấy từ cột thời gian đến cột nguồn trong 1 request
  const endCol = sourceFilter ? sourceColumn : timeColumn;
  const range = encodeURIComponent(`${sheetName}!${timeColumn}${startRow}:${endCol}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Sheets API lỗi ${res.status}: ${err.error?.message ?? res.statusText}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];

  // Tính index cột nguồn tương đối so với cột thời gian
  const timeColIdx = 0;
  const sourceColIdx = sourceFilter
    ? colLetterToIndex(sourceColumn) - colLetterToIndex(timeColumn)
    : -1;

  const filterLower = sourceFilter?.toLowerCase().trim();

  const byDay = new Map<string, number>();
  for (const row of rows) {
    const raw = row[timeColIdx]?.trim();
    if (!raw) continue;

    // Lọc theo nguồn nếu có
    if (filterLower && sourceColIdx >= 0) {
      const src = (row[sourceColIdx] ?? '').toLowerCase().trim();
      if (!src.includes(filterLower)) continue;
    }

    // Parse timestamp → YYYY-MM-DD
    let date: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      date = raw.slice(0, 10);
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      const [d, m, y] = raw.split(/[\/ ]/);
      date = `${y}-${m}-${d}`;
    } else {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
    }

    if (date) byDay.set(date, (byDay.get(date) ?? 0) + 1);
  }

  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}

function colLetterToIndex(col: string): number {
  let n = 0;
  for (const c of col.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}
