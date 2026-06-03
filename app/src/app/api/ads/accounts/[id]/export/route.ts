// GET /api/ads/accounts/[id]/export?range=30d|7d|14d|90d|custom&from=&to=
//
// Export CSV cho 1 ad account: daily metrics + campaign list summary.
// Output filename: ads-<account-slug>-<from>-<to>.csv

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getAdAccountForUser,
  getAccountMetricsDaily,
  listCampaignsWithSummary,
} from '@/lib/queries/ad-accounts';
import {
  parseRangeFromSearchParams,
} from '@/lib/ads/date-ranges';
import {
  buildCsv,
  microsToCsvAmount,
  slugify,
  csvDispositionHeader,
} from '@/lib/ads/csv-export';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string }>;
}

const OBJECTIVE_LABEL: Record<string, string> = {
  awareness: 'Awareness',
  traffic: 'Traffic',
  engagement: 'Engagement',
  leads: 'Leads',
  app_promotion: 'App Promotion',
  sales: 'Sales',
  video_views: 'Video Views',
  messages: 'Messages',
  unknown: '-',
};

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const account = await getAdAccountForUser(id, user.userId);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRangeFromSearchParams(searchParams);

  const [daily, campaigns] = await Promise.all([
    getAccountMetricsDaily(id, user.userId, {
      sinceDate: range.from,
      untilDate: range.to,
    }),
    listCampaignsWithSummary(id, user.userId, {
      sinceDate: range.from,
      untilDate: range.to,
    }),
  ]);

  // Build CSV với 2 sections: daily breakdown + campaign summary
  const dailyCsv = buildCsv(
    ['Date', 'Spend', 'Impressions', 'Reach', 'Clicks', 'CTR (%)', 'Conversions'],
    daily.map((d) => [
      d.date,
      microsToCsvAmount(d.spendMicros, account.currency),
      d.impressions,
      d.reach,
      d.clicks,
      d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(4) : '0',
      d.conversions,
    ])
  );

  const campaignCsv = buildCsv(
    [
      'Campaign Name',
      'External ID',
      'Objective',
      'Status',
      `Spend ${range.days}d`,
      'Impressions',
      'Clicks',
      'CTR (%)',
      'Conversions',
    ],
    campaigns.map((c) => [
      c.name,
      c.externalId,
      OBJECTIVE_LABEL[c.objective] ?? c.objective,
      c.status,
      c.summary30d ? microsToCsvAmount(c.summary30d.spendMicros, account.currency) : '0',
      c.summary30d?.impressions ?? 0,
      c.summary30d?.clicks ?? 0,
      c.summary30d ? (c.summary30d.ctr * 100).toFixed(4) : '0',
      c.summary30d?.conversions ?? 0,
    ])
  );

  // Concat 2 sections với title rows
  const csv = [
    `Account: ${account.name}`,
    `Currency: ${account.currency}`,
    `Range: ${range.from} đến ${range.to} (${range.days} ngày)`,
    '',
    'DAILY BREAKDOWN',
    dailyCsv,
    '',
    'CAMPAIGN SUMMARY',
    campaignCsv,
  ].join('\r\n');

  const filename = `ads-${slugify(account.name)}-${range.from}-${range.to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': csvDispositionHeader(filename),
    },
  });
}
