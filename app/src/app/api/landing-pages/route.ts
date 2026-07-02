// GET  /api/landing-pages — danh sách landing pages với sessions + leads 30d
// POST /api/landing-pages — tạo landing page mới

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  pagePath: z.string().min(1).max(500),
  ga4PropertyId: z.string().min(1).max(50),
  accountId: z.string().uuid().nullable().optional(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Lấy team_id từ user
  const teamRes = await db.query<{ team_id: string }>(
    `SELECT team_id FROM team_member WHERE id = $1`,
    [user.userId]
  );
  const teamId = teamRes.rows[0]?.team_id;
  if (!teamId) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  const { rows } = await db.query<{
    id: string;
    name: string;
    page_path: string;
    ga4_property_id: string;
    account_id: string | null;
    account_name: string | null;
    is_active: boolean;
    sessions_30d: string;
    leads_30d: string;
  }>(
    `SELECT
       lp.id,
       lp.name,
       lp.page_path,
       lp.ga4_property_id,
       lp.account_id,
       sa.name AS account_name,
       lp.is_active,
       COALESCE(SUM(lpd.sessions) FILTER (WHERE lpd.date >= CURRENT_DATE - 29), 0)::text AS sessions_30d,
       COALESCE(SUM(lpc.conversion_count) FILTER (WHERE lpc.occurred_date >= CURRENT_DATE - 29), 0)::text AS leads_30d
     FROM landing_page lp
     LEFT JOIN social_account sa ON sa.id = lp.account_id
     LEFT JOIN landing_page_daily lpd ON lpd.landing_page_id = lp.id
     LEFT JOIN landing_page_conversion lpc ON lpc.account_id = lp.account_id
     WHERE lp.team_id = $1
     GROUP BY lp.id, sa.name
     ORDER BY lp.name`,
    [teamId]
  );

  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    pagePath: r.page_path,
    ga4PropertyId: r.ga4_property_id,
    accountId: r.account_id,
    accountName: r.account_name,
    isActive: r.is_active,
    sessions30d: parseInt(r.sessions_30d, 10),
    leads30d: parseInt(r.leads_30d, 10),
    conversionRate:
      parseInt(r.sessions_30d, 10) > 0
        ? (parseInt(r.leads_30d, 10) / parseInt(r.sessions_30d, 10)) * 100
        : null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() }, { status: 400 });
  }

  const teamRes = await db.query<{ team_id: string }>(
    `SELECT team_id FROM team_member WHERE id = $1`, [user.userId]
  );
  const teamId = teamRes.rows[0]?.team_id;
  if (!teamId) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  const { name, pagePath, ga4PropertyId, accountId } = parsed.data;

  try {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO landing_page (team_id, name, page_path, ga4_property_id, account_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [teamId, name, pagePath, ga4PropertyId, accountId ?? null]
    );
    return NextResponse.json({ id: rows[0]?.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg.includes('unique')) {
      return NextResponse.json({ error: 'Landing page này đã tồn tại (trùng property + path)' }, { status: 409 });
    }
    console.error('[POST /api/landing-pages]', msg);
    return NextResponse.json({ error: 'Không lưu được' }, { status: 500 });
  }
}
