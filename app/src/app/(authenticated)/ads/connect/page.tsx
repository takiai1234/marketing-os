// /ads/connect — Dedicated page giải thích flow kết nối FB Ads.
//
// Khác /channels/new/facebook: page này nói rõ user sẽ cấp scope ads_read
// + redirect về /ads sau callback (không qua pages picker). Page hiện tại
// không bị ảnh hưởng — vẫn track như cũ.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ZapIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  CheckIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { listAdAccountsForUser } from '@/lib/queries/ad-accounts';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Kết nối Facebook Ads — Marketing OS' };

export default async function AdsConnectPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Defensive: check env FB credentials. "placeholder" = chưa set, OAuth
  // sẽ fail với "ID ứng dụng không hợp lệ" từ Facebook side.
  const fbAppId = process.env.FB_APP_ID ?? '';
  const fbAppSecret = process.env.FB_APP_SECRET ?? '';
  const envMisconfigured =
    !fbAppId ||
    !fbAppSecret ||
    fbAppId === 'placeholder' ||
    fbAppSecret === 'placeholder' ||
    fbAppId.length < 10;

  // Hiển thị số page user đã connect (để user biết flow này không ảnh hưởng)
  const pagesRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
       FROM social_account
      WHERE platform = 'facebook' AND status = 'active'`
  );
  const pagesConnected = Number(pagesRes.rows[0]?.count ?? 0);

  const existingAdAccounts = await listAdAccountsForUser(user.userId);
  const fbAdAccountsCount = existingAdAccounts.filter(
    (a) => a.platform === 'facebook'
  ).length;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Link
        href="/ads"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="size-3.5" />
        Quay lại danh sách
      </Link>

      {envMisconfigured && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-5 py-4">
          <div className="flex items-start gap-2">
            <AlertCircleIcon className="size-5 text-rose-600 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm text-rose-900">
              <p className="font-semibold">
                Server thiếu cấu hình Facebook App ID/Secret
              </p>
              <p>
                Env <code className="bg-white px-1 rounded">FB_APP_ID</code> hoặc{' '}
                <code className="bg-white px-1 rounded">FB_APP_SECRET</code> đang là{' '}
                <code className="bg-white px-1 rounded">"placeholder"</code> (chưa
                được set thực tế). Click "Cấp quyền" sẽ thấy FB báo "ID ứng dụng
                không hợp lệ".
              </p>
              <p className="text-xs">
                Admin cần lấy App ID + Secret từ{' '}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  developers.facebook.com/apps
                </a>{' '}
                → Settings → Basic, rồi cập nhật trong Coolify env vars +
                redeploy.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
          <ZapIcon className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Kết nối Facebook Ads</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Cấp quyền read-only để app pull báo cáo spend / impressions /
            clicks / conversions từ Ad Accounts của bạn.
          </p>
        </div>
      </div>

      {/* Status hiện tại */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4 space-y-2">
        <h3 className="text-sm font-semibold text-zinc-800 mb-1">
          Hiện trạng kết nối
        </h3>
        <div className="flex items-center gap-2 text-sm">
          {pagesConnected > 0 ? (
            <>
              <CheckIcon className="size-4 text-emerald-600" />
              <span className="text-zinc-700">
                Đã kết nối <strong>{pagesConnected}</strong> Facebook Page
              </span>
            </>
          ) : (
            <>
              <AlertCircleIcon className="size-4 text-amber-600" />
              <span className="text-zinc-700">Chưa kết nối Facebook Page nào</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {fbAdAccountsCount > 0 ? (
            <>
              <CheckIcon className="size-4 text-emerald-600" />
              <span className="text-zinc-700">
                Đã có <strong>{fbAdAccountsCount}</strong> Ad Account trong app
                (qua các lần kết nối trước)
              </span>
            </>
          ) : (
            <>
              <AlertCircleIcon className="size-4 text-zinc-400" />
              <span className="text-zinc-700">Chưa có Ad Account nào</span>
            </>
          )}
        </div>
      </div>

      {/* Quá trình sẽ làm */}
      <div className="rounded-xl bg-blue-50/50 ring-1 ring-blue-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          Khi click "Cấp quyền" sẽ xảy ra:
        </h3>
        <ol className="space-y-1.5 text-sm text-blue-900 list-decimal list-inside ml-1">
          <li>Mở popup Facebook OAuth (cùng tab)</li>
          <li>
            Bạn sẽ thấy yêu cầu thêm permission{' '}
            <code className="bg-white px-1.5 py-0.5 rounded text-xs">ads_read</code>
            {' '}(read-only — KHÔNG cho phép tạo/sửa/xoá ad)
          </li>
          <li>Click Continue/Approve → quay lại app</li>
          <li>
            App tự động discover Ad Accounts bạn là admin → hiện ở{' '}
            <code>/ads</code> với status <strong>"Chờ kết nối"</strong>
          </li>
          <li>
            Bạn click "Kích hoạt" trên Ad Account muốn track → cron 04:30 VN
            hàng ngày sẽ pull báo cáo
          </li>
        </ol>
      </div>

      {/* An toàn */}
      <div className="rounded-xl bg-emerald-50/40 ring-1 ring-emerald-200 px-5 py-4">
        <div className="flex items-start gap-2">
          <ShieldCheckIcon className="size-4 text-emerald-700 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs text-emerald-900">
            <p>
              <strong>Page hiện tại KHÔNG bị ảnh hưởng.</strong> Các page đã
              kết nối vẫn track bình thường — flow này chỉ thêm scope{' '}
              <code>ads_read</code> vào token.
            </p>
            <p>
              <strong>Read-only:</strong> App không thể tạo / pause / xoá ad,
              không thể đổi budget, không thể truy cập billing.
            </p>
            <p>
              <strong>Có thể revoke bất cứ lúc nào:</strong> vào{' '}
              <a
                href="https://www.facebook.com/settings?tab=business_tools"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold"
              >
                facebook.com/settings → Business Integrations
              </a>{' '}
              → remove app.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Link href="/ads">
          <Button variant="outline">Huỷ</Button>
        </Link>
        {/* return_to=ads → callback skip pages picker, redirect /ads */}
        {envMisconfigured ? (
          <Button
            disabled
            className="bg-zinc-300 text-zinc-500 cursor-not-allowed"
            title="Server chưa cấu hình FB App ID/Secret — xem cảnh báo trên"
          >
            <ZapIcon className="size-4" />
            Cấp quyền Facebook Ads
          </Button>
        ) : (
          <a href="/api/auth/fb/connect?return_to=ads">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <ZapIcon className="size-4" />
              Cấp quyền Facebook Ads
            </Button>
          </a>
        )}
      </div>

      <p className="text-[11px] text-zinc-400 italic text-center mt-2">
        Lưu ý: Meta cần approve scope <code>ads_read</code> trước khi end-users
        thường dùng được (1-3 tuần). Đến lúc đó, scope chỉ active với admin
        của app — tức bạn (creator). Khi Meta approve, team members khác cũng
        dùng được.
      </p>
    </div>
  );
}
