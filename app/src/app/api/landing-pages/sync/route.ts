// POST /api/landing-pages/sync — manual trigger GA4 sync (admin only)
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { runGa4SyncJob } from '@/lib/cron/job-ga4-sync';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((await getUserRole(user.userId)) !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  try {
    await runGa4SyncJob();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync thất bại';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
