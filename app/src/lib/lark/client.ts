// Lark Bot API client — dùng App ID + App Secret (internal app).
// Docs: https://open.larksuite.com/document/server-docs/im-v1/message/create
//
// Flow:
//   1. POST /auth/v3/tenant_access_token/internal → tenant_access_token (2h TTL)
//   2. POST /im/v1/messages?receive_id_type=chat_id → gửi message

export const LARK_APP_ID_KEY = 'LARK_APP_ID';
export const LARK_APP_SECRET_KEY = 'LARK_APP_SECRET';
export const LARK_CHAT_ID_KEY = 'LARK_CHAT_ID';

const LARK_BASE = 'https://open.larksuite.com/open-apis';

export interface LarkSendResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
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

export async function sendLarkTextMessage(
  appId: string,
  appSecret: string,
  chatId: string,
  text: string
): Promise<LarkSendResult> {
  try {
    const token = await getTenantAccessToken(appId, appSecret);
    const res = await fetch(`${LARK_BASE}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });
    const body = await res.json().catch(() => null) as { code?: number; msg?: string } | null;
    if (!res.ok || (body?.code !== undefined && body.code !== 0)) {
      return { ok: false, status: res.status, body, error: body?.msg ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendLarkCardMessage(
  appId: string,
  appSecret: string,
  chatId: string,
  card: object
): Promise<LarkSendResult> {
  try {
    const token = await getTenantAccessToken(appId, appSecret);
    const res = await fetch(`${LARK_BASE}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      }),
    });
    const body = await res.json().catch(() => null) as { code?: number; msg?: string } | null;
    if (!res.ok || (body?.code !== undefined && body.code !== 0)) {
      return { ok: false, status: res.status, body, error: body?.msg ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
