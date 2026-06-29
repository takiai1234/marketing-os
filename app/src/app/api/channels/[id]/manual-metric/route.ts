// POST /api/channels/[id]/manual-metric — nhập số liệu thủ công cho 1 kênh
// is_manual (admin only). Body: { date: 'YYYY-MM-DD', followers?, reach?, engagement? }
//
// Ghi snapshot vào account_metric_daily (upsert theo account_id+date). Admin
// nhập "tổng hiện tại" mỗi lần; reach của kênh manual được dashboard tính kiểu
// tuyệt đối. follower_growth tự tính = followers − followers lần nhập trước.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải YYYY-MM-DD'),
  followers: z.number().int().min(0).nullable().optional(),
  reach: z.number().int().min(0).nullable().optional(),
  engagement: z.number().int().min(0).nullable().optional(),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
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
      { error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, followers, reach, engagement } = parsed.data;
  if (followers == null && reach == null && engagement == null) {
    return NextResponse.json(
      { error: 'Nhập ít nhất 1 chỉ số (followers / reach / engagement).' },
      { status: 400 }
    );
  }

  // Chỉ cho phép kênh is_manual — tránh ghi đè dữ liệu kênh sync thật.
  const acc = await db.query<{ is_manual: boolean }>(
    `SELECT is_manual FROM social_account WHERE id = $1`,
    [id]
  );
  if (acc.rowCount === 0) {
    return NextResponse.json({ error: 'Kênh không tồn tại' }, { status: 404 });
  }
  if (!acc.rows[0]?.is_manual) {
    return NextResponse.json(
      { error: 'Kênh này không phải kênh thủ công (có sync tự động).' },
      { status: 400 }
    );
  }

  const f = followers ?? null;
  const r = reach ?? null;
  const e = engagement ?? null;

  try {
    await db.query(
      `INSERT INTO account_metric_daily
         (account_id, date, followers, follower_growth, total_reach, total_engagement, raw_metrics, updated_at)
       VALUES (
         $1, $2::date,
         -- Carry-forward: để trống ô nào thì lấy giá trị mới nhất trước đó (số
         -- tuyệt đối lũy kế), tránh dòng mới bị 0 làm tụt snapshot.
         COALESCE($3, (SELECT p.followers FROM account_metric_daily p
                         WHERE p.account_id = $1 AND p.date < $2::date
                         ORDER BY p.date DESC LIMIT 1), 0),
         CASE WHEN $3 IS NOT NULL AND $3 > 0
              THEN $3 - COALESCE((SELECT p.followers FROM account_metric_daily p
                                    WHERE p.account_id = $1 AND p.date < $2::date AND p.followers > 0
                                    ORDER BY p.date DESC LIMIT 1), $3)
              ELSE 0 END,
         COALESCE($4, (SELECT p.total_reach FROM account_metric_daily p
                         WHERE p.account_id = $1 AND p.date < $2::date
                         ORDER BY p.date DESC LIMIT 1), 0),
         COALESCE($5, (SELECT p.total_engagement FROM account_metric_daily p
                         WHERE p.account_id = $1 AND p.date < $2::date
                         ORDER BY p.date DESC LIMIT 1), 0),
         '{"source":"manual"}'::jsonb, NOW())
       ON CONFLICT (account_id, date) DO UPDATE SET
         followers        = COALESCE($3, account_metric_daily.followers),
         total_reach      = COALESCE($4, account_metric_daily.total_reach),
         total_engagement = COALESCE($5, account_metric_daily.total_engagement),
         follower_growth  = CASE WHEN $3 IS NOT NULL AND $3 > 0
              THEN $3 - COALESCE((SELECT p.followers FROM account_metric_daily p
                                    WHERE p.account_id = $1 AND p.date < $2::date AND p.followers > 0
                                    ORDER BY p.date DESC LIMIT 1), $3)
              ELSE account_metric_daily.follower_growth END,
         raw_metrics      = '{"source":"manual"}'::jsonb,
         updated_at       = NOW()`,
      [id, date, f, r, e]
    );
    await db.query(`UPDATE social_account SET last_synced_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[POST manual-metric]', message);
    return NextResponse.json({ error: 'Không lưu được số liệu' }, { status: 500 });
  }
}
