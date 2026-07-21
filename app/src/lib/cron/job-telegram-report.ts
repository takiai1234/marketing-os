// Cron job: gửi báo cáo marketing tổng quan lên Telegram group lúc 07:00 VN.
// Dữ liệu: KPI hôm qua (1 ngày) + 7 ngày qua, top 5 kênh, tổng ads.
// Env vars cần thiết: TELEGRAM_BOT_TOKEN, TELEGRAM_REPORT_CHAT_ID.

import { fetchKpiData } from '@/lib/queries/dashboard-kpi';
import { fetchChannelsTable } from '@/lib/queries/dashboard-channels-table';
import { db } from '@/lib/db';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_CHAT_ID_KEY } from '@/app/api/settings/telegram/route';

// ─── Telegram helper ────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  const [token, chatId] = await Promise.all([
    getSettingOrEnv(TELEGRAM_BOT_TOKEN_KEY),
    getSettingOrEnv(TELEGRAM_CHAT_ID_KEY),
  ]);
  if (!token || !chatId) {
    console.warn('[telegram-report] TELEGRAM_BOT_TOKEN hoặc TELEGRAM_REPORT_CHAT_ID chưa set — bỏ qua');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API lỗi ${res.status}: ${body}`);
  }
}

// ─── Format helpers ──────────────────────────────────────────────────────

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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Ads summary query (không dùng userId — query toàn bộ active accounts) ──

interface AdsSummary {
  spendMicros: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

async function fetchAdsSummary(sinceDate: string, untilDate: string): Promise<AdsSummary> {
  const res = await db.query<{
    spend: string;
    conversions: string;
    impressions: string;
    clicks: string;
  }>(
    `SELECT
       COALESCE(SUM(m.spend_micros), 0)::TEXT AS spend,
       COALESCE(SUM(m.conversions), 0)::TEXT  AS conversions,
       COALESCE(SUM(m.impressions), 0)::TEXT  AS impressions,
       COALESCE(SUM(m.clicks), 0)::TEXT       AS clicks
     FROM ad_metric_daily m
     INNER JOIN ad_account aa ON aa.id = m.ad_account_id
     WHERE m.campaign_id IS NOT NULL
       AND aa.status = 'active'
       AND m.date >= $1::DATE
       AND m.date <= $2::DATE`,
    [sinceDate, untilDate]
  );
  const r = res.rows[0];
  return {
    spendMicros: Number(r?.spend ?? 0),
    conversions: Number(r?.conversions ?? 0),
    impressions: Number(r?.impressions ?? 0),
    clicks: Number(r?.clicks ?? 0),
  };
}

// ─── Main job ────────────────────────────────────────────────────────────

export async function runTelegramReportJob(): Promise<void> {
  console.log('[telegram-report] bắt đầu build báo cáo...');

  // Ngày tham chiếu: hôm qua (VN) — cron chạy 07:00 VN, data hôm qua đã đủ
  const nowVn = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
  );
  const yesterday = new Date(nowVn);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayIso = isoDate(nowVn);
  const yesterdayIso = isoDate(yesterday);

  const sevenDaysAgo = new Date(nowVn);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoIso = isoDate(sevenDaysAgo);

  const fourteenDaysAgo = new Date(nowVn);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoIso = isoDate(fourteenDaysAgo);

  // Fetch song song: KPI hôm qua, KPI 7 ngày, top kênh hôm qua, top kênh 7 ngày, ads
  const [kpi1d, kpi7d, channels1d, channels7d, ads1d, ads7d] = await Promise.all([
    fetchKpiData(0, null, {
      sinceIso: yesterdayIso,
      untilIso: yesterdayIso,
      prevSinceIso: isoDate(new Date(yesterday.getTime() - 86400_000)),
      prevUntilIso: isoDate(new Date(yesterday.getTime() - 86400_000)),
    }),
    fetchKpiData(0, null, {
      sinceIso: sevenDaysAgoIso,
      untilIso: yesterdayIso,
      prevSinceIso: fourteenDaysAgoIso,
      prevUntilIso: isoDate(new Date(sevenDaysAgo.getTime() - 86400_000)),
    }),
    fetchChannelsTable(1, null, { sinceIso: yesterdayIso, untilIso: yesterdayIso }),
    fetchChannelsTable(7, null, { sinceIso: sevenDaysAgoIso, untilIso: yesterdayIso }),
    fetchAdsSummary(yesterdayIso, yesterdayIso),
    fetchAdsSummary(sevenDaysAgoIso, yesterdayIso),
  ]);

  // Top 5 kênh theo reach (hôm qua)
  const top5 = channels1d.slice(0, 5);

  // CPA = spend / conversions
  const cpa1d =
    ads1d.conversions > 0
      ? fmtVnd((ads1d.spendMicros / ads1d.conversions) * 1000)
      : 'N/A';
  const cpa7d =
    ads7d.conversions > 0
      ? fmtVnd((ads7d.spendMicros / ads7d.conversions) * 1000)
      : 'N/A';

  // Tiêu đề ngày
  const weekdays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayLabel = weekdays[yesterday.getDay()];
  const dateLabel = `${dayLabel} ${yesterday.getDate().toString().padStart(2, '0')}/${(yesterday.getMonth() + 1).toString().padStart(2, '0')}`;

  // Build tin nhắn
  const lines: string[] = [
    `📊 <b>BÁO CÁO MARKETING — ${dateLabel}</b>`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📅 <b>HÔM QUA</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    `👁 Reach:          <b>${fmtNum(kpi1d.reach)}</b>${delta(kpi1d.reach, kpi1d.reachPrev)}`,
    `💬 Leads:          <b>${fmtNum(kpi1d.conversions)}</b>${delta(kpi1d.conversions, kpi1d.conversionsPrev)}`,
    `❤️ ER:             <b>${kpi1d.avgEr.toFixed(2)}%</b>${delta(kpi1d.avgEr, kpi1d.avgErPrev)}`,
    `👥 Followers:      <b>${fmtNum(kpi1d.totalFollowers)}</b>${delta(kpi1d.totalFollowers, kpi1d.totalFollowersPrev)}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📆 <b>7 NGÀY QUA</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    `👁 Reach:          <b>${fmtNum(kpi7d.reach)}</b>${delta(kpi7d.reach, kpi7d.reachPrev)}`,
    `💬 Leads:          <b>${fmtNum(kpi7d.conversions)}</b>${delta(kpi7d.conversions, kpi7d.conversionsPrev)}`,
    `❤️ ER:             <b>${kpi7d.avgEr.toFixed(2)}%</b>${delta(kpi7d.avgEr, kpi7d.avgErPrev)}`,
    `👥 Followers:      <b>${fmtNum(kpi7d.totalFollowers)}</b>${delta(kpi7d.totalFollowers, kpi7d.totalFollowersPrev)}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '🏆 <b>TOP KÊNH HÔM QUA</b> (theo Reach)',
    '━━━━━━━━━━━━━━━━━━━━',
    ...top5.map((ch, i) => {
      const platIcon: Record<string, string> = {
        facebook: '📘', tiktok: '🎵', youtube: '▶️', instagram: '📸',
      };
      const icon = platIcon[ch.platform] ?? '📡';
      return `${i + 1}. ${icon} ${ch.name}\n    👁 ${fmtNum(ch.reach)}  💬 ${fmtNum(ch.leads)} leads`;
    }),
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '💰 <b>ADS</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    `Hôm qua:   Chi ${fmtVnd(ads1d.spendMicros)} · ${fmtNum(ads1d.conversions)} conv · CPA ${cpa1d}`,
    `7 ngày:    Chi ${fmtVnd(ads7d.spendMicros)} · ${fmtNum(ads7d.conversions)} conv · CPA ${cpa7d}`,
  ];

  const message = lines.join('\n');

  await sendTelegram(message);
  console.log('[telegram-report] đã gửi báo cáo thành công');
}
