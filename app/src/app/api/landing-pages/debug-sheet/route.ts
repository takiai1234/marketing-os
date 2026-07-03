// GET /api/landing-pages/debug-sheet?id=<landing_page_id>
// Đọc sheet, trả về: tổng rows, unique Nguồn values, số rows match filter hiện tại

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getAccessToken } from '@/lib/google/oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { rows } = await db.query<{
    sheet_id: string;
    sheet_name: string;
    sheet_source_filter: string | null;
  }>(`SELECT sheet_id, sheet_name, sheet_source_filter FROM landing_page WHERE id = $1`, [id]);

  const page = rows[0];
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!page.sheet_id || !page.sheet_name) return NextResponse.json({ error: 'Sheet chưa cấu hình' }, { status: 400 });

  const accessToken = await getAccessToken();
  const range = encodeURIComponent(page.sheet_name);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${page.sheet_id}/values/${range}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return NextResponse.json({ error: `Sheets API: ${err.error?.message ?? res.statusText}` }, { status: 502 });
  }

  const data = (await res.json()) as { values?: string[][] };
  const allRows = data.values ?? [];
  if (allRows.length === 0) return NextResponse.json({ totalRows: 0, headers: [], nguonValues: [] });

  const headers = (allRows[0] ?? []).map(h => h.trim());
  const nguonIdx = headers.findIndex(h => h.toLowerCase() === 'nguồn');
  const timeIdx = headers.findIndex(h => h.toLowerCase() === 'thời gian');
  const dataRows = allRows.slice(1);

  // Đếm unique Nguồn values (top 20)
  const nguonCount = new Map<string, number>();
  for (const row of dataRows) {
    const val = (nguonIdx >= 0 ? row[nguonIdx] : '')?.trim() ?? '';
    nguonCount.set(val, (nguonCount.get(val) ?? 0) + 1);
  }
  const nguonValues = [...nguonCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([value, count]) => ({ value, count }));

  // Đếm rows match filter
  const filter = page.sheet_source_filter?.toLowerCase().trim();
  const matchCount = filter && nguonIdx >= 0
    ? dataRows.filter(row => (row[nguonIdx] ?? '').toLowerCase().includes(filter)).length
    : null;

  return NextResponse.json({
    totalDataRows: dataRows.length,
    headers,
    timeColumnFound: timeIdx >= 0 ? headers[timeIdx] : null,
    nguonColumnFound: nguonIdx >= 0 ? headers[nguonIdx] : null,
    currentFilter: page.sheet_source_filter,
    rowsMatchingFilter: matchCount,
    nguonTopValues: nguonValues,
  });
}
