// Lark Base API client — hỗ trợ cả Lark (larksuite.com) và Feishu (feishu.cn).
// app_token = ID file Lark Base, lấy từ URL: /base/<app_token>
// Tự detect API base URL từ tenant domain được lưu cùng app_token.

// Keys cho 2 Lark Base riêng
export const LARK_BASE_MARKETING_APP_TOKEN_KEY = 'LARK_BASE_MARKETING_APP_TOKEN';
export const LARK_BASE_MARKETING_TABLE_ID_KEY  = 'LARK_BASE_MARKETING_TABLE_ID';
export const LARK_BASE_ORDER_APP_TOKEN_KEY      = 'LARK_BASE_ORDER_APP_TOKEN';
export const LARK_BASE_ORDER_TABLE_ID_KEY       = 'LARK_BASE_ORDER_TABLE_ID';

// Keys cũ (giữ lại để không break settings đã lưu)
export const LARK_BASE_APP_TOKEN_KEY = 'LARK_BASE_APP_TOKEN';
export const LARK_BASE_TABLE_ID_KEY  = 'LARK_BASE_TABLE_ID';

// API host — Feishu (VN/CN) vs Lark (quốc tế)
export function getLarkApiBase(tenantDomain?: string | null): string {
  if (tenantDomain?.includes('feishu.cn')) return 'https://open.feishu.cn/open-apis';
  return 'https://open.larksuite.com/open-apis';
}

// Tenant domain key để lưu cùng với app_token
export const LARK_BASE_MARKETING_DOMAIN_KEY = 'LARK_BASE_MARKETING_DOMAIN';
export const LARK_BASE_ORDER_DOMAIN_KEY      = 'LARK_BASE_ORDER_DOMAIN';

export interface LarkBaseRecord {
  record_id: string;
  fields: { [key: string]: unknown };
}

export interface LarkBaseTable {
  table_id: string;
  name: string;
}

async function getTenantToken(appId: string, appSecret: string, apiBase: string): Promise<string> {
  const res = await fetch(`${apiBase}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!res.ok) throw new Error(`Lark auth HTTP ${res.status}`);
  const data = await res.json() as { code: number; msg: string; tenant_access_token?: string };
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Lark auth error ${data.code}: ${data.msg}`);
  }
  return data.tenant_access_token;
}

export async function listLarkBaseTables(
  appId: string,
  appSecret: string,
  appToken: string,
  tenantDomain?: string | null
): Promise<LarkBaseTable[]> {
  const apiBase = getLarkApiBase(tenantDomain);
  const token = await getTenantToken(appId, appSecret, apiBase);
  const res = await fetch(`${apiBase}/bitable/v1/apps/${appToken}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List tables HTTP ${res.status}`);
  const data = await res.json() as { code: number; msg: string; data?: { items?: LarkBaseTable[] } };
  if (data.code !== 0) throw new Error(`Lark Base error ${data.code}: ${data.msg}`);
  return data.data?.items ?? [];
}

export interface FetchRecordsOptions {
  pageSize?: number;
  pageToken?: string;
}

export interface FetchRecordsResult {
  records: LarkBaseRecord[];
  hasMore: boolean;
  pageToken?: string;
  total: number;
}

export async function fetchLarkBaseRecords(
  appId: string,
  appSecret: string,
  appToken: string,
  tableId: string,
  opts: FetchRecordsOptions = {},
  tenantDomain?: string | null
): Promise<FetchRecordsResult> {
  const apiBase = getLarkApiBase(tenantDomain);
  const token = await getTenantToken(appId, appSecret, apiBase);
  const params = new URLSearchParams();
  params.set('page_size', String(opts.pageSize ?? 100));
  if (opts.pageToken) params.set('page_token', opts.pageToken);

  const url = `${apiBase}/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Fetch records HTTP ${res.status}`);
  const data = await res.json() as {
    code: number; msg: string;
    data?: { items?: LarkBaseRecord[]; has_more?: boolean; page_token?: string; total?: number };
  };
  if (data.code !== 0) throw new Error(`Lark Base error ${data.code}: ${data.msg}`);
  return {
    records: data.data?.items ?? [],
    hasMore: data.data?.has_more ?? false,
    pageToken: data.data?.page_token,
    total: data.data?.total ?? 0,
  };
}
