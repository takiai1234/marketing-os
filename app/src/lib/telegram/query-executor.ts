// Nhận Intent từ intent-parser, query DB, format câu trả lời Telegram.

import { fetchKpiData } from '@/lib/queries/dashboard-kpi';
import { fetchChannelsTable } from '@/lib/queries/dashboard-channels-table';
import { db } from '@/lib/db';
import type { Intent, DatePreset } from './intent-parser';

// ─── Date range helper ────────────────────────────────────────────────────

interface DateRange {
  sinceIso: string;
  untilIso: string;
  prevSinceIso: string;
  prevUntilIso: string;
  label: string;
  days: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getDateRange(preset: DatePreset): DateRange {
  const nowVn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const today = new Date(nowVn.getFullYear(), nowVn.getMonth(), nowVn.getDate());

  switch (preset) {
    case 'today': {
      const since = today;
      const until = today;
      const prevSince = addDays(today, -1);
      return { sinceIso: isoDate(since), untilIso: isoDate(until), prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevSince), label: 'Hôm nay', days: 1 };
    }
    case 'yesterday': {
      const since = addDays(today, -1);
      const until = addDays(today, -1);
      const prevSince = addDays(today, -2);
      return { sinceIso: isoDate(since), untilIso: isoDate(until), prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevSince), label: 'Hôm qua', days: 1 };
    }
    case '7d': {
      const since = addDays(today, -7);
      const until = addDays(today, -1);
      const prevSince = addDays(today, -14);
      const prevUntil = addDays(today, -8);
      return { sinceIso: isoDate(since), untilIso: isoDate(until), prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevUntil), label: '7 ngày qua', days: 7 };
    }
    case 'this_month': {
      const since = new Date(today.getFullYear(), today.getMonth(), 1);
      const until = addDays(today, -1);
      const prevSince = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevUntil = new Date(today.getFullYear(), today.getMonth(), 0);
      return { sinceIso: isoDate(since), untilIso: isoDate(until), prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevUntil), label: 'Tháng này', days: today.getDate() - 1 };
    }
    case 'last_month': {
      const since = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const until = new Date(today.getFullYear(), today.getMonth(), 0);
      const prevSince = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const prevUntil = new Date(today.getFullYear(), today.getMonth() - 1, 0);
      return { sinceIso: isoDate(since), untilIso: isoDate(until), prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevUntil), label: 'Tháng trước', days: until.getDate() };
    }
    default: { // 30d
      const since = addDays(today, -30);
      const until = addDays(today, -1);
      const prevSince = addDays(today, -60);
      const prevUntil = addDays(today, -31);
      return { sinceIso: isoDate(since), untilIso: isoDate(until), prevSinceIso: isoDate(prevSince), prevUntilIso: isoDate(prevUntil), label: '30 ngày qua', days: 30 };
    }
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('vi-VN');
}

function fmtVnd(micros: number): string {
  const vnd = micros / 1_000_000;
  if (vnd >= 1_000_000) return (vnd / 1_000_000).toFixed(1) + 'M₫';
  if (vnd >= 1_000) return Math.round(vnd / 1_000) + 'K₫';
  return Math.round(vnd).toLocaleString('vi-VN') + '₫';
}

function delta(cur: number, prev: number): string {
  if (prev === 0) return '';
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct >= 0 ? '▲' : '▼';
  return ` ${sign}${Math.abs(pct).toFixed(1)}%`;
}

// ─── Executors ────────────────────────────────────────────────────────────

async function execKpi(range: DateRange): Promise<string> {
  const kpi = await fetchKpiData(0, null, {
    sinceIso: range.sinceIso,
    untilIso: range.untilIso,
    prevSinceIso: range.prevSinceIso,
    prevUntilIso: range.prevUntilIso,
  });

  return [
    `📊 <b>KPI — ${range.label}</b>`,
    `👁 Reach:       <b>${fmtNum(kpi.reach)}</b>${delta(kpi.reach, kpi.reachPrev)}`,
    `💬 Leads:       <b>${fmtNum(kpi.conversions)}</b>${delta(kpi.conversions, kpi.conversionsPrev)}`,
    `❤️ ER:          <b>${kpi.avgEr.toFixed(2)}%</b>${delta(kpi.avgEr, kpi.avgErPrev)}`,
    `👥 Followers:   <b>${fmtNum(kpi.totalFollowers)}</b>${delta(kpi.totalFollowers, kpi.totalFollowersPrev)}`,
  ].join('\n');
}

