// GET /api/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
// Read-only analytics endpoint cho dashboard điều hành nội bộ.
// Auth: x-api-key header, so với DASHBOARD_API_KEY env (timing-safe).
// Không dùng session/cookie. Không ghi/sửa/xoá bất kỳ bảng nào.

import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ─── Auth ────────────────────────────────────────────────────────────────────

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

function checkApiKey(req: NextRequest): boolean {
  const expected = process.env.DASHBOARD_API_KEY;
  const previous = process.env.DASHBOARD_API_KEY_PREVIOUS;
  if (!expected) return false;

  const provided = req.headers.get('x-api-key');
  if (!provided) return false;

  const hProvided = sha256(provided);
  const hExpected = sha256(expected);

  if (timingSafeEqual(hProvided, hExpected)) return true;

  if (previous) {
    const hPrevious = sha256(previous);
    if (timingSafeEqual(hProvided, hPrevious)) return true;
  }

  return false;
}

// ─── Date validation ─────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Queries ─────────────────────────────────────────────────────────────────

async function queryAdSpend(from: string, to: string): Promise<number | null> {
  const res = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(spend_micros), 0)::text AS total
     FROM ad_metric_daily
     WHERE date >= $1::date AND date <= $2::date`,
    [from, to]
  );
  const val = parseFloat(res.rows[0]?.total ?? '0');
  // Trả VND (micros / 1_000_000)
  return val > 0 ? Math.round(val / 1_000_000) : null;
}

async function queryLeads(from: string, to: string): Promise<number | null> {
  // Lead = Ladipage conversions + tin nhắn active + manual leads
  const res = await db.query<{ total: string }>(
    `SELECT COALESCE(
       (SELECT SUM(conversion_count) FROM landing_page_conversion
        WHERE occurred_date >= $1::date AND occurred_date <= $2::date),
       0
     ) +
     COALESCE(
       (SELECT SUM(pmd.active_conversations) FROM page_message_daily pmd
        WHERE pmd.date >= $1::date AND pmd.date <= $2::date),
       0
     ) +
     COALESCE(
       (SELECT SUM(amd.manual_leads) FROM account_metric_daily amd
        JOIN social_account sa ON sa.id = amd.account_id
        WHERE sa.is_manual AND sa.status != 'disconnected'
          AND amd.date >= $1::date AND amd.date <= $2::date),
       0
     ) AS total`,
    [from, to]
  );
  const val = parseInt(res.rows[0]?.total ?? '0', 10);
  return val > 0 ? val : null;
}

async function queryReach(from: string, to: string): Promise<number | null> {
  const res = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(total_reach), 0)::text AS total
     FROM account_metric_daily
     WHERE date >= $1::date AND date <= $2::date`,
    [from, to]
  );
  const val = parseInt(res.rows[0]?.total ?? '0', 10);
  return val > 0 ? val : null;
}

