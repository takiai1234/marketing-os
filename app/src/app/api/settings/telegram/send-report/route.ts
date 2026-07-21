import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { runTelegramReportJob } from '@/lib/cron/job-telegram-report';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return { userId: user.userId };
}

export async function POST(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await runTelegramReportJob();
  return NextResponse.json({ ok: true });
}
