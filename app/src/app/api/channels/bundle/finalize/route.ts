// POST /api/channels/bundle/finalize
// Body: { stateToken: string }
//
// Internal endpoint called by the /channels server page when it detects the
// Bundle redirect (?bundle_session=...). Could be called via GET too but POST
// makes the side-effect-y semantics explicit.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { finalizeBundleSession } from '@/lib/bundle/finalize';

export const runtime = 'nodejs';

const schema = z.object({
  stateToken: z.string().min(16).max(128),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'stateToken required' }, { status: 400 });
  }

  const result = await finalizeBundleSession({
    stateToken: parsed.data.stateToken,
    currentUserId: user.userId,
  });

  if (!result.ok) {
    const status =
      result.reason === 'not_found'         ? 404 :
      result.reason === 'forbidden'         ? 403 :
      result.reason === 'expired'           ? 410 :
      result.reason === 'not_connected_yet' ? 409 :
                                              502;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({
    channelId: result.channelId,
    platform: result.platform,
    alreadyCompleted: result.alreadyCompleted,
  });
}