async function execChannels(range: DateRange, channelName?: string): Promise<string> {
  const rows = await fetchChannelsTable(range.days, null, {
    sinceIso: range.sinceIso,
    untilIso: range.untilIso,
  });

  if (channelName) {
    const ch = rows.find((r) => r.name.toLowerCase().includes(channelName.toLowerCase()));
    if (!ch) return `❓ Không tìm thấy kênh "<b>${channelName}</b>".`;
    const platIcon: Record<string, string> = { facebook: '📘', tiktok: '🎵', youtube: '▶️', instagram: '📸' };
    return [
      `${platIcon[ch.platform] ?? '📡'} <b>${ch.name}</b> — ${range.label}`,
      `👁 Reach: <b>${fmtNum(ch.reach)}</b>`,
      `💬 Leads: <b>${fmtNum(ch.leads)}</b>`,
      `❤️ ER: <b>${ch.engagementRate.toFixed(2)}%</b>`,
      `👥 Followers: <b>${ch.followers !== null ? fmtNum(ch.followers) : '—'}</b>`,
      `📝 Bài đăng: <b>${ch.postsCount}</b>`,
    ].join('\n');
  }

  const top = rows.slice(0, 7);
  const platIcon: Record<string, string> = { facebook: '📘', tiktok: '🎵', youtube: '▶️', instagram: '📸' };
  const lines = top.map((ch, i) =>
    `${i + 1}. ${platIcon[ch.platform] ?? '📡'} ${ch.name}\n    👁 ${fmtNum(ch.reach)}  💬 ${fmtNum(ch.leads)} leads`
  );
  return [`🏆 <b>Top kênh — ${range.label}</b>`, ...lines].join('\n');
}

async function execAds(range: DateRange): Promise<string> {
  const res = await db.query<{
    spend: string; conversions: string; impressions: string; clicks: string;
  }>(
    `SELECT
       COALESCE(SUM(m.spend_micros), 0)::TEXT AS spend,
       COALESCE(SUM(m.conversions), 0)::TEXT  AS conversions,
       COALESCE(SUM(m.impressions), 0)::TEXT  AS impressions,
       COALESCE(SUM(m.clicks), 0)::TEXT       AS clicks
     FROM ad_metric_daily m
     INNER JOIN ad_account aa ON aa.id = m.ad_account_id
     WHERE m.campaign_id IS NOT NULL AND aa.status = 'active'
       AND m.date >= $1::DATE AND m.date <= $2::DATE`,
    [range.sinceIso, range.untilIso]
  );
  const r = res.rows[0];
  const spend = Number(r?.spend ?? 0);
  const conv = Number(r?.conversions ?? 0);
  const imp = Number(r?.impressions ?? 0);
  const clicks = Number(r?.clicks ?? 0);
  const cpa = conv > 0 ? fmtVnd((spend / conv) * 1000) : 'N/A';
  const ctr = imp > 0 ? ((clicks / imp) * 100).toFixed(2) + '%' : 'N/A';

  return [
    `💰 <b>Ads — ${range.label}</b>`,
    `💸 Chi tiêu:    <b>${fmtVnd(spend)}</b>`,
    `🎯 Conversions: <b>${fmtNum(conv)}</b>`,
    `📢 Impressions: <b>${fmtNum(imp)}</b>`,
    `🖱 Clicks:      <b>${fmtNum(clicks)}</b>  CTR ${ctr}`,
    `💡 CPA:         <b>${cpa}</b>`,
  ].join('\n');
}

async function execPosts(range: DateRange): Promise<string> {
  const res = await db.query<{
    name: string; platform: string; title: string | null;
    reach: string; reactions: string; comments: string; shares: string;
  }>(
    `SELECT sa.name, sa.platform,
       LEFT(sp.caption, 60) AS title,
       COALESCE(SUM(pmd.reach), 0)::TEXT       AS reach,
       COALESCE(SUM(pmd.reactions), 0)::TEXT   AS reactions,
       COALESCE(SUM(pmd.comments), 0)::TEXT    AS comments,
       COALESCE(SUM(pmd.shares), 0)::TEXT      AS shares
     FROM post_metric_daily pmd
     INNER JOIN social_post sp ON sp.id = pmd.post_id
     INNER JOIN social_account sa ON sa.id = sp.account_id
     WHERE sa.status != 'disconnected'
       AND pmd.date >= $1::DATE AND pmd.date <= $2::DATE
     GROUP BY sa.name, sa.platform, sp.caption, sp.id
     ORDER BY SUM(pmd.reach) DESC
     LIMIT 5`,
    [range.sinceIso, range.untilIso]
  );

  if (res.rows.length === 0) return `📝 Không có bài đăng nào trong ${range.label}.`;

  const platIcon: Record<string, string> = { facebook: '📘', tiktok: '🎵', youtube: '▶️', instagram: '📸' };
  const lines = res.rows.map((row, i) => {
    const title = row.title ? row.title.replace(/\n/g, ' ').trim() : '(không có caption)';
    const engagement = Number(row.reactions) + Number(row.comments) + Number(row.shares);
    return `${i + 1}. ${platIcon[row.platform] ?? '📡'} ${row.name}\n    "${title}"\n    👁 ${fmtNum(Number(row.reach))}  ❤️ ${fmtNum(engagement)}`;
  });

  return [`📝 <b>Top bài viral — ${range.label}</b>`, ...lines].join('\n');
}

// ─── Main executor ────────────────────────────────────────────────────────

export async function executeIntent(intent: Intent, _question: string): Promise<string> {
  const range = getDateRange(intent.datePreset);

  switch (intent.metric) {
    case 'kpi':      return execKpi(range);
    case 'channels': return execChannels(range, intent.channelName);
    case 'ads':      return execAds(range);
    case 'posts':    return execPosts(range);
    case 'messages': return execKpi(range); // fallback về KPI (leads include messages)
    default:         return execKpi(range);
  }
}
