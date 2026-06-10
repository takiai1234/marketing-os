// Admin debug page — kiểm tra scope + chất lượng data dashboard mà không
// cần truy cập Postgres trực tiếp.
//
// 3 bảng:
//   1. Channel status breakdown — bao nhiêu kênh active/disconnected/...
//   2. Per-channel reach 7 ngày + current followers + last_synced_at
//   3. Sync log 24h gần nhất — kênh nào fail, lý do
//
// Render server-side để query DB. Admin only.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Debug Dashboard — Cài đặt',
};

// Disable cache — debug page cần data tươi mỗi lần xem.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface StatusRow {
  status: string;
  count: string;
}

interface ChannelDataRow {
  account_id: string;
  name: string;
  platform: string;
  status: string;
  reach_7d: string;
  current_followers: string | null;
  days_with_data: string;
  last_synced_at: Date | null;
}

interface SyncLogRow {
  id: string;
  sync_type: string;
  account_name: string | null;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  records_upserted: number;
  error_message: string | null;
}

export default async function DashboardDebugPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm text-amber-700">
          Trang debug chỉ admin xem được.
        </p>
      </div>
    );
  }

  const [statusRes, channelsRes, syncRes] = await Promise.all([
    db.query<StatusRow>(`
      SELECT status::TEXT, COUNT(*)::TEXT AS count
      FROM social_account
      GROUP BY status
      ORDER BY count DESC
    `),
    db.query<ChannelDataRow>(`
      SELECT
        sa.id::TEXT AS account_id,
        sa.name,
        sa.platform::TEXT AS platform,
        sa.status::TEXT AS status,
        COALESCE(SUM(amd.total_reach), 0)::TEXT AS reach_7d,
        MAX(amd.followers)::TEXT AS current_followers,
        COUNT(DISTINCT amd.date)::TEXT AS days_with_data,
        sa.last_synced_at
      FROM social_account sa
      LEFT JOIN account_metric_daily amd ON amd.account_id = sa.id
        AND amd.date >= CURRENT_DATE - 7
        AND amd.date < CURRENT_DATE
      GROUP BY sa.id, sa.name, sa.platform, sa.status, sa.last_synced_at
      ORDER BY
        CASE sa.status WHEN 'active' THEN 1 WHEN 'token_expired' THEN 2 ELSE 3 END,
        COALESCE(SUM(amd.total_reach), 0) DESC,
        sa.name ASC
    `),
    db.query<SyncLogRow>(`
      SELECT
        asl.id::TEXT,
        asl.sync_type::TEXT,
        sa.name AS account_name,
        asl.started_at,
        asl.finished_at,
        asl.status,
        asl.records_upserted,
        asl.error_message
      FROM api_sync_log asl
      LEFT JOIN social_account sa ON sa.id = asl.account_id
      WHERE asl.started_at >= NOW() - INTERVAL '24 hours'
      ORDER BY asl.started_at DESC
      LIMIT 50
    `),
  ]);

  const totalChannels = statusRes.rows.reduce((sum, r) => sum + Number(r.count), 0);
  const activeChannels = Number(
    statusRes.rows.find((r) => r.status === 'active')?.count ?? 0
  );
  const disconnectedChannels = Number(
    statusRes.rows.find((r) => r.status === 'disconnected')?.count ?? 0
  );

  // Stats for sync log
  const syncOk = syncRes.rows.filter((r) => r.status === 'success').length;
  const syncFail = syncRes.rows.filter((r) => r.status === 'failed').length;
  const syncRunning = syncRes.rows.filter((r) => r.status === 'running').length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Debug Dashboard</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Kiểm tra scope + chất lượng data dashboard. KPI cards tính tổng các
          kênh trạng thái <code className="font-mono text-xs">active</code> +{' '}
          <code className="font-mono text-xs">token_expired</code> (loại{' '}
          <code className="font-mono text-xs">disconnected</code>).
        </p>
      </div>

      {/* ─── Bảng 1: Status breakdown ──────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
          <h4 className="text-sm font-semibold text-zinc-900">
            1. Trạng thái kênh
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tổng <strong>{totalChannels}</strong> kênh · Active{' '}
            <strong className="text-emerald-600">{activeChannels}</strong> ·
            Disconnected{' '}
            <strong className="text-red-500">{disconnectedChannels}</strong>{' '}
            (bị loại khỏi KPI)
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Số kênh</th>
              <th className="px-4 py-2 text-left">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {statusRes.rows.map((r) => (
              <tr key={r.status} className="border-t border-zinc-100">
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                      r.status === 'active' && 'bg-emerald-50 text-emerald-700',
                      r.status === 'token_expired' && 'bg-amber-50 text-amber-700',
                      r.status === 'disconnected' && 'bg-red-50 text-red-700'
                    )}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">
                  {Number(r.count).toLocaleString('vi-VN')}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500">
                  {r.status === 'active' && 'Được tính vào KPI tổng'}
                  {r.status === 'token_expired' &&
                    'Vẫn được tính vào KPI (data history còn dùng được)'}
                  {r.status === 'disconnected' && '❌ KHÔNG được tính vào KPI'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ─── Bảng 2: Per-channel reach 7d ──────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
          <h4 className="text-sm font-semibold text-zinc-900">
            2. Đóng góp reach 7 ngày qua của từng kênh
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kênh có{' '}
            <code className="font-mono text-xs">days_with_data &lt; 7</code> →
            cron sync chưa đủ ngày. Reach 0 → kênh không có data hoặc bị skip.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left">Tên kênh</th>
                <th className="px-4 py-2 text-left">Platform</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Reach 7d</th>
                <th className="px-4 py-2 text-right">Followers</th>
                <th className="px-4 py-2 text-right">Ngày có data</th>
                <th className="px-4 py-2 text-left">Sync lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {channelsRes.rows.map((r) => {
                const reach = Number(r.reach_7d);
                const daysData = Number(r.days_with_data);
                const followers = r.current_followers
                  ? Number(r.current_followers)
                  : null;
                const isDisconnected = r.status === 'disconnected';
                const hasGap = daysData < 7;
                const noReach = reach === 0;

                return (
                  <tr
                    key={r.account_id}
                    className={cn(
                      'border-t border-zinc-100',
                      isDisconnected && 'bg-red-50/30'
                    )}
                  >
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {r.platform}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          r.status === 'active' && 'bg-emerald-50 text-emerald-700',
                          r.status === 'token_expired' && 'bg-amber-50 text-amber-700',
                          r.status === 'disconnected' && 'bg-red-50 text-red-700'
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        noReach && !isDisconnected && 'text-red-600 font-semibold'
                      )}
                    >
                      {reach.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {followers !== null
                        ? followers.toLocaleString('vi-VN')
                        : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        hasGap && !isDisconnected && 'text-amber-600 font-semibold'
                      )}
                    >
                      {daysData}/7
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {r.last_synced_at
                        ? new Date(r.last_synced_at).toLocaleString('vi-VN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : 'Chưa từng'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Bảng 3: Sync log 24h ──────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
          <h4 className="text-sm font-semibold text-zinc-900">
            3. Sync log 24h gần nhất
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            <span className="text-emerald-600 font-semibold">{syncOk}</span> success ·{' '}
            <span className="text-red-500 font-semibold">{syncFail}</span> failed ·{' '}
            <span className="text-blue-500 font-semibold">{syncRunning}</span> running
            (tối đa 50 row gần nhất)
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Kênh</th>
                <th className="px-4 py-2 text-left">Bắt đầu</th>
                <th className="px-4 py-2 text-left">Kết thúc</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Records</th>
                <th className="px-4 py-2 text-left">Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {syncRes.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                    Chưa có sync log nào trong 24h qua — có thể cron không
                    chạy / chưa được trigger.
                  </td>
                </tr>
              ) : (
                syncRes.rows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-4 py-2 font-mono text-xs text-zinc-600">
                      {r.sync_type}
                    </td>
                    <td className="px-4 py-2">{r.account_name ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {new Date(r.started_at).toLocaleString('vi-VN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {r.finished_at
                        ? new Date(r.finished_at).toLocaleString('vi-VN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '⏳'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          r.status === 'success' && 'bg-emerald-50 text-emerald-700',
                          r.status === 'failed' && 'bg-red-50 text-red-700',
                          r.status === 'running' && 'bg-blue-50 text-blue-700'
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.records_upserted}
                    </td>
                    <td className="px-4 py-2 text-xs text-red-600 max-w-md truncate">
                      {r.error_message ?? ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-zinc-400">
        Trang này KHÔNG cache (dynamic) — refresh trang sẽ chạy lại 3 query.
      </p>
    </div>
  );
}
