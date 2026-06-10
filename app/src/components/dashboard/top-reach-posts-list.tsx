// Dashboard widget: Top Reach các bài trên các kênh + nút "Viết lại".
// Thay thế card "Active Campaigns" (mock data) — show bài viral thật để
// admin có thể remix nhanh bằng AI.
//
// Server component nhận data từ dashboard page (fetchTopReachPosts).
// RewriteButton là client component lazy-load nên overall card vẫn nhẹ.

import Link from 'next/link';
import { RewriteButton } from '@/components/rewrite/rewrite-button';
import type { TopReachPost } from '@/lib/queries/dashboard-top-reach-posts';

interface Props {
  posts: TopReachPost[];
  /** Số ngày trong window. Dùng cho subtitle. */
  days: number;
}

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('vi-VN');
}

function truncate(text: string | null, max: number): string {
  if (!text || text.trim() === '') return '(Không có nội dung)';
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

// Badge nhỏ cho post type — giúp scan nhanh
type PostBadge = { label: string; cls: string };
const POST_TYPE_BADGE: Record<string, PostBadge> = {
  status:  { label: 'STATUS', cls: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
  photo:   { label: 'ẢNH',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  video:   { label: 'VIDEO',  cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  reel:    { label: 'REEL',   cls: 'bg-pink-50 text-pink-700 border-pink-200' },
  link:    { label: 'LINK',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  album:   { label: 'ALBUM',  cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};
const DEFAULT_BADGE: PostBadge = POST_TYPE_BADGE.status!;

export function TopReachPostsList({ posts, days }: Props) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-700">
            Top Reach bài viết
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Các bài reach cao nhất trên các kênh · {days} ngày qua
          </p>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-zinc-400 text-center">
            Chưa có data reach cho bài viết trong {days} ngày qua.
            <br />
            Đợi cron sync hoặc onboard kênh mới.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 flex-1">
          {posts.map((p, idx) => {
            const badge = POST_TYPE_BADGE[p.postType] ?? DEFAULT_BADGE;
            return (
              <li
                key={p.postId}
                className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1.5"
              >
                {/* Row 1: rank + badge + reach + rewrite button */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-400 tabular-nums w-4 shrink-0">
                    #{idx + 1}
                  </span>
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide border ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <span className="ml-auto text-xs font-semibold text-zinc-800 tabular-nums">
                    {formatReach(p.totalReach)} reach
                  </span>
                  <RewriteButton
                    sourceType="library_post"
                    sourceTitle={null}
                    sourceContent={p.content ?? ''}
                    sourceContext={`Bài viết từ kênh ${p.accountName} (${p.platform}), reach ${formatReach(p.totalReach)} trong ${days} ngày qua.`}
                    sourcePlatform={p.platform}
                    variant="icon"
                  />
                </div>

                {/* Row 2: content preview */}
                <p className="text-xs text-zinc-700 leading-snug line-clamp-2">
                  {truncate(p.content, 140)}
                </p>

                {/* Row 3: channel link + permalink */}
                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                  <Link
                    href={`/channels/${p.accountId}`}
                    className="truncate hover:text-blue-600 hover:underline"
                    title={p.accountName}
                  >
                    {p.accountName}
                  </Link>
                  {p.permalink && (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 hover:text-blue-600 hover:underline"
                    >
                      Xem bài ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
