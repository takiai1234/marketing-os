// POST /api/channels/manual — tạo kênh nhập số liệu thủ công (admin only).
// Body: { name, platform }
//
// Dùng cho nguồn không có API (vd Facebook cá nhân). Tạo social_account với
// is_manual=true, không token/Bundle → cron sync bỏ qua. Admin nhập số liệu
// qua POST /api/channels/[id]/manual-metric.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

const schema = z.object({
  name: z.string().min(1).max(255),
  // Các platform_t hợp lệ cho kênh social (loại ad-only). facebook = mặc định
  // cho profile cá nhân; cũng cho phép nền tảng khác nếu cần nhập tay.
  platform: z.enum([
    'facebook', 'tiktok', 'youtube', 'instagram', 'threads',
    'linkedin', 'pinterest', 'reddit', 'mastodon', 'bluesky', 'twitter', 'zalo',
  ]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Cần name + platform hợp lệ', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, platform } = parsed.data;
  // external_id giả lập, đảm bảo unique theo (platform, external_id).
  const externalId = `manual:${randomBytes(8).toString('hex')}`;

  try {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO social_account
         (platform, external_id, name, status, owner_member_id, kpi_posts_per_day, is_manual)
       VALUES ($1, $2, $3, 'active', $4, 1, true)
       RETURNING id`,
      [platform, externalId, name, user.userId]
    );
    const accountId = rows[0]?.id;
    if (!accountId) throw new Error('insert returned no id');

    // Gán primary để vào Team KPI + nhất quán với kênh khác.
    await db.query(
      `INSERT INTO social_account_member (account_id, member_id, role)
       VALUES ($1, $2, 'primary')
       ON CONFLICT DO NOTHING`,
      [accountId, user.userId]
    );

    return NextResponse.json({ ok: true, accountId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[POST /api/channels/manual]', message);
    return NextResponse.json({ error: 'Không tạo được kênh thủ công' }, { status: 500 });
  }
}
