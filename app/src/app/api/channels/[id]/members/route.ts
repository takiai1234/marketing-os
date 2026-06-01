// GET  /api/channels/[id]/members — list members + role (any authenticated user)
// PUT  /api/channels/[id]/members — replace full member set (admin only)
//
// Body shape cho PUT:
//   { members: [{ memberId: UUID, role: 'primary' | 'editor' }, ...] }
//
// Validation:
//   - Mỗi memberId UUID v4
//   - role enum strict
//   - Không cho duplicate memberId trong cùng request (UNIQUE constraint sẽ
//     throw nhưng ta validate sớm để return 400 thay vì 500)
//   - Empty array OK = bỏ tất cả member (kênh thành "mồ côi")
//
// Behavior: setChannelMembers chạy trong transaction — DELETE all + INSERT
// + UPDATE owner_member_id (first primary) atomically. Caller xem trạng
// thái mới qua GET /api/channels/[id]/members hoặc router.refresh().

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import {
  fetchChannelMembers,
  setChannelMembers,
} from '@/lib/queries/channel-members';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const memberSchema = z.object({
  memberId: z.string().regex(UUID_RE, 'Invalid member UUID'),
  role: z.enum(['primary', 'editor']),
});

const putBodySchema = z.object({
  members: z.array(memberSchema).max(20, 'Tối đa 20 member / kênh'),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
  }

  const members = await fetchChannelMembers(id);
  return NextResponse.json({ members });
}

export async function PUT(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only: thay đổi member assignment là quyết định quản lý
  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
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

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Anti-duplicate (Set check) — UNIQUE constraint sẽ throw 500 nếu bỏ qua,
  // ta catch sớm để return 400 + message friendly.
  const seen = new Set<string>();
  for (const m of parsed.data.members) {
    if (seen.has(m.memberId)) {
      return NextResponse.json(
        { error: `Member ${m.memberId} bị duplicate trong request` },
        { status: 400 }
      );
    }
    seen.add(m.memberId);
  }

  // Rule A enforcement: MAX 1 primary per channel. DB cũng có partial
  // unique index nhưng catch ở đây để return 400 thân thiện thay vì 500.
  const primaryCount = parsed.data.members.filter(
    (m) => m.role === 'primary'
  ).length;
  if (primaryCount > 1) {
    return NextResponse.json(
      {
        error:
          'Chỉ 1 primary / kênh. Đổi các primary khác thành editor trước khi gửi.',
      },
      { status: 400 }
    );
  }

  try {
    await setChannelMembers(id, parsed.data.members);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const members = await fetchChannelMembers(id);
  return NextResponse.json({ ok: true, members });
}
