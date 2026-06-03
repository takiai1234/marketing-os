// DB queries cho ad_account + ad_campaign + ad_metric_daily.
// Privacy: query owner_id filter mọi nơi.

import { db } from '@/lib/db';

export type AdPlatform = 'facebook' | 'google' | 'tiktok';
export type AdAccountStatus = 'pending' | 'active' | 'disconnected' | 'error';

export interface AdAccount {
  id: string;
  ownerId: string;
  platform: AdPlatform;
  externalId: string;
  name: string;
  currency: string;
  timezone: string | null;
  status: AdAccountStatus;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  /** Business Manager metadata — null cho personal ad account */
  businessManagerId: string | null;
  businessManagerName: string | null;
}

interface AdAccountRow {
  id: string;
  owner_id: string;
  platform: AdPlatform;
  external_id: string;
  name: string;
  currency: string;
  timezone: string | null;
  status: AdAccountStatus;
  connected_at: string | null;
  disconnected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  business_manager_id: string | null;
  business_manager_name: string | null;
}

function mapAdAccount(row: AdAccountRow): AdAccount {
  return {
    id: row.id,
    ownerId: row.owner_id,
    platform: row.platform,
    externalId: row.external_id,
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    status: row.status,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    businessManagerId: row.business_manager_id,
    businessManagerName: row.business_manager_name,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export async function listAdAccountsForUser(userId: string): Promise<AdAccount[]> {
  const res = await db.query<AdAccountRow>(
    `SELECT id, owner_id, platform, external_id, name, currency, timezone,
            status, connected_at::TEXT, disconnected_at::TEXT,
            last_synced_at::TEXT, last_error, created_at::TEXT,
            business_manager_id, business_manager_name
       FROM ad_account
      WHERE owner_id = $1
      ORDER BY CASE status
                 WHEN 'active' THEN 1
                 WHEN 'pending' THEN 2
                 WHEN 'error' THEN 3
                 ELSE 4
               END,
              created_at DESC`,
    [userId]
  );
  return res.rows.map(mapAdAccount);
}

export async function getAdAccountForUser(
  id: string,
  userId: string
): Promise<AdAccount | null> {
  const res = await db.query<AdAccountRow>(
    `SELECT id, owner_id, platform, external_id, name, currency, timezone,
            status, connected_at::TEXT, disconnected_at::TEXT,
            last_synced_at::TEXT, last_error, created_at::TEXT,
            business_manager_id, business_manager_name
       FROM ad_account
      WHERE id = $1 AND owner_id = $2`,
    [id, userId]
  );
  return res.rows[0] ? mapAdAccount(res.rows[0]) : null;
}

/** Upsert ad_account khi user OAuth discover được — nếu đã có (cùng owner +
 *  platform + external_id) thì update name/currency/timezone, KHÔNG đổi status
 *  để giữ user choice (vd active → user disconnected → reconnect: giữ
 *  disconnected unless explicit). */
export interface UpsertAdAccountInput {
  ownerId: string;
  platform: AdPlatform;
  externalId: string;
  name: string;
  currency: string;
  timezone: string | null;
  businessManagerId?: string | null;
  businessManagerName?: string | null;
}

export async function upsertAdAccount(input: UpsertAdAccountInput): Promise<AdAccount> {
  const res = await db.query<AdAccountRow>(
    `INSERT INTO ad_account
       (owner_id, platform, external_id, name, currency, timezone,
        business_manager_id, business_manager_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (owner_id, platform, external_id) DO UPDATE
       SET name = EXCLUDED.name,
           currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone,
           -- Update BM info nếu input có (không clobber bằng null nếu input null)
           business_manager_id = COALESCE(EXCLUDED.business_manager_id, ad_account.business_manager_id),
           business_manager_name = COALESCE(EXCLUDED.business_manager_name, ad_account.business_manager_name),
           updated_at = NOW()
     RETURNING id, owner_id, platform, external_id, name, currency, timezone,
               status, connected_at::TEXT, disconnected_at::TEXT,
               last_synced_at::TEXT, last_error, created_at::TEXT,
               business_manager_id, business_manager_name`,
    [
      input.ownerId,
      input.platform,
      input.externalId,
      input.name,
      input.currency,
      input.timezone,
      input.businessManagerId ?? null,
      input.businessManagerName ?? null,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to upsert ad account');
  return mapAdAccount(row);
}

/** Activate — user click "Kết nối" trong UI sau khi see list pending */
export async function activateAdAccount(id: string, userId: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE ad_account
        SET status = 'active', connected_at = NOW(), updated_at = NOW(),
            disconnected_at = NULL, last_error = NULL
      WHERE id = $1 AND owner_id = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function disconnectAdAccount(id: string, userId: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE ad_account
        SET status = 'disconnected', disconnected_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND owner_id = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markAdAccountError(id: string, error: string): Promise<void> {
  await db.query(
    `UPDATE ad_account
        SET status = 'error', last_error = $2, updated_at = NOW()
      WHERE id = $1`,
    [id, error.slice(0, 1000)]
  );
}

/** Mark stale ad_accounts: rows của user mà external_id KHÔNG có trong
 *  current FB fetch → mark disconnected với note "Không thuộc scope hiện tại".
 *  Dùng trong OAuth callback để cleanup khi user đổi FB App hoặc revoke
 *  permission cho subset account. Return số lượng marked.
 */
export async function markStaleAdAccounts(
  ownerId: string,
  platform: AdPlatform,
  currentExternalIds: string[]
): Promise<number> {
  if (currentExternalIds.length === 0) {
    // Edge case: user revoke hết permission → đừng mass-disconnect, để user
    // manual review. Skip để tránh accident.
    return 0;
  }
  const res = await db.query(
    `UPDATE ad_account
        SET status = 'disconnected',
            disconnected_at = NOW(),
            updated_at = NOW(),
            last_error = 'Không có trong scope FB app hiện tại — có thể do đổi app hoặc revoke. Xoá nếu không cần.'
      WHERE owner_id = $1
        AND platform = $2
        AND status != 'disconnected'
        AND NOT (external_id = ANY($3::TEXT[]))`,
    [ownerId, platform, currentExternalIds]
  );
  return res.rowCount ?? 0;
}

export async function markAdAccountSynced(id: string): Promise<void> {
  await db.query(
    `UPDATE ad_account
        SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE id = $1`,
    [id]
  );
}

export async function deleteAdAccount(id: string, userId: string): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM ad_account WHERE id = $1 AND owner_id = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ─── Campaign queries ───────────────────────────────────────────────────

export interface AdCampaign {
  id: string;
  adAccountId: string;
  externalId: string;
  name: string;
  objective: string;
  status: string;
  dailyBudgetMicros: number | null;
  lifetimeBudgetMicros: number | null;
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
}

export async function listCampaignsForAccount(
  adAccountId: string,
  userId: string
): Promise<AdCampaign[]> {
  const res = await db.query<{
    id: string;
    ad_account_id: string;
    external_id: string;
    name: string;
    objective: string;
    status: string;
    daily_budget_micros: string | null;
    lifetime_budget_micros: string | null;
    start_time: string | null;
    end_time: string | null;
    created_at: string;
  }>(
    `SELECT c.id, c.ad_account_id, c.external_id, c.name, c.objective, c.status,
            c.daily_budget_micros::TEXT, c.lifetime_budget_micros::TEXT,
            c.start_time::TEXT, c.end_time::TEXT, c.created_at::TEXT
       FROM ad_campaign c
       JOIN ad_account a ON a.id = c.ad_account_id
      WHERE c.ad_account_id = $1 AND a.owner_id = $2
      ORDER BY c.created_at DESC`,
    [adAccountId, userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    adAccountId: r.ad_account_id,
    externalId: r.external_id,
    name: r.name,
    objective: r.objective,
    status: r.status,
    dailyBudgetMicros: r.daily_budget_micros !== null ? Number(r.daily_budget_micros) : null,
    lifetimeBudgetMicros: r.lifetime_budget_micros !== null ? Number(r.lifetime_budget_micros) : null,
    startTime: r.start_time,
    endTime: r.end_time,
    createdAt: r.created_at,
  }));
}

export interface UpsertCampaignInput {
  adAccountId: string;
  externalId: string;
  name: string;
  objective: 'awareness' | 'traffic' | 'engagement' | 'leads' | 'app_promotion' | 'sales' | 'video_views' | 'messages' | 'unknown';
  status: string;
  dailyBudgetMicros: number | null;
  lifetimeBudgetMicros: number | null;
  startTime: Date | null;
  endTime: Date | null;
}

/** Xoá ad_campaign rows mà external_id KHÔNG có trong fetch hiện tại
 *  cho 1 ad_account. Cascade tự xoá ad_metric_daily rows liên quan (FK).
 *  Trả số lượng deleted để log.
 *
 *  Edge case: nếu currentExternalIds rỗng (FB API fail / no campaigns
 *  được trả), SKIP để tránh accident wipe toàn bộ.
 */
export async function deleteStaleCampaigns(
  adAccountId: string,
  currentExternalIds: string[]
): Promise<number> {
  if (currentExternalIds.length === 0) return 0;
  const res = await db.query(
    `DELETE FROM ad_campaign
      WHERE ad_account_id = $1
        AND NOT (external_id = ANY($2::TEXT[]))`,
    [adAccountId, currentExternalIds]
  );
  return res.rowCount ?? 0;
}

export async function upsertCampaign(input: UpsertCampaignInput): Promise<void> {
  await db.query(
    `INSERT INTO ad_campaign
       (ad_account_id, external_id, name, objective, status,
        daily_budget_micros, lifetime_budget_micros, start_time, end_time)
     VALUES ($1, $2, $3, $4::ad_objective_t, $5, $6, $7, $8, $9)
     ON CONFLICT (ad_account_id, external_id) DO UPDATE
       SET name = EXCLUDED.name,
           objective = EXCLUDED.objective,
           status = EXCLUDED.status,
           daily_budget_micros = EXCLUDED.daily_budget_micros,
           lifetime_budget_micros = EXCLUDED.lifetime_budget_micros,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           updated_at = NOW()`,
    [
      input.adAccountId,
      input.externalId,
      input.name,
      input.objective,
      input.status,
      input.dailyBudgetMicros,
      input.lifetimeBudgetMicros,
      input.startTime,
      input.endTime,
    ]
  );
}

// ─── Metric queries ─────────────────────────────────────────────────────

export interface UpsertMetricInput {
  adAccountId: string;
  campaignId: string | null;
  adExternalId: string | null;
  date: Date;
  spendMicros: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  cpmMicros: number | null;
  cpcMicros: number | null;
  ctr: number | null;
  roas: number | null;
  extraMetrics?: Record<string, unknown>;
}

export async function upsertMetric(input: UpsertMetricInput): Promise<void> {
  await db.query(
    `INSERT INTO ad_metric_daily
       (ad_account_id, campaign_id, ad_external_id, date,
        spend_micros, impressions, reach, clicks, conversions,
        cpm_micros, cpc_micros, ctr, roas, extra_metrics)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
     ON CONFLICT (ad_account_id, campaign_id, ad_external_id, date) DO UPDATE
       SET spend_micros = EXCLUDED.spend_micros,
           impressions = EXCLUDED.impressions,
           reach = EXCLUDED.reach,
           clicks = EXCLUDED.clicks,
           conversions = EXCLUDED.conversions,
           cpm_micros = EXCLUDED.cpm_micros,
           cpc_micros = EXCLUDED.cpc_micros,
           ctr = EXCLUDED.ctr,
           roas = EXCLUDED.roas,
           extra_metrics = EXCLUDED.extra_metrics`,
    [
      input.adAccountId,
      input.campaignId,
      input.adExternalId,
      input.date,
      input.spendMicros,
      input.impressions,
      input.reach,
      input.clicks,
      input.conversions,
      input.cpmMicros,
      input.cpcMicros,
      input.ctr,
      input.roas,
      JSON.stringify(input.extraMetrics ?? {}),
    ]
  );
}

/** Aggregate metrics for last N days per account (for /ads overview). */
export interface AccountSummary {
  adAccountId: string;
  totalSpendMicros: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgCtr: number;
  avgCpmMicros: number | null;
  daysOfData: number;
}

export async function getAccountSummaries(
  userId: string,
  days = 30
): Promise<Record<string, AccountSummary>> {
  const res = await db.query<{
    ad_account_id: string;
    total_spend: string;
    total_impressions: string;
    total_clicks: string;
    total_conversions: string;
    avg_ctr: string | null;
    avg_cpm: string | null;
    days: string;
  }>(
    `SELECT
        m.ad_account_id,
        COALESCE(SUM(m.spend_micros), 0)::TEXT  AS total_spend,
        COALESCE(SUM(m.impressions), 0)::TEXT   AS total_impressions,
        COALESCE(SUM(m.clicks), 0)::TEXT        AS total_clicks,
        COALESCE(SUM(m.conversions), 0)::TEXT   AS total_conversions,
        AVG(m.ctr)::TEXT                         AS avg_ctr,
        AVG(m.cpm_micros)::TEXT                  AS avg_cpm,
        COUNT(DISTINCT m.date)::TEXT             AS days
      FROM ad_metric_daily m
      JOIN ad_account a ON a.id = m.ad_account_id
     WHERE a.owner_id = $1
       AND m.campaign_id IS NULL  -- account-level rows only
       AND m.date >= CURRENT_DATE - INTERVAL '${days} days'
     GROUP BY m.ad_account_id`,
    [userId]
  );

  const map: Record<string, AccountSummary> = {};
  for (const r of res.rows) {
    map[r.ad_account_id] = {
      adAccountId: r.ad_account_id,
      totalSpendMicros: Number(r.total_spend),
      totalImpressions: Number(r.total_impressions),
      totalClicks: Number(r.total_clicks),
      totalConversions: Number(r.total_conversions),
      avgCtr: r.avg_ctr !== null ? Number(r.avg_ctr) : 0,
      avgCpmMicros: r.avg_cpm !== null ? Number(r.avg_cpm) : null,
      daysOfData: Number(r.days),
    };
  }
  return map;
}

// ─── Detail page queries ────────────────────────────────────────────────

export interface DailyMetricPoint {
  date: string;              // ISO 'YYYY-MM-DD'
  spendMicros: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
}

/** 30-day daily metrics — account-level only (campaign_id IS NULL).
 *  Used for trend chart trên /ads/[id]. */
export async function getAccountMetricsDaily(
  adAccountId: string,
  userId: string,
  days = 30
): Promise<DailyMetricPoint[]> {
  const res = await db.query<{
    date: string;
    spend_micros: string;
    impressions: string;
    reach: string;
    clicks: string;
    conversions: string;
  }>(
    `SELECT
        m.date::TEXT,
        m.spend_micros::TEXT,
        m.impressions::TEXT,
        m.reach::TEXT,
        m.clicks::TEXT,
        m.conversions::TEXT
      FROM ad_metric_daily m
      JOIN ad_account a ON a.id = m.ad_account_id
     WHERE m.ad_account_id = $1
       AND a.owner_id = $2
       AND m.campaign_id IS NULL
       AND m.date >= CURRENT_DATE - INTERVAL '${days} days'
     ORDER BY m.date ASC`,
    [adAccountId, userId]
  );
  return res.rows.map((r) => ({
    date: r.date,
    spendMicros: Number(r.spend_micros),
    impressions: Number(r.impressions),
    reach: Number(r.reach),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
  }));
}

export interface CampaignWithSummary extends AdCampaign {
  summary30d: {
    spendMicros: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
  } | null;
}

/** Campaign list + 30d totals — table /ads/[id]. */
export async function listCampaignsWithSummary(
  adAccountId: string,
  userId: string,
  days = 30
): Promise<CampaignWithSummary[]> {
  const res = await db.query<{
    id: string;
    ad_account_id: string;
    external_id: string;
    name: string;
    objective: string;
    status: string;
    daily_budget_micros: string | null;
    lifetime_budget_micros: string | null;
    start_time: string | null;
    end_time: string | null;
    created_at: string;
    total_spend: string | null;
    total_impressions: string | null;
    total_clicks: string | null;
    total_conversions: string | null;
  }>(
    `SELECT
        c.id, c.ad_account_id, c.external_id, c.name, c.objective, c.status,
        c.daily_budget_micros::TEXT, c.lifetime_budget_micros::TEXT,
        c.start_time::TEXT, c.end_time::TEXT, c.created_at::TEXT,
        COALESCE(SUM(m.spend_micros), 0)::TEXT  AS total_spend,
        COALESCE(SUM(m.impressions), 0)::TEXT   AS total_impressions,
        COALESCE(SUM(m.clicks), 0)::TEXT        AS total_clicks,
        COALESCE(SUM(m.conversions), 0)::TEXT   AS total_conversions
      FROM ad_campaign c
      JOIN ad_account a ON a.id = c.ad_account_id
      LEFT JOIN ad_metric_daily m
        ON m.campaign_id = c.id
       AND m.date >= CURRENT_DATE - INTERVAL '${days} days'
     WHERE c.ad_account_id = $1 AND a.owner_id = $2
     GROUP BY c.id
     ORDER BY COALESCE(SUM(m.spend_micros), 0) DESC, c.created_at DESC`,
    [adAccountId, userId]
  );

  return res.rows.map((r) => {
    const spendMicros = Number(r.total_spend);
    const impressions = Number(r.total_impressions);
    const clicks = Number(r.total_clicks);
    const conversions = Number(r.total_conversions);
    const hasData = spendMicros > 0 || impressions > 0;
    return {
      id: r.id,
      adAccountId: r.ad_account_id,
      externalId: r.external_id,
      name: r.name,
      objective: r.objective,
      status: r.status,
      dailyBudgetMicros: r.daily_budget_micros !== null ? Number(r.daily_budget_micros) : null,
      lifetimeBudgetMicros: r.lifetime_budget_micros !== null ? Number(r.lifetime_budget_micros) : null,
      startTime: r.start_time,
      endTime: r.end_time,
      createdAt: r.created_at,
      summary30d: hasData
        ? {
            spendMicros,
            impressions,
            clicks,
            conversions,
            ctr: impressions > 0 ? clicks / impressions : 0,
          }
        : null,
    };
  });
}

/** All active ad accounts — used by cron job to know which to sync. */
export async function listActiveAdAccounts(): Promise<AdAccount[]> {
  const res = await db.query<AdAccountRow>(
    `SELECT id, owner_id, platform, external_id, name, currency, timezone,
            status, connected_at::TEXT, disconnected_at::TEXT,
            last_synced_at::TEXT, last_error, created_at::TEXT,
            business_manager_id, business_manager_name
       FROM ad_account
      WHERE status = 'active'
      ORDER BY owner_id, platform, name`
  );
  return res.rows.map(mapAdAccount);
}
