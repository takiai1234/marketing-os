// Cron job — daily ingest FB Ads insights cho mọi ad_account active.
//
// Schedule: 30 21 * * *  UTC = 04:30 VN — sau khi FB API ổn định cho dữ
// liệu ngày VN hôm qua nhưng trước khi user mở app sáng (06:00).
//
// Flow per account:
//   1. Decrypt user token
//   2. Refresh campaign list qua /act_<id>/campaigns
//   3. Fetch account-level insights 30 ngày (level=account, daily breakdown)
//   4. Fetch campaign-level insights 30 ngày (level=campaign, daily breakdown)
//   5. Upsert ad_metric_daily rows
//   6. Update last_synced_at + clear last_error
// Errors per-account isolated — 1 account fail không kill cron.

import { db } from '@/lib/db';
import {
  listActiveAdAccounts,
  upsertCampaign,
  deleteStaleCampaigns,
  upsertMetric,
  markAdAccountSynced,
  markAdAccountError,
} from '@/lib/queries/ad-accounts';
import {
  fetchCampaigns,
  fetchAdInsights,
  spendStringToMicros,
  getResultCount,
  sumConversions,
  sumActionValues,
  mapObjectiveToEnum,
  type FBAdInsight,
} from '@/lib/fb/ads-api-client';
import { decryptToken } from '@/lib/fb/token-encryption';

/** ISO YYYY-MM-DD cho FB time_range param */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Convert FB date_start "YYYY-MM-DD" → JS Date (UTC midnight) */
function parseFbDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

const DAYS_BACK = 30;

async function getEncryptedToken(adAccountId: string): Promise<Buffer | null> {
  const res = await db.query<{ encrypted_token: Buffer | null }>(
    `SELECT encrypted_token FROM ad_account WHERE id = $1`,
    [adAccountId]
  );
  return res.rows[0]?.encrypted_token ?? null;
}

export async function syncOneAccount(account: {
  id: string;
  platform: string;
  externalId: string;
  name: string;
  currency: string;
}): Promise<void> {
  if (account.platform !== 'facebook') {
    // Phase 1 chỉ FB
    return;
  }

  const encryptedToken = await getEncryptedToken(account.id);
  if (!encryptedToken) {
    await markAdAccountError(account.id, 'Token không có (FB OAuth chưa hoàn tất)');
    return;
  }

  let token: string;
  try {
    token = await decryptToken(encryptedToken);
  } catch (err) {
    await markAdAccountError(account.id, `Decrypt token fail: ${(err as Error).message}`);
    return;
  }

  const until = new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS_BACK);

  // ─── 1. Refresh campaigns + cleanup stale ──────────────────────────────
  try {
    const campaigns = await fetchCampaigns(token, account.externalId);
    console.log(
      `[ads-ingestion] Account ${account.name}: fetched ${campaigns.length} campaigns from FB`
    );
    for (const c of campaigns) {
      await upsertCampaign({
        adAccountId: account.id,
        externalId: c.id,
        name: c.name,
        objective: mapObjectiveToEnum(c.objective),
        status: c.effective_status ?? c.status ?? 'unknown',
        // FB: daily_budget là cents string. Convert sang micros.
        dailyBudgetMicros: c.daily_budget ? spendStringToMicros(c.daily_budget) : null,
        lifetimeBudgetMicros: c.lifetime_budget ? spendStringToMicros(c.lifetime_budget) : null,
        startTime: c.start_time ? new Date(c.start_time) : null,
        endTime: c.stop_time ? new Date(c.stop_time) : null,
      });
    }

    // Cleanup: xoá campaigns NOT trong fetch hiện tại (FB đã delete chúng,
    // hoặc data từ test app trước còn sót). Cascade xoá ad_metric_daily.
    if (campaigns.length > 0) {
      const currentCampaignIds = campaigns.map((c) => c.id);
      const stale = await deleteStaleCampaigns(account.id, currentCampaignIds);
      if (stale > 0) {
        console.log(
          `[ads-ingestion] Account ${account.name}: deleted ${stale} stale campaigns`
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ads-ingestion] Campaigns fetch fail ${account.name}: ${msg.slice(0, 200)}`
    );
    // Không quit — vẫn thử pull insights
  }

  // ─── 2. Map campaign external_id → DB id + objective (để link metrics) ──
  const campaignMapRes = await db.query<{ external_id: string; id: string; objective: string }>(
    `SELECT external_id, id, objective FROM ad_campaign WHERE ad_account_id = $1`,
    [account.id]
  );
  const campaignIdMap = new Map<string, string>();
  const campaignObjectiveMap = new Map<string, string>();
  for (const r of campaignMapRes.rows) {
    campaignIdMap.set(r.external_id, r.id);
    campaignObjectiveMap.set(r.external_id, r.objective);
  }

  // ─── 3. Account-level daily insights ────────────────────────────────────
  try {
    const insights = await fetchAdInsights(token, account.externalId, {
      level: 'account',
      since: isoDate(since),
      until: isoDate(until),
      daily: true,
    });
    for (const ins of insights) {
      await upsertOneInsight(account.id, null, ins, account.currency);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markAdAccountError(
      account.id,
      `Account insights fail: ${msg.slice(0, 300)}`
    );
    return;
  }

  // ─── 4. Campaign-level daily insights ──────────────────────────────────
  try {
    const insights = await fetchAdInsights(token, account.externalId, {
      level: 'campaign',
      since: isoDate(since),
      until: isoDate(until),
      daily: true,
    });
    for (const ins of insights) {
      const campaignDbId = ins.campaign_id
        ? campaignIdMap.get(ins.campaign_id) ?? null
        : null;
      const objective = ins.campaign_id
        ? campaignObjectiveMap.get(ins.campaign_id)
        : undefined;
      await upsertOneInsight(account.id, campaignDbId, ins, account.currency, objective);
    }
  } catch (err) {
    // Campaign-level fail không kill toàn cron — account-level đã thành công
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ads-ingestion] Campaign insights fetch fail ${account.name}: ${msg.slice(0, 200)}`
    );
  }

  await markAdAccountSynced(account.id);
}

