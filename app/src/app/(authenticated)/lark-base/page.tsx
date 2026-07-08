import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSetting } from '@/lib/settings/api-keys';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY } from '@/lib/lark/client';
import {
  LARK_BASE_MARKETING_APP_TOKEN_KEY, LARK_BASE_MARKETING_TABLE_ID_KEY, LARK_BASE_MARKETING_DOMAIN_KEY,
  LARK_BASE_ORDER_APP_TOKEN_KEY,      LARK_BASE_ORDER_TABLE_ID_KEY,      LARK_BASE_ORDER_DOMAIN_KEY,
  fetchLarkBaseRecords,
} from '@/lib/lark/base-client';
import { LarkBaseTabs } from '@/components/lark-base/lark-base-tabs';

export const metadata: Metadata = { title: 'Lark Base — Marketing OS' };

async function loadSlot(appId: string, appSecret: string, appTokenKey: string, tableIdKey: string, domainKey: string) {
  const [appToken, tableId, domain] = await Promise.all([
    getSetting(appTokenKey),
    getSetting(tableIdKey),
    getSetting(domainKey),
  ]);
  if (!appToken || !tableId) return { configured: false, records: [], columns: [], total: 0, error: null };
  try {
    const result = await fetchLarkBaseRecords(appId, appSecret, appToken, tableId, { pageSize: 200 }, domain);
    const fieldSet = new Set<string>();
    for (const r of result.records) Object.keys(r.fields).forEach((k) => fieldSet.add(k));
    return { configured: true, records: result.records, columns: Array.from(fieldSet), total: result.total, error: null };
  } catch (err) {
    return { configured: true, records: [], columns: [], total: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function LarkBasePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [appId, appSecret] = await Promise.all([getSetting(LARK_APP_ID_KEY), getSetting(LARK_APP_SECRET_KEY)]);

  if (!appId || !appSecret) {
    return (
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
        <h2 className="text-base font-semibold text-amber-900 mb-1">Chưa cấu hình Lark App</h2>
        <p className="text-sm text-amber-800">
          Vào <a href="/settings/integrations" className="underline font-medium">Settings → Tích hợp</a> để nhập App ID + App Secret.
        </p>
      </div>
    );
  }

  const [marketing, order] = await Promise.all([
    loadSlot(appId, appSecret, LARK_BASE_MARKETING_APP_TOKEN_KEY, LARK_BASE_MARKETING_TABLE_ID_KEY, LARK_BASE_MARKETING_DOMAIN_KEY),
    loadSlot(appId, appSecret, LARK_BASE_ORDER_APP_TOKEN_KEY,     LARK_BASE_ORDER_TABLE_ID_KEY,     LARK_BASE_ORDER_DOMAIN_KEY),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Lark Base</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Dữ liệu kéo từ Lark Base về Marketing OS.</p>
      </div>
      <LarkBaseTabs marketing={marketing} order={order} />
    </div>
  );
}
