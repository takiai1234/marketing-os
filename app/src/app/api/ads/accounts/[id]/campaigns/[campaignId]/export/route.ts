// GET /api/ads/accounts/[id]/campaigns/[campaignId]/export?range=...
//
// Export CSV cho 1 campaign: KPI summary + daily breakdown.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getCampaignDetail } from '@/lib/queries/ad-accounts';
import {
  parseRangeFromSearchParams,
  previousPeriodOf,
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
  params: Promise<{ id: string; campaignId: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { campaignId } = await params;
  if (!UUID_RE.test(campaignId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRangeFromSearchParams(searchParams);
  const prev = previousPeriodOf(range);

  const detail = await getCampaignDetail(campaignId, user.userId, {
    sinceDate: range.from,
    untilDate: range.to,
    prevSinceDate: prev.from,
    prevUntilDate: prev.to,
  });
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { campaign, accountName, accountCurrency, kpiCurrent, kpiPrevious, daily } = detail;
  const currency = accountCurrency;

  // KPI summary CSV
  const kpiCsv = buildCsv(
    ['Metric', `Current (${range.from} → ${range.to})`, `Previous (${prev.from} → ${prev.to})`],
    [
      ['Spend', microsToCsvAmount(kpiCurrent.spendMicros, currency), microsToCsvAmount(kpiPrevious.spendMicros, currency)],
      ['Impressions', kpiCurrent.impressions, kpiPrevious.impressions],
      ['Reach (sum)', kpiCurrent.reach, kpiPrevious.reach],
      ['Frequency', kpiCurrent.frequency.toFixed(2), kpiPrevious.frequency.toFixed(2)],
      ['Clicks', kpiCurrent.clicks, kpiPrevious.clicks],
      ['CTR (%)', (kpiCurrent.ctr * 100).toFixed(4), (kpiPrevious.ctr * 100).toFixed(4)],
      ['CPM', microsToCsvAmount(kpiCurrent.cpmMicros, currency), microsToCsvAmount(kpiPrevious.cpmMicros, currency)],
      ['CPC', microsToCsvAmount(kpiCurrent.cpcMicros, currency), microsToCsvAmount(kpiPrevious.cpcMicros, currency)],
      ['Conversions', kpiCurrent.conversions, kpiPrevious.conversions],
      ['CPA', microsToCsvAmount(kpiCurrent.cpaMicros, currency), microsToCsvAmount(kpiPrevious.cpaMicros, currency)],
      ['ROAS', kpiCurrent.roas ?? '-', kpiPrevious.roas ?? '-'],
    ]
  );

  // Daily breakdown CSV
  const dailyCsv = buildCsv(
    ['Date', 'Spend', 'Impressions', 'Reach', 'Clicks', 'CTR (%)', 'Conversions'],
    daily.map((d) => [
      d.date,
      microsToCsvAmount(d.spendMicros, currency),
      d.impressions,
      d.reach,
      d.clicks,
      d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(4) : '0',
      d.conversions,
    ])
  );

  const csv = [
    `Campaign: ${campaign.name}`,
    `Account: ${accountName}`,
    `Objective: ${campaign.objective}`,
    `Status: ${campaign.status}`,
    `External ID: ${campaign.externalId}`,
    `Currency: ${currency}`,
    `Range: ${range.from} đến ${range.to} (${range.days} ngày)`,
    '',
    'KPI SUMMARY (so với period trước)',
    kpiCsv,
    '',
    'DAILY BREAKDOWN',
    dailyCsv,
  ].join('\r\n');

  const filename = `campaign-${slugify(campaign.name)}-${range.from}-${range.to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': csvDispositionHeader(filename),
    },
  });
}
