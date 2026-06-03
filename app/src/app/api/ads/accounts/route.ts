// GET /api/ads/accounts — list user's ad accounts (active + pending + error)

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  listAdAccountsForUser,
  getAccountSummaries,
} from '@/lib/queries/ad-accounts';
import { buildPresetRange } from '@/lib/ads/date-ranges';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // API mặc định 30d (chưa expose range param qua JSON API — UI server page
  // dùng query string riêng để pull range custom).
  const range = buildPresetRange('30d');
  const [accounts, summaries] = await Promise.all([
    listAdAccountsForUser(user.userId),
    getAccountSummaries(user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      ...a,
      summary: summaries[a.id] ?? null,
    })),
  });
}
