// Google Sheets API v4 — đọc cột Thời gian, đếm leads theo ngày.
// Dùng: GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}

import { getAccessToken } from './oauth';

export interface SheetLeadRow {
  date: string;  // 'YYYY-MM-DD'
  count: number;
}

/**
 * Đọc cột thời gian từ sheet, đếm số leads theo ngày.
 * @param spreadsheetId  VD: '1OdOFIYD6NRfMLp6PkpQGs4guJhg8WSrFe9noIWWaJPQ'
 * @param sheetName      Tên tab, VD: 'Sheet1' hoặc 'DATA PHẾU 2025'
 * @param timeColumn     Cột chứa timestamp, VD: 'A' (default)
 * @param startRow       Bắt đầu từ dòng nào (default 2 — bỏ qua header)
 */
export async function fetchSheetLeadsByDay(
  spreadsheetId: string,
  sheetName: string,
  timeColumn = 'A',
  startRow = 2
): Promise<SheetLeadRow[]> {
  const accessToken = await getAccessToken();

  // Lấy toàn bộ cột thời gian
  const range = encodeURIComponent(`${sheetName}!${timeColumn}${startRow}:${timeColumn}`);
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

  // Đếm theo ngày
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const raw = row[0]?.trim();
    if (!raw) continue;

    // Parse các format phổ biến:
    // '2026-04-08 11:06:37' → '2026-04-08'
    // '08/04/2026 11:06:37' → '2026-04-08'
    // '2026-04-08' → '2026-04-08'
    let date: string | null = null;

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      date = raw.slice(0, 10);
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      const [d, m, y] = raw.split(/[\/ ]/);
      date = `${y}-${m}-${d}`;
    } else {
      // Thử Date.parse
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().slice(0, 10);
      }
    }

    if (date) {
      byDay.set(date, (byDay.get(date) ?? 0) + 1);
    }
  }

  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}