async function upsertOneInsight(
  adAccountId: string,
  campaignId: string | null,
  ins: FBAdInsight,
  currency: string,
  objective?: string
): Promise<void> {
  // FB returns spend in smallest currency unit. Cents (USD) hoặc đồng (VND).
  // VND: 1 unit = 1 đồng → ×1_000_000 = micros. USD: 1 cent = 0.01 USD → ×10_000.
  // → branch theo currency:
  const spendCents = ins.spend ? parseFloat(ins.spend) : 0;
  const spendMicros =
    currency === 'VND'
      ? Math.round(spendCents * 1_000_000)
      : Math.round(spendCents * 10_000);

  const impressions = parseInt(ins.impressions ?? '0', 10) || 0;
  const reach = parseInt(ins.reach ?? '0', 10) || 0;
  const clicks = parseInt(ins.clicks ?? '0', 10) || 0;
  const ctr = ins.ctr ? parseFloat(ins.ctr) : null;
  const cpmCents = ins.cpm ? parseFloat(ins.cpm) : null;
  const cpcCents = ins.cpc ? parseFloat(ins.cpc) : null;
  const conversions = getResultCount(ins.actions, objective);
  const revenue = sumActionValues(ins.action_values);
  const roas = spendCents > 0 ? revenue / spendCents : null;

  const cpmMicros =
    cpmCents !== null
      ? currency === 'VND'
        ? Math.round(cpmCents * 1_000_000)
        : Math.round(cpmCents * 10_000)
      : null;
  const cpcMicros =
    cpcCents !== null
      ? currency === 'VND'
        ? Math.round(cpcCents * 1_000_000)
        : Math.round(cpcCents * 10_000)
      : null;

  await upsertMetric({
    adAccountId,
    campaignId,
    adExternalId: null,
    date: parseFbDate(ins.date_start),
    spendMicros,
    impressions,
    reach,
    clicks,
    conversions,
    cpmMicros,
    cpcMicros,
    ctr,
    roas,
    extraMetrics: {
      frequency: ins.frequency ? parseFloat(ins.frequency) : null,
      revenue,
      actions: ins.actions ?? [],
      objective: objective ?? null,
    },
  });
}

export async function runAdsIngestionJob(): Promise<void> {
  const startedAt = new Date();
  console.log(`[ads-ingestion] Starting at ${startedAt.toISOString()}`);

  let totalAccounts = 0;
  let okCount = 0;
  let failCount = 0;

  try {
    const accounts = await listActiveAdAccounts();
    totalAccounts = accounts.length;
    console.log(`[ads-ingestion] Active ad accounts: ${totalAccounts}`);

    for (const account of accounts) {
      try {
        await syncOneAccount({
          id: account.id,
          platform: account.platform,
          externalId: account.externalId,
          name: account.name,
          currency: account.currency,
        });
        okCount++;
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[ads-ingestion] Account ${account.name} FAIL: ${msg.slice(0, 300)}`
        );
        await markAdAccountError(account.id, msg.slice(0, 1000));
      }
    }
  } catch (err) {
    console.error('[ads-ingestion] Top-level error:', err);
  }

  const ms = Date.now() - startedAt.getTime();
  console.log(
    `[ads-ingestion] Done in ${ms}ms — ok ${okCount}/${totalAccounts}, fail ${failCount}`
  );
}
