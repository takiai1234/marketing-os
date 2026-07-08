// Lark Base API client.
// Docs: https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-record/list
//
// Lark Base "app_token" = ID của file Lark Base (lấy từ URL: /base/<app_token>)
// table_id = ID của bảng trong file (lấy từ API list tables hoặc URL)

export const LARK_BASE_APP_TOKEN_KEY = 'LARK_BASE_APP_TOKEN';
export const LARK_BASE_TABLE_ID_KEY = 'LARK_BASE_TABLE_ID';

const LARK_BASE_URL = 'https://open.larksuite.com/open-apis';

export interface LarkBaseRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

export interface LarkBaseTable {
  table_id: string;
  name: string;
}

async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${LARK_BASE_URL}/auth/v3/tenant_access_token/internal`, {
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
  appToken: string
): Promise<LarkBaseTable[]> {
  const token = await getTenantToken(appId, appSecret);
  const res = await fetch(`${LARK_BASE_URL}/bitable/v1/apps/${appToken}/tables`, {
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
  filter?: string;
  sort?: string[];
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
  opts: FetchRecordsOptions = {}
): Promise<FetchRecordsResult> {
  const token = await getTenantToken(appId, appSecret);
  const params = new URLSearchParams();
  params.set('page_size', String(opts.pageSize ?? 100));
  if (opts.pageToken) params.set('page_token', opts.pageToken);
  if (opts.filter) params.set('filter', opts.filter);

  const url = `${LARK_BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fetch records HTTP ${res.status}`);
  const data = await res.json() as {
    code: number;
    msg: string;
    data?: {
      items?: LarkBaseRecord[];
      has_more?: boolean;
      page_token?: string;
      total?: number;
    };
  };
  if (data.code !== 0) throw new Error(`Lark Base error ${data.code}: ${data.msg}`);
  return {
    records: data.data?.items ?? [],
    hasMore: data.data?.has_more ?? false,
    pageToken: data.data?.page_token,
    total: data.data?.total ?? 0,
  };
}
