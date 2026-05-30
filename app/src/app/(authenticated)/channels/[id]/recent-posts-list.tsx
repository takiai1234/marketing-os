import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { ChannelPost } from '@/lib/queries/channel-detail';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Props {
  posts: ChannelPost[];
}

function truncate(text: string | null, max: number): string {
  if (!text) return '(Không có nội dung)';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// Format số: 1234 → 1.2k, 1234567 → 1.2M (gọn hơn cho UI list)
function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function RecentPostsList({ posts }: Props) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900 mb-4">Bài viết gần nhất</h2>

      {posts.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-6">Chưa có bài viết nào.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100">
          {posts.map((post) => {
            const postedAgo = post.postedAt
              ? formatDistanceToNow(new Date(post.postedAt), { addSuffix: true, locale: vi })
              : null;

            return (
              <li key={post.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                {/* Thumbnail */}
                {post.mediaUrl ? (
                  <img
                    src={post.mediaUrl}
                    alt="thumbnail"
                    className="size-14 shrink-0 rounded-lg object-cover bg-zinc-100"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-14 shrink-0 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-400 text-xs font-medium">
                    IMG
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700 leading-snug">
                    {truncate(post.content, 120)}
                  </p>

                  {/* Hàng 1: thời gian + ER badge + CTR badge (nếu có data) */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {postedAgo && (
                      <span className="text-xs text-zinc-400">{postedAgo}</span>
                    )}
                    {post.engagementRate !== null && (
                      <Badge variant="secondary" className="text-xs">
                        ER {(post.engagementRate * 100).toFixed(2)}%
                      </Badge>
                    )}
                    {/* CTR badge — chỉ hiện khi có data thực (clicks + impressions > 0).
                        Color-coded để admin scan nhanh: ≥2% = good (green), 1-2% =
                        average (zinc), <1% = poor (amber). FB benchmark CTR cho post
                        link ~1-3% organic. */}
                    {post.ctr !== null && (
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          post.ctr >= 0.02
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : post.ctr >= 0.01
                            ? 'bg-zinc-50 text-zinc-700 border-zinc-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                        title={`Click-Through Rate = ${post.clicks} clicks / ${post.views ?? '?'} impressions`}
                      >
                        CTR {(post.ctr * 100).toFixed(2)}%
                      </Badge>
                    )}
                  </div>

                  {/* Hàng 2: views + clicks + 3 metric (reactions/comments/shares).
                      views = video_views nếu post là video, fallback impressions.
                      clicks tách riêng vì không phải subset của views.
                      Ẩn hoàn toàn khi 0/null. */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
                    {post.views !== null && post.views > 0 && (
                      <span title="Lượt xem" className="flex items-center gap-1">
                        <span aria-hidden>👁</span>
                        <span className="tabular-nums">{formatCount(post.views)}</span>
                      </span>
                    )}
                    {post.clicks !== null && post.clicks > 0 && (
                      <span title="Lượt click" className="flex items-center gap-1">
                        <span aria-hidden>🖱</span>
                        <span className="tabular-nums">{formatCount(post.clicks)}</span>
                      </span>
                    )}
                    <span title="Tương tác" className="flex items-center gap-1">
                      <span aria-hidden>❤</span>
                      <span className="tabular-nums">{formatCount(post.reactions)}</span>
                    </span>
                    <span title="Bình luận" className="flex items-center gap-1">
                      <span aria-hidden>💬</span>
                      <span className="tabular-nums">{formatCount(post.comments)}</span>
                    </span>
                    <span title="Chia sẻ" className="flex items-center gap-1">
                      <span aria-hidden>🔁</span>
                      <span className="tabular-nums">{formatCount(post.shares)}</span>
                    </span>
                  </div>

                  {/* Hàng 3: nút Xem bài viết — anchor styled như Button outline */}
                  {post.permalinkUrl && (
                    <div className="mt-2">
                      <a
                        href={post.permalinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Xem bài viết
                      </a>
                    </div>
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
