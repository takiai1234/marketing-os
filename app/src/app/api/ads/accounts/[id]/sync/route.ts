// POST /api/ads/accounts/[id]/sync
//
// Manual trigger sync 1 ad account ngay (không đợi cron 04:30 VN).
// Auth check + ownership + status='active' guard + run syncOneAccount.
// Reuse cùng logic với cron — kết quả identical.
//
// Sync mất ~10-60s tuỳ số campaign + amount of insights data → maxDuration 120s.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getAdAccountForUser,
  markAdAccountError,
} from '@/lib/queries/ad-accounts';
import { syncOneAccount } from '@/lib/cron/job-ads-ingestion';

export const runtime = 'nodejs';
export const maxDuration = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const account = await getAdAccountForUser(id, user.userId);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (account.status !== 'active') {
    return NextResponse.json(
      {
        error: `Account đang ở status '${account.status}'. Phải kích hoạt trước khi sync.`,
      },
      { status: 400 }
    );
  }

  try {
    await syncOneAccount({
      id: account.id,
      platform: account.platform,
      externalId: account.externalId,
      name: account.name,
      currency: account.currency,
    });
    return NextResponse.json({
      ok: true,
      message: 'Đã sync xong. Refresh để xem data mới.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[POST /ads/sync] Account ${account.name} FAIL:`, msg);
    await markAdAccountError(account.id, msg.slice(0, 1000));
    return NextResponse.json(
      { error: `Sync fail: ${msg.slice(0, 300)}` },
      { status: 502 }
    );
  }
}