async function queryFollowers(): Promise<number | null> {
  const res = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(followers), 0)::text AS total
     FROM (
       SELECT DISTINCT ON (account_id) followers
       FROM account_metric_daily
       WHERE followers IS NOT NULL
       ORDER BY account_id, date DESC
     ) latest`,
    []
  );
  const val = parseInt(res.rows[0]?.total ?? '0', 10);
  return val > 0 ? val : null;
}

interface DailyRow {
  date: string;
  ad_spend_vnd: string;
  leads: string;
  reach: string;
}

async function queryDaily(from: string, to: string): Promise<{ date: string; adSpendVnd?: number; leads?: number; reach?: number }[]> {
  const res = await db.query<DailyRow>(
    `WITH dates AS (
       SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
     ),
     spend AS (
       SELECT date, SUM(spend_micros) / 1000000 AS v
       FROM ad_metric_daily
       WHERE date >= $1::date AND date <= $2::date
       GROUP BY date
     ),
     leads_lp AS (
       SELECT occurred_date AS date, SUM(conversion_count) AS v
       FROM landing_page_conversion
       WHERE occurred_date >= $1::date AND occurred_date <= $2::date
       GROUP BY occurred_date
     ),
     leads_msg AS (
       SELECT date, SUM(active_conversations) AS v
       FROM page_message_daily
       WHERE date >= $1::date AND date <= $2::date
       GROUP BY date
     ),
     leads_manual AS (
       SELECT amd.date, SUM(amd.manual_leads) AS v
       FROM account_metric_daily amd
       JOIN social_account sa ON sa.id = amd.account_id
       WHERE sa.is_manual AND sa.status != 'disconnected'
         AND amd.date >= $1::date AND amd.date <= $2::date
       GROUP BY amd.date
     ),
     reach AS (
       SELECT date, SUM(total_reach) AS v
       FROM account_metric_daily
       WHERE date >= $1::date AND date <= $2::date
       GROUP BY date
     )
     SELECT
       dates.d::text AS date,
       COALESCE(spend.v, 0)::text AS ad_spend_vnd,
       (COALESCE(leads_lp.v, 0) + COALESCE(leads_msg.v, 0) + COALESCE(leads_manual.v, 0))::text AS leads,
       COALESCE(reach.v, 0)::text AS reach
     FROM dates
     LEFT JOIN spend ON spend.date = dates.d
     LEFT JOIN leads_lp ON leads_lp.date = dates.d
     LEFT JOIN leads_msg ON leads_msg.date = dates.d
     LEFT JOIN leads_manual ON leads_manual.date = dates.d
     LEFT JOIN reach ON reach.date = dates.d
     ORDER BY dates.d ASC`,
    [from, to]
  );

  return res.rows.map((r) => {
    const row: { date: string; adSpendVnd?: number; leads?: number; reach?: number } = { date: r.date };
    const spend = Math.round(parseFloat(r.ad_spend_vnd));
    const leads = parseInt(r.leads, 10);
    const reach = parseInt(r.reach, 10);
    if (spend > 0) row.adSpendVnd = spend;
    if (leads > 0) row.leads = leads;
    if (reach > 0) row.reach = reach;
    return row;
  }).filter((r) => r.adSpendVnd !== undefined || r.leads !== undefined || r.reach !== undefined);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: 'API key không hợp lệ' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const fromParam = sp.get('from');
  const toParam = sp.get('to');

  // Defaults: 30 ngày gần nhất (VN timezone)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const defaultTo = toIsoDate(now);
  const defaultFrom = toIsoDate(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

  const fromStr = fromParam ?? defaultFrom;
  const toStr = toParam ?? defaultTo;

  if (!DATE_RE.test(fromStr)) {
    return NextResponse.json({ error: '`from` phải là YYYY-MM-DD' }, { status: 400 });
  }
  if (!DATE_RE.test(toStr)) {
    return NextResponse.json({ error: '`to` phải là YYYY-MM-DD' }, { status: 400 });
  }

  const fromDate = parseDate(fromStr);
  const toDate = parseDate(toStr);

  if (!fromDate) return NextResponse.json({ error: '`from` không hợp lệ' }, { status: 400 });
  if (!toDate) return NextResponse.json({ error: '`to` không hợp lệ' }, { status: 400 });
  if (fromDate > toDate) return NextResponse.json({ error: '`from` phải nhỏ hơn hoặc bằng `to`' }, { status: 400 });

  const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 366) {
    return NextResponse.json({ error: 'Khoảng thời gian tối đa 366 ngày' }, { status: 400 });
  }

  const [adSpend, leads, reach, followers, daily] = await Promise.all([
    queryAdSpend(fromStr, toStr),
    queryLeads(fromStr, toStr),
    queryReach(fromStr, toStr),
    queryFollowers(),
    queryDaily(fromStr, toStr),
  ]);

  // customKpis — chỉ trả field có giá trị thực
  const customKpis: { key: string; label: string; value: number; unit: string; hint?: string }[] = [];
  if (adSpend !== null) {
    customKpis.push({
      key: 'adSpend',
      label: 'Chi phí quảng cáo',
      value: adSpend,
      unit: 'currency',
      hint: 'Tổng spend FB Ads trong kỳ (VND)',
    });
  }
  if (leads !== null) {
    customKpis.push({
      key: 'leadsGenerated',
      label: 'Lead thu được',
      value: leads,
      unit: 'count',
      hint: 'Ladipage conversions + tin nhắn active + nhập tay',
    });
  }
  if (reach !== null) {
    customKpis.push({
      key: 'totalReach',
      label: 'Tổng Reach',
      value: reach,
      unit: 'count',
      hint: 'Tổng lượt tiếp cận trên tất cả Facebook Pages trong kỳ',
    });
  }
  if (followers !== null) {
    customKpis.push({
      key: 'totalFollowers',
      label: 'Tổng Followers',
      value: followers,
      unit: 'count',
      hint: 'Tổng followers hiện tại của tất cả Facebook Pages',
    });
  }

  const body: Record<string, unknown> = {
    from: fromStr,
    to: toStr,
  };

  if (customKpis.length > 0) body.customKpis = customKpis;
  if (daily.length > 0) body.daily = daily;

  return NextResponse.json(body);
}
