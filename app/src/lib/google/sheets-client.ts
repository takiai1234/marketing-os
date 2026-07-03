// Google Sheets API v4 — đọc header để tìm cột theo tên, đếm leads theo ngày.

import { getAccessToken } from './oauth';

export interface SheetLeadRow {
  date: string;  // 'YYYY-MM-DD'
  count: number;
}

export interface FetchSheetOptions {
  timeColumnName?: string;   // Tên header cột thời gian, default 'Thời gian'
  sourceColumnName?: string; // Tên header cột nguồn, default 'Nguồn'
  sourceFilter?: string;     // Giá trị cần lọc (contains, không phân biệt hoa thường)
}

/**
 * Đọc toàn bộ sheet, tìm cột theo tên header, đếm tổng leads theo ngày.
 * Không dedup — đếm tất cả rows phù hợp filter.
 */
export async function fetchSheetLeadsByDay(
  spreadsheetId: string,
  sheetName: string,
  options: FetchSheetOptions = {}
): Promise<SheetLeadRow[]> {
  const {
    timeColumnName = 'Thời gian',
    sourceColumnName = 'Nguồn',
    sourceFilter,
  } = options;

  const accessToken = await getAccessToken();

  const range = encodeURIComponent(`${sheetName}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Sheets API lỗi ${res.status}: ${err.error?.message ?? res.statusText}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  const allRows = data.values ?? [];
  if (allRows.length < 2) return [];

  // Tìm index cột theo tên header (dòng đầu tiên)
  const headers = (allRows[0] ?? []).map(h => h.trim().toLowerCase());
  const timeIdx   = headers.findIndex(h => h === timeColumnName.toLowerCase());
  const sourceIdx = sourceFilter ? headers.findIndex(h => h === sourceColumnName.toLowerCase()) : -1;

  if (timeIdx === -1) {
    throw new Error(`Không tìm thấy cột "${timeColumnName}" trong header của sheet`);
  }
  if (sourceFilter && sourceIdx === -1) {
    throw new Error(`Không tìm thấy cột "${sourceColumnName}" trong header của sheet`);
  }

  const filterLower = sourceFilter?.toLowerCase().trim();
  const byDay = new Map<string, number>();

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row) continue;
    const raw = row[timeIdx]?.trim();
    if (!raw) continue;

    // Lọc theo nguồn nếu có
    if (filterLower && sourceIdx >= 0) {
      const src = (row[sourceIdx] ?? '').toLowerCase().trim();
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
    if (!date) continue;

    byDay.set(date, (byDay.get(date) ?? 0) + 1);
  }

  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}
