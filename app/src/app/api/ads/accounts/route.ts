// GET /api/ads/accounts — list user's ad accounts (active + pending + error)

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  listAdAccountsForUser,
  getAccountSummaries,
} from '@/lib/queries/ad-accounts';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [accounts, summaries] = await Promise.all([
    listAdAccountsForUser(user.userId),
    getAccountSummaries(user.userId, 30),
  ]);

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      ...a,
      summary: summaries[a.id] ?? null,
    })),
  });
}
