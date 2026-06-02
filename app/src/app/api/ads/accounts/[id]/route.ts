// PATCH  /api/ads/accounts/[id] — { action: 'activate' | 'disconnect' }
// DELETE /api/ads/accounts/[id] — xoá hoàn toàn

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  activateAdAccount,
  disconnectAdAccount,
  deleteAdAccount,
  getAdAccountForUser,
} from '@/lib/queries/ad-accounts';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  action: z.enum(['activate', 'disconnect']),
});

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  let ok = false;
  if (parsed.data.action === 'activate') {
    ok = await activateAdAccount(id, user.userId);
  } else {
    ok = await disconnectAdAccount(id, user.userId);
  }
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const account = await getAdAccountForUser(id, user.userId);
  return NextResponse.json({ account });
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const ok = await deleteAdAccount(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
