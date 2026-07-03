// GET /api/landing-pages/debug-ga4?propertyId=362645470
// Trả về top 50 page paths thực tế trong GA4 property (7 ngày gần nhất).
// Dùng để admin kiểm tra đúng path trước khi nhập vào landing page.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getAccessToken, isGoogleConnected } from '@/lib/google/oauth';
import { fetchGa4Sessions } from '@/lib/google/ga4-client';

export const runtime = 'nodejs';

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Step 1: check OAuth
  const connected = await isGoogleConnected();
  if (!connected) {
    return NextResponse.json({
      error: 'Google chưa kết nối. Vào /settings/integrations → Kết nối Google Analytics.'
    }, { status: 400 });
  }

  // Step 2: thử lấy access token
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({
      error: 'Lấy access token thất bại: ' + (err instanceof Error ? err.message : String(err))
    }, { status: 500 });
  }

  const propertyId = new URL(req.url).searchParams.get('propertyId');
  if (!propertyId) {
    return NextResponse.json({
      ok: true,
      message: 'Google đã kết nối, access token OK. Thêm ?propertyId=362645470 để xem paths.',
      accessTokenPreview: accessToken.slice(0, 20) + '...',
    });
  }

  // Step 3: fetch GA4
  try {
    const rows = await fetchGa4Sessions(propertyId, nDaysAgo(7), nDaysAgo(0));

    const byPath = new Map<string, number>();
    for (const r of rows) {
      byPath.set(r.pagePath, (byPath.get(r.pagePath) ?? 0) + r.sessions);
    }

    const sorted = [...byPath.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([path, sessions]) => ({ path, sessions }));

    return NextResponse.json({
      propertyId,
      totalRows: rows.length,
      totalPaths: byPath.size,
      paths: sorted,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'GA4 API lỗi: ' + (err instanceof Error ? err.message : String(err)),
      propertyId,
    }, { status: 500 });
  }
}
