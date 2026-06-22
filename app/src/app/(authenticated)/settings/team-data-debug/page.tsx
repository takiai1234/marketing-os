// Admin debug — vì sao KPI team thiếu dữ liệu kênh nào.
//
// Một kênh chỉ hiện số liệu trong /team khi đủ 3 điều kiện:
//   1. status active (đã kết nối)
//   2. có 1 thành viên role='primary' (gán ở Channels → Người phụ trách)
//   3. có post/metric đã ingest (Bundle/FB sync)
//
// Trang này liệt kê TỪNG kênh + 3 cột chẩn đoán để thấy ngay chỗ thiếu,
// khỏi cần truy cập Postgres. Admin only, không cache.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Debug Kênh / Team — Cài đặt',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ChannelDiagRow {
  id: string;
  platform: string;
  name: string;
  status: string;
  primary_member: string | null;
  editor_count: number;
  posts_30d: number;
  last_metric_date: string | null;
  follow_growth_30d: number;
}

const DIAG_SQL = `
SELECT
  sa.id,
  sa.platform::text AS platform,
  sa.name,
  sa.status::text AS status,
  pm.name AS primary_member,
  COALESCE(ec.editor_count, 0)::int AS editor_count,
  COALESCE(p.posts_30d, 0)::int     AS posts_30d,
  m.last_metric_date::text          AS last_metric_date,
  COALESCE(fg.follow_growth_30d, 0)::int AS follow_growth_30d
FROM social_account sa
LEFT JOIN LATERAL (
  SELECT tm.name
  FROM social_account_member sam
  JOIN team_member tm ON tm.id = sam.member_id
  WHERE sam.account_id = sa.id AND sam.role = 'primary'
  LIMIT 1
) pm ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS editor_count
  FROM social_account_member sam
  WHERE sam.account_id = sa.id AND sam.role = 'editor'
) ec ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS posts_30d
  FROM social_post sp
  WHERE sp.account_id = sa.id AND sp.published_at >= NOW() - INTERVAL '30 days'
) p ON TRUE
LEFT JOIN LATERAL (
  SELECT MAX(date) AS last_metric_date
  FROM account_metric_daily amd
  WHERE amd.account_id = sa.id
) m ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(follower_growth), 0)::int AS follow_growth_30d
  FROM account_metric_daily amd
  WHERE amd.account_id = sa.id AND amd.date >= CURRENT_DATE - INTERVAL '30 days'
) fg ON TRUE
ORDER BY sa.platform, sa.name;
`;

const NUM = new Intl.NumberFormat('vi-VN');

export default async function TeamDataDebugPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return (
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
        <h3 className="text-base font-semibold text-amber-900 mb-1">Chỉ admin</h3>
        <p className="text-sm text-amber-800">Liên hệ admin để xem trang chẩn đoán.</p>
      </div>
    );
  }

  const { rows } = await db.query<ChannelDiagRow>(DIAG_SQL);

  // Tổng hợp theo platform: bao nhiêu kênh, bao nhiêu có primary, bao nhiêu có post.
  const byPlatform = new Map<
    string,
    { total: number; withPrimary: number; withPosts: number }
  >();
  for (const r of rows) {
    const g = byPlatform.get(r.platform) ?? { total: 0, withPrimary: 0, withPosts: 0 };
    g.total += 1;
    if (r.primary_member) g.withPrimary += 1;
    if (r.posts_30d > 0) g.withPosts += 1;
    byPlatform.set(r.platform, g);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">Debug Kênh / Team</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          Vì sao KPI team thiếu dữ liệu kênh nào. Một kênh chỉ vào KPI team khi:
          (1) đã kết nối, (2) có <b>người phụ trách primary</b>, (3) có post/metric đã sync.
        </p>
      </div>

      {/* Tổng hợp theo platform */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs">
            <tr>
              <th className="text-left font-medium px-4 py-2">Platform</th>
              <th className="text-right font-medium px-4 py-2">Số kênh</th>
              <th className="text-right font-medium px-4 py-2">Có primary</th>
              <th className="text-right font-medium px-4 py-2">Có post 30d</th>
            </tr>
          </thead>
          <tbody>
            {[...byPlatform.entries()].map(([platform, g]) => (
              <tr key={platform} className="border-t border-zinc-100">
                <td className="px-4 py-2 font-medium capitalize">{platform}</td>
                <td className="px-4 py-2 text-right">{g.total}</td>
                <td
                  className={cn(
                    'px-4 py-2 text-right',
                    g.withPrimary < g.total && 'text-rose-600 font-semibold'
                  )}
                >
                  {g.withPrimary}/{g.total}
                </td>
                <td
                  className={cn(
                    'px-4 py-2 text-right',
                    g.withPosts < g.total && 'text-amber-600 font-semibold'
                  )}
                >
                  {g.withPosts}/{g.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chi tiết từng kênh */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 text-zinc-500 text-xs">
            <tr>
              <th className="text-left font-medium px-3 py-2">Platform</th>
              <th className="text-left font-medium px-3 py-2">Kênh</th>
              <th className="text-left font-medium px-3 py-2">Trạng thái</th>
              <th className="text-left font-medium px-3 py-2">Primary</th>
              <th className="text-right font-medium px-3 py-2">Post 30d</th>
              <th className="text-left font-medium px-3 py-2">Metric cuối</th>
              <th className="text-right font-medium px-3 py-2">Follow +30d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const noPrimary = !r.primary_member;
              const noPosts = r.posts_30d === 0;
              return (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 capitalize text-zinc-700">{r.platform}</td>
                  <td className="px-3 py-2 font-medium text-zinc-900 max-w-[200px] truncate">
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{r.status}</td>
                  <td
                    className={cn(
                      'px-3 py-2',
                      noPrimary ? 'text-rose-600 font-semibold' : 'text-zinc-700'
                    )}
                  >
                    {r.primary_member ?? 'CHƯA GÁN'}
                    {r.editor_count > 0 && (
                      <span className="text-zinc-400"> (+{r.editor_count} editor)</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right',
                      noPosts ? 'text-amber-600 font-semibold' : 'text-zinc-700'
                    )}
                  >
                    {NUM.format(r.posts_30d)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {r.last_metric_date ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700">
                    {NUM.format(r.follow_growth_30d)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                  Chưa có kênh nào kết nối.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Chú giải cách đọc */}
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-5 py-4 text-xs text-zinc-600 space-y-1.5">
        <p>
          <span className="text-rose-600 font-semibold">Primary = CHƯA GÁN</span> → kênh
          chưa có người phụ trách → KHÔNG vào KPI team. Sửa: Channels → mở kênh →{' '}
          <b>Người phụ trách</b> → chọn 1 primary.
        </p>
        <p>
          <span className="text-amber-600 font-semibold">Post 30d = 0</span> (mà đã có
          primary) → kênh chưa ingest bài. Sửa: mở kênh bấm <b>Đồng bộ</b>; kênh Bundle
          (TikTok/YT/IG) bài import 3–15 phút qua poller.
        </p>
        <p>
          <b>Metric cuối</b> trống/cũ → followers/views chưa sync. Kênh Bundle cần kết
          nối còn hiệu lực.
        </p>
      </div>
    </div>
  );
}
