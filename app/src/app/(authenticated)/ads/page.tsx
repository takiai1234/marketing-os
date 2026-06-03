// /ads — overview list user's ad accounts

import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ZapIcon,
  PlugIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  CircleDashedIcon,
  XCircleIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  listAdAccountsForUser,
  getAccountSummaries,
  type AdAccount,
  type AccountSummary,
  type AdAccountStatus,
} from '@/lib/queries/ad-accounts';
import { microsToDisplay } from '@/lib/fb/ads-api-client';
import { parseRangeFromSearchParams } from '@/lib/ads/date-ranges';
import { DateRangePicker } from '@/components/ads/date-range-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AdsAccountActions } from './ads-account-actions';

export const metadata = { title: 'Quảng cáo — Marketing OS' };

const NUMBER_FMT = new Intl.NumberFormat('vi-VN');

const STATUS_META: Record<AdAccountStatus, { label: string; icon: typeof CheckCircle2Icon; cls: string }> = {
  active:        { label: 'Đang đồng bộ',  icon: CheckCircle2Icon, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  pending:       { label: 'Chờ kết nối',   icon: CircleDashedIcon, cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  error:         { label: 'Lỗi sync',       icon: AlertCircleIcon,  cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  disconnected:  { label: 'Đã ngắt kết nối', icon: XCircleIcon,      cls: 'bg-zinc-50 text-zinc-600 ring-zinc-200' },
};

const PLATFORM_META: Record<string, { label: string; cls: string }> = {
  facebook: { label: 'Facebook Ads', cls: 'bg-blue-600 text-white' },
  google:   { label: 'Google Ads',   cls: 'bg-amber-500 text-white' },
  tiktok:   { label: 'TikTok Ads',   cls: 'bg-zinc-900 text-white' },
};

interface AdsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdsPage({ searchParams }: AdsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const range = parseRangeFromSearchParams(sp);

  const [accounts, summaries] = await Promise.all([
    listAdAccountsForUser(user.userId),
    getAccountSummaries(user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  const activeCount = accounts.filter((a) => a.status === 'active').length;
  const pendingCount = accounts.filter((a) => a.status === 'pending').length;
  const disconnectedCount = accounts.filter((a) => a.status === 'disconnected').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Quảng cáo</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Báo cáo spend / impressions / clicks / conversions từ Facebook Ads
            (Phase 1). TikTok + Google Ads ở Phase 2-3.
          </p>
        </div>
        <Link href="/ads/connect">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <PlugIcon className="size-4" />
            Kết nối Ad Account
          </Button>
        </Link>
      </div>

      {/* Date range picker */}
      {accounts.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DateRangePicker
            currentPreset={range.preset}
            currentFrom={range.from}
            currentTo={range.to}
          />
          <span className="text-[11px] text-zinc-500">
            {range.from} → {range.to} ({range.days} ngày)
          </span>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {pendingCount > 0 && (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-900">
              <strong>{pendingCount} ad account</strong> đang chờ bạn xác nhận.
              Click "Kích hoạt" trên từng card để bắt đầu đồng bộ data hàng ngày.
            </div>
          )}

          {disconnectedCount > 0 && (
            <div className="rounded-xl bg-zinc-50 ring-1 ring-zinc-200 px-4 py-3 text-sm text-zinc-700">
              <strong>{disconnectedCount} ad account</strong> đã ngắt kết nối
              (có thể do đổi FB app hoặc revoke). Bấm <strong>"Xoá"</strong>{' '}
              để dọn data cũ, hoặc reconnect FB (Cấp quyền lại) để kích hoạt
              lại nếu vẫn cần.
            </div>
          )}

          {/* Top KPI cards — tổng across active accounts */}
          {activeCount > 0 && <TopKpiSummary accounts={accounts} summaries={summaries} rangeDays={range.days} />}

          {/* Account list — group by Business Manager */}
          {groupByBusinessManager(accounts).map(([bmName, accs]) => (
            <section key={bmName} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-1">
                <h3 className="text-sm font-semibold text-zinc-800">
                  {bmName}
                </h3>
                <span className="text-[11px] text-zinc-500">
                  {accs.length} ad account
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accs.map((a) => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    summary={summaries[a.id] ?? null}
                    rangeDays={range.days}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/** Group accounts by Business Manager name, returns [bmName, accounts][] sorted
 *  alphabetically. Personal accounts (no BM) đặt cuối với label "Cá nhân". */
function groupByBusinessManager(accounts: AdAccount[]): [string, AdAccount[]][] {
  const groups = new Map<string, AdAccount[]>();
  for (const acc of accounts) {
    const key = acc.businessManagerName ?? '__personal__';
    const list = groups.get(key) ?? [];
    list.push(acc);
    groups.set(key, list);
  }
  const result: [string, AdAccount[]][] = [];
  for (const [key, list] of groups.entries()) {
    if (key !== '__personal__') result.push([key, list]);
  }
  result.sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  if (groups.has('__personal__')) {
    result.push(['Tài khoản cá nhân', groups.get('__personal__')!]);
  }
  return result;
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/30 px-6 py-12 text-center">
      <ZapIcon className="size-12 text-zinc-300 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-zinc-700 mb-1">
        Chưa có ad account nào
      </h3>
      <p className="text-sm text-zinc-500 mb-4 max-w-md mx-auto">
        Để xem báo cáo quảng cáo, kết nối Facebook Ad Account. Quá trình tự
        động — chỉ cần authorize FB với scope <code>ads_read</code>.
      </p>
      <Link href="/ads/connect">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <PlugIcon className="size-4" />
          Kết nối Facebook Ads
        </Button>
      </Link>
      <p className="text-[11px] text-zinc-400 mt-4 italic max-w-md mx-auto">
        Lưu ý: Meta cần approve scope <code>ads_read</code> (1-3 tuần). Trong
        thời gian chờ, app sẽ skip discover ad accounts. Sau khi approve,
        reconnect Facebook để app tự pick up.
      </p>
    </div>
  );
}

function TopKpiSummary({
  accounts,
  summaries,
  rangeDays,
}: {
  accounts: AdAccount[];
  summaries: Record<string, AccountSummary>;
  rangeDays: number;
}) {
  // Sum across active accounts (assume cùng currency hoặc skip rồi hiển thị %)
  let totalSpendMicros = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let currency: string | null = null;
  let allSameCurrency = true;

  for (const a of accounts) {
    if (a.status !== 'active') continue;
    const s = summaries[a.id];
    if (!s) continue;
    totalSpendMicros += s.totalSpendMicros;
    totalImpressions += s.totalImpressions;
    totalClicks += s.totalClicks;
    totalConversions += s.totalConversions;
    if (currency === null) currency = a.currency;
    else if (currency !== a.currency) allSameCurrency = false;
  }

  if (totalImpressions === 0 && totalSpendMicros === 0) return null;

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpendMicros / totalClicks : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KpiCard
        label={`Spend ${rangeDays}d`}
        value={
          allSameCurrency && currency
            ? microsToDisplay(totalSpendMicros, currency)
            : '— mixed currency'
        }
      />
      <KpiCard label="Impressions" value={NUMBER_FMT.format(totalImpressions)} />
      <KpiCard label="Clicks" value={NUMBER_FMT.format(totalClicks)} />
      <KpiCard label="CTR" value={`${ctr.toFixed(2)}%`} />
      <KpiCard label="Conversions" value={NUMBER_FMT.format(totalConversions)} />
      {!allSameCurrency && (
        <div className="col-span-full text-[11px] text-zinc-500 italic">
          ⚠️ Các ad accounts có currency khác nhau — spend không cộng được, hiện
          theo từng card.
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900 mt-0.5">{value}</p>
    </div>
  );
}

function AccountCard({
  account,
  summary,
  rangeDays,
}: {
  account: AdAccount;
  summary: AccountSummary | null;
  rangeDays: number;
}) {
  const status = STATUS_META[account.status];
  const platform = PLATFORM_META[account.platform] ?? {
    label: account.platform,
    cls: 'bg-zinc-700 text-white',
  };
  const StatusIcon = status.icon;

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded',
                platform.cls
              )}
            >
              {platform.label}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ring-1',
                status.cls
              )}
            >
              <StatusIcon className="size-3" />
              {status.label}
            </span>
          </div>
          <Link
            href={`/ads/${account.id}`}
            className="block group"
          >
            <h3
              className="text-sm font-semibold text-zinc-900 truncate group-hover:text-blue-700"
              title={account.name}
            >
              {account.name} →
            </h3>
          </Link>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            ID: <code className="font-mono">{account.externalId}</code> ·{' '}
            {account.currency}
          </p>
        </div>
      </div>

      {/* Summary metrics */}
      {summary && summary.totalImpressions > 0 ? (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded bg-zinc-50 px-2 py-1.5">
            <p className="text-[10px] text-zinc-500">Spend {rangeDays}d</p>
            <p className="font-semibold tabular-nums">
              {microsToDisplay(summary.totalSpendMicros, account.currency)}
            </p>
          </div>
          <div className="rounded bg-zinc-50 px-2 py-1.5">
            <p className="text-[10px] text-zinc-500">Impressions</p>
            <p className="font-semibold tabular-nums">
              {NUMBER_FMT.format(summary.totalImpressions)}
            </p>
          </div>
          <div className="rounded bg-zinc-50 px-2 py-1.5">
            <p className="text-[10px] text-zinc-500">Clicks · CTR</p>
            <p className="font-semibold tabular-nums">
              {NUMBER_FMT.format(summary.totalClicks)}
              <span className="text-zinc-500 font-normal ml-1">
                · {(summary.avgCtr * 100).toFixed(2)}%
              </span>
            </p>
          </div>
        </div>
      ) : account.status === 'active' ? (
        <div className="text-xs text-zinc-500 italic px-2 py-1">
          Đang chờ cron lần đầu (chạy 4:30 VN hàng ngày). Refresh sau nếu chưa thấy.
        </div>
      ) : null}

      {/* Error */}
      {account.status === 'error' && account.lastError && (
        <div className="rounded bg-rose-50 ring-1 ring-rose-200 px-2 py-1.5 text-[11px] text-rose-900">
          <strong>Lỗi sync:</strong> {account.lastError}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-zinc-100 text-xs">
        <span className="text-zinc-400">
          {account.lastSyncedAt
            ? `Sync ${formatRelative(account.lastSyncedAt)}`
            : 'Chưa sync'}
        </span>
        <AdsAccountActions
          accountId={account.id}
          status={account.status}
        />
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h trước`;
  const days = Math.floor(hours / 24);
  return `${days}d trước`;
}
