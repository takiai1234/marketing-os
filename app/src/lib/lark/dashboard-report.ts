// Build Lark interactive card từ Marketing OS dashboard KPI data.
// Card format: https://open.larksuite.com/document/server-docs/im-v1/message/create

import { type KpiData } from '@/lib/queries/dashboard-kpi';

function pct(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+∞%' : '—';
  const change = ((cur - prev) / prev) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('vi-VN');
}

function fmtVnd(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B ₫`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₫`;
  return `${n.toLocaleString('vi-VN')} ₫`;
}

export function buildDashboardCard(
  kpi: KpiData,
  rangeLabel: string,
  dashboardUrl: string
): object {
  const rows = [
    { label: 'Followers', value: fmtNumber(kpi.totalFollowers), change: pct(kpi.totalFollowers, kpi.totalFollowersPrev), up: kpi.totalFollowers >= kpi.totalFollowersPrev },
    { label: 'Reach', value: fmtNumber(kpi.reach), change: pct(kpi.reach, kpi.reachPrev), up: kpi.reach >= kpi.reachPrev },
    { label: 'Leads', value: fmtNumber(kpi.conversions), change: pct(kpi.conversions, kpi.conversionsPrev), up: kpi.conversions >= kpi.conversionsPrev },
    { label: 'Doanh thu', value: fmtVnd(kpi.revenue), change: pct(kpi.revenue, kpi.revenuePrev), up: kpi.revenue >= kpi.revenuePrev },
    { label: 'Avg ER', value: `${kpi.avgEr.toFixed(2)}%`, change: pct(kpi.avgEr, kpi.avgErPrev), up: kpi.avgEr >= kpi.avgErPrev },
  ];

  const lines = rows.map((r) => {
    const icon = r.up ? '🟢' : '🔴';
    return `**${r.label}**: ${r.value}  ${icon} ${r.change}`;
  }).join('\n');

  return {
    elements: [
      {
        tag: 'div',
        text: { content: lines, tag: 'lark_md' },
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { content: 'Xem Dashboard', tag: 'plain_text' },
            url: dashboardUrl,
            type: 'primary',
          },
        ],
      },
    ],
    header: {
      title: { content: `📈 Marketing Dashboard — ${rangeLabel}`, tag: 'plain_text' },
      template: 'blue',
    },
  };
}
