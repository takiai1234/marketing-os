// Facebook Marketing API client — read-only Phase 1.
//
// Reuse `fb()` wrapper từ api-client.ts để inherit retry/timeout/error.
// Endpoints used:
//   GET /me/adaccounts                 → list ad accounts user có quyền
//   GET /act_<id>/campaigns             → list campaigns trong account
//   GET /act_<id>/insights              → account-level insights
//   GET /<campaign_id>/insights         → campaign-level insights
//
// Insights metric set (read-only Phase 1):
//   spend, impressions, reach, clicks, ctr, cpm, cpc, actions
//   (purchase, lead, complete_registration, ... cho conversions)

import { fb } from './api-client';
import type { FBPaginatedResponse } from './types';

// ─── Account list ────────────────────────────────────────────────────────

export interface FBAdAccount {
  id: string;                 // 'act_<numeric>'
  account_id: string;          // numeric only (no 'act_' prefix)
  name: string;
  currency: string;            // ISO 4217 ('VND', 'USD')
  timezone_name: string;       // 'Asia/Ho_Chi_Minh'
  account_status: number;      // 1=active, 2=disabled, 3=unsettled, ...
  amount_spent?: string;       // total lifetime spend (cents string)
  /** Business Manager metadata — null nếu ad account personal */
  business?: {
    id: string;
    name: string;
  };
}

export async function fetchAdAccounts(token: string): Promise<FBAdAccount[]> {
  const res = await fb<FBPaginatedResponse<FBAdAccount>>(
    '/me/adaccounts',
    {
      // business{id,name} field expansion → trả thêm BM info nếu account
      // thuộc 1 BM. Personal account → field absent.
      fields:
        'id,account_id,name,currency,timezone_name,account_status,amount_spent,business{id,name}',
      limit: '200',
    },
    token
  );
  // account_status: 1=active, 2=disabled, 3=unsettled, 7=pending_review, 9=in_grace_period
  // Chỉ lấy active (1) và pending_review (7) — bỏ disabled/unsettled
  const USABLE_STATUSES = new Set([1, 7, 9]);
  return (res.data ?? []).filter((a) => USABLE_STATUSES.has(a.account_status));
}

// ─── Campaign list ───────────────────────────────────────────────────────

export interface FBAdCampaign {
  id: string;
  name: string;
  objective?: string;          // 'OUTCOME_TRAFFIC', 'OUTCOME_LEADS', ...
  status: string;              // 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED'
  effective_status?: string;
  daily_budget?: string;       // cents string
  lifetime_budget?: string;
  start_time?: string;         // ISO timestamp
  stop_time?: string;
  created_time?: string;
}

export async function fetchCampaigns(
  token: string,
  adAccountId: string // 'act_<id>' format
): Promise<FBAdCampaign[]> {
  const fields = [
    'id',
    'name',
    'objective',
    'status',
    'effective_status',
    'daily_budget',
    'lifetime_budget',
    'start_time',
    'stop_time',
    'created_time',
  ].join(',');

  const res = await fb<FBPaginatedResponse<FBAdCampaign>>(
    `/${adAccountId}/campaigns`,
    { fields, limit: '100' },
    token
  );
  return res.data ?? [];
}

// ─── Insights ────────────────────────────────────────────────────────────

export interface FBInsightAction {
  action_type: string;         // 'purchase', 'lead', 'link_click', ...
  value: string;               // count as string
}

export interface FBAdInsight {
  date_start: string;          // 'YYYY-MM-DD'
  date_stop: string;
  spend?: string;              // cents string ("1234" = $12.34)
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;                // decimal as string "0.0123" = 1.23%
  cpm?: string;                // cents string
  cpc?: string;
  frequency?: string;
  actions?: FBInsightAction[];
  action_values?: FBInsightAction[]; // dollar value of action (for ROAS)
  // Campaign/adset/ad id khi level filter
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
}

export interface FetchInsightsOptions {
  /** 'account' | 'campaign' | 'adset' | 'ad' — granularity */
  level: 'account' | 'campaign' | 'adset' | 'ad';
  /** ISO date YYYY-MM-DD */
  since: string;
  until: string;
  /** breakdown by day (default false = totals over range) */
  daily?: boolean;
  /** Specific campaign id filter (chỉ pull insights cho campaign này) */
  campaignId?: string;
}

export async function fetchAdInsights(
  token: string,
  adAccountId: string, // 'act_<id>'
  options: FetchInsightsOptions
): Promise<FBAdInsight[]> {
  const fields = [
    'date_start',
    'date_stop',
    'spend',
    'impressions',
    'reach',
    'clicks',
    'ctr',
    'cpm',
    'cpc',
    'frequency',
    'actions',
    'action_values',
    ...(options.level !== 'account' ? ['campaign_id', 'campaign_name'] : []),
    ...(options.level === 'adset' || options.level === 'ad' ? ['adset_id'] : []),
    ...(options.level === 'ad' ? ['ad_id'] : []),
  ].join(',');

  const params: Record<string, string> = {
    fields,
    level: options.level,
    time_range: JSON.stringify({ since: options.since, until: options.until }),
    limit: '500',
  };

  if (options.daily) {
    params.time_increment = '1'; // break down by day
  }

  // Filter by specific campaign nếu có
  if (options.campaignId) {
    params.filtering = JSON.stringify([
      { field: 'campaign.id', operator: 'EQUAL', value: options.campaignId },
    ]);
  }

  const res = await fb<FBPaginatedResponse<FBAdInsight>>(
    `/${adAccountId}/insights`,
    params,
    token
  );
  return res.data ?? [];
}

