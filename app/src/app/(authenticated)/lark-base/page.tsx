import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSetting } from '@/lib/settings/api-keys';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY } from '@/lib/lark/client';
import { LARK_BASE_APP_TOKEN_KEY, LARK_BASE_TABLE_ID_KEY, fetchLarkBaseRecords } from '@/lib/lark/base-client';
import { LarkBaseTable } from '@/components/lark-base/lark-base-table';

export const metadata: Metadata = {
  title: 'Lark Base — Marketing OS',
};

export default async function LarkBasePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [appId, appSecret, appToken, tableId] = await Promise.all([
    getSetting(LARK_APP_ID_KEY),
    getSetting(LARK_APP_SECRET_KEY),
    getSetting(LARK_BASE_APP_TOKEN_KEY),
    getSetting(LARK_BASE_TABLE_ID_KEY),
  ]);

  if (!appId || !appSecret || !appToken || !tableId) {
    return (
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
        <h2 className="text-base font-semibold text-amber-900 mb-1">Chưa cấu hình Lark Base</h2>
        <p className="text-sm text-amber-800">
          Vào{' '}
          <a href="/settings/integrations" className="underline font-medium">
            Settings → Tích hợp
          </a>{' '}
          để nhập App ID, App Secret và cấu hình Lark Base.
        </p>
      </div>
    );
  }

  let records: { record_id: string; fields: Record<string, unknown> }[] = [];
  let columns: string[] = [];
  let errorMsg: string | null = null;
  let total = 0;

  try {
    const result = await fetchLarkBaseRecords(appId, appSecret, appToken, tableId, { pageSize: 200 });
    records = result.records;
    total = result.total;
    // Lấy tất cả field names từ records
    const fieldSet = new Set<string>();
    for (const r of records) Object.keys(r.fields).forEach((k) => fieldSet.add(k));
    columns = Array.from(fieldSet);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Lark Base</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {errorMsg ? 'Lỗi khi tải dữ liệu' : `${total.toLocaleString('vi-VN')} bản ghi`}
          </p>
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 px-5 py-4 text-sm text-red-800">
          <strong>Lỗi:</strong> {errorMsg}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center text-sm text-zinc-400">
          Bảng trống hoặc chưa có dữ liệu.
        </div>
      ) : (
        <LarkBaseTable columns={columns} records={records} />
      )}
    </div>
  );
}
