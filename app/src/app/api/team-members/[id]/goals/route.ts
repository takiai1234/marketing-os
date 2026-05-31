// PATCH /api/team-members/[id]/goals — admin-only, set 3 goal columns
// trên team_member. Idempotent: gọi nhiều lần cùng body → cùng kết quả.
//
// Validation:
//   - id phải là UUID v4 valid
//   - 3 goal values: int ≥ 0, ≤ HARD_CAP (chống typo nhập 1 tỉ)
//   - reach dùng BIGINT trên DB → JS Number an toàn tới 9e15, không lo overflow
//
// Auth: chỉ admin (role='admin') được set goal. Member tự xem được goal của
// mình nhưng không tự set — quyết định targets là việc của manager.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

// Cap chống typo: 100M followers, 100B reach, 1000 posts/channel/30d.
// Cao hơn mọi case thực tế nhưng vẫn chặn được sai sót dạng "thêm 1 zero".
const HARD_CAP = {
  follow: 100_000_000,
  reach: 100_000_000_000,
  posts: 1000,
} as const;

const bodySchema = z.object({
  goalFollowGrowth30d: z.number().int().min(0).max(HARD_CAP.follow),
  goalReach30d: z.number().int().min(0).max(HARD_CAP.reach),
  goalPostsPerChannel30d: z.number().int().min(0).max(HARD_CAP.posts),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { goalFollowGrowth30d, goalReach30d, goalPostsPerChannel30d } = parsed.data;

  const res = await db.query<{ id: string }>(
    `UPDATE team_member
        SET goal_follow_growth_30d = $2,
            goal_reach_30d = $3,
            goal_posts_per_channel_30d = $4
      WHERE id = $1
     RETURNING id`,
    [id, goalFollowGrowth30d, goalReach30d, goalPostsPerChannel30d]
  );

  // pg's `rowCount` and `rows[0]` are tracked separately by TS — narrow
  // explicitly on the row to satisfy strictNullChecks.
  const updated = res.rows[0];
  if (!updated) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    id: updated.id,
    goals: { goalFollowGrowth30d, goalReach30d, goalPostsPerChannel30d },
  });
}