// ─── Helpers — convert FB API values to our DB format ────────────────────

/** FB trả spend dạng cents string ("1234" = 12.34 USD). Convert sang micros
 *  (× 1_000_000) để cùng đơn vị Google Ads convention. */
export function spendStringToMicros(spendStr: string | undefined): number {
  if (!spendStr) return 0;
  const cents = parseFloat(spendStr);
  if (!Number.isFinite(cents)) return 0;
  // FB returns smallest currency unit (cents for USD, đồng for VND).
  // FB VND đặc biệt: trả thẳng đồng (vì VND không có sub-unit). USD trả cents.
  // → multiply by 10_000 for USD (cents → micros), by 1_000_000 for VND (đồng → micros).
  // Caller phải biết currency. Mặc định nhân 10_000 (cents → micros) — VND thì
  // caller convert riêng.
  return Math.round(cents * 10_000);
}

/** Convert micros back to display string ("$12.34" / "12,340 đ") */
export function microsToDisplay(micros: number, currency: string): string {
  const amount = micros / 1_000_000;
  if (currency === 'VND') {
    return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Mapping objective → action_types FB trả về là "kết quả chính" của campaign.
const OBJECTIVE_RESULT_TYPES: Record<string, string[]> = {
  traffic:        ['link_click', 'outbound_click'],
  leads:          ['lead', 'omni_complete_registration', 'complete_registration', 'onsite_conversion.lead_grouped'],
  sales:          ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_app_install'],
  engagement:     ['post_engagement', 'page_engagement', 'like'],
  video_views:    ['video_view', 'thruplay'],
  messages:       ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply'],
  app_promotion:  ['omni_app_install', 'mobile_app_install'],
  awareness:      ['reach'],
};

/**
 * Tính "Kết quả" theo objective của campaign — giống cách FB Ads Manager hiển thị.
 * Fallback về sumConversions nếu objective không xác định.
 */
export function getResultCount(
  actions: FBInsightAction[] | undefined,
  objective: string | undefined
): number {
  if (!actions || actions.length === 0) return 0;
  const types = objective ? OBJECTIVE_RESULT_TYPES[objective] : undefined;
  if (!types) return sumConversions(actions);
  let sum = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) sum += parseFloat(a.value) || 0;
  }
  return sum;
}

/** Sum actions có action_type chứa "purchase" hoặc "lead" → conversions count.
 *  Logic conservative — vendor có thể có nhiều action_type custom. */
export function sumConversions(actions: FBInsightAction[] | undefined): number {
  if (!actions) return 0;
  const CONVERSION_TYPES = [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'lead',
    'omni_complete_registration',
    'complete_registration',
  ];
  let sum = 0;
  for (const a of actions) {
    if (CONVERSION_TYPES.some((t) => a.action_type === t)) {
      sum += parseFloat(a.value) || 0;
    }
  }
  return sum;
}

/** Sum action_values for ROAS calculation — revenue total. */
export function sumActionValues(values: FBInsightAction[] | undefined): number {
  if (!values) return 0;
  let sum = 0;
  for (const v of values) {
    sum += parseFloat(v.value) || 0;
  }
  return sum;
}

/** Map FB objective string → our enum.
 *  FB v25 dùng OUTCOME_<X> convention. */
export function mapObjectiveToEnum(
  fbObjective: string | undefined
): 'awareness' | 'traffic' | 'engagement' | 'leads' | 'app_promotion' | 'sales' | 'video_views' | 'messages' | 'unknown' {
  if (!fbObjective) return 'unknown';
  const o = fbObjective.toUpperCase();
  if (o.includes('AWARENESS') || o === 'BRAND_AWARENESS' || o === 'REACH') return 'awareness';
  if (o.includes('TRAFFIC') || o === 'LINK_CLICKS') return 'traffic';
  if (o.includes('ENGAGEMENT') || o.includes('PAGE_LIKES') || o.includes('POST_ENGAGEMENT')) return 'engagement';
  if (o.includes('LEADS') || o === 'LEAD_GENERATION') return 'leads';
  if (o.includes('APP') || o === 'APP_INSTALLS') return 'app_promotion';
  if (o.includes('SALES') || o.includes('CONVERSIONS') || o === 'CATALOG_SALES') return 'sales';
  if (o.includes('VIDEO_VIEWS')) return 'video_views';
  if (o.includes('MESSAGES')) return 'messages';
  return 'unknown';
}
