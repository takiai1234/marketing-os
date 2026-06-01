'use client';

// "Top link/video click cao nhất" section — leaderboard top 10 posts by
// clicks trong 7/14/30 ngày. Click-to-toggle period giống Top Reach / Top
// Conversion ở /channels. Mỗi item compact: rank + thumbnail + content
// excerpt + clicks + CTR + channel.
//
// Note: section này TRƯỚC ĐÂY tên "Top link/video chuyển đổi" — gây hiểu
// nhầm vì data là CLICKS chứ không phải conversion thật (chưa có per-post
// conversion attribution). Đổi tên rõ ràng hơn 2026-06-01.
//
// Click row → mở permalink trong tab mới (xem bài thật trên FB).
// Click channel name → /channels/[id].

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type {
  LibraryTopConversion,
  TopConversionPeriod,
  TopConversionPost,
} from '@/lib/queries/library-top-conversion';
import { MousePointerClickIcon, AwardIcon, ExternalLinkIcon } from 'lucide-react';

// Inline const — không import value từ file `pg`-loaded (xem comment trong
// top-reach-leaderboard.tsx về Turbopack pulling Node `dns` vào client bundle).
const TOP_CONVERSION_PERIODS = [7, 14, 30] as const satisfies readonly TopConversionPeriod[];

interface Props {
  data: LibraryTopConversion;
  defaultPeriod?: TopConversionPeriod;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function truncate(text: string | null, max: number): string {
  if (!text) return '(Không có nội dung)';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

const PERIOD_LABELS: Record<TopConversionPeriod, string> = {
  7: '7 ngày',
  14: '14 ngày',
  30: '30 ngày',
};

const POST_TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  link: { label: 'LINK', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  video: { label: 'VIDEO', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  reel: { label: 'REEL', cls: 'bg-pink-50 text-pink-700 border-pink-200' },
};

export function TopConversionSection({ data, defaultPeriod = 7 }: Props) {
  const [period, setPeriod] = useState<TopConversionPeriod>(defaultPeriod);
  const posts = data.byPeriod[period] ?? [];

  if (data.totalPostsWithClicks === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <Header period={period} setPeriod={setPeriod} totalPosts={0} />
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
          <p className="text-sm text-zinc-600">
            Chưa có click data cho bài link/video/reel. Đợi cron posts-ingestion
            kế tiếp (9:30 / 17:30 / 1:30 VN) hoặc bấm{' '}
            <strong>Đồng bộ ngay</strong> ở /channels/[id].
          </p>
        </div>
      </section>
    );
  }

  const maxClicks = posts[0]?.clicks ?? 1;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <Header
        period={period}
        setPeriod={setPeriod}
        totalPosts={data.totalPostsWithClicks}
      />

      {posts.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center">
          <p className="text-sm text-zinc-600">
            Không có post link/video/reel có click trong {PERIOD_LABELS[period]}{' '}
            qua. Thử window dài hơn.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {posts.map((post, idx) => (
            <LeaderboardRow
              key={post.postId}
              post={post}
              rank={idx + 1}
              maxClicks={maxClicks}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function Header({
  period,
  setPeriod,
  totalPosts,
}: {
  period: TopConversionPeriod;
  setPeriod: (p: TopConversionPeriod) => void;
  totalPosts: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 shrink-0">
          <MousePointerClickIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 text-base leading-tight">
            Top link / video click cao nhất
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Sắp xếp post link / video / reel theo lượt click ·{' '}
            {totalPosts} post có data
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 shrink-0">
        {TOP_CONVERSION_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              period === p
                ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            )}
            aria-pressed={period === p}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

function LeaderboardRow({
  post,
  rank,
  maxClicks,
}: {
  post: TopConversionPost;
  rank: number;
  maxClicks: number;
}) {
  const barPercent = maxClicks > 0 ? (post.clicks / maxClicks) * 100 : 0;
  const typeMeta = POST_TYPE_LABEL[post.postType] ?? {
    label: post.postType.toUpperCase(),
    cls: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  };

  let postedAgo = '';
  try {
    postedAgo = formatDistanceToNow(parseISO(post.publishedAt), {
      addSuffix: true,
      locale: vi,
    });
  } catch {
    postedAgo = '';
  }

  // CTR badge color — same convention với recent-posts-list:
  //   ≥2% emerald, 1-2% zinc, <1% amber.
  const ctrColor =
    post.ctr === null ? ''
    : post.ctr >= 0.02 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : post.ctr >= 0.01 ? 'bg-zinc-50 text-zinc-700 border-zinc-200'
    :                    'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <li>
      <div className="group flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-violet-200 hover:bg-violet-50/30 transition-colors">
        {/* Rank badge */}
        <div
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-xs font-bold shrink-0 mt-0.5',
            rank === 1 && 'bg-amber-100 text-amber-700',
            rank === 2 && 'bg-zinc-200 text-zinc-700',
            rank === 3 && 'bg-orange-100 text-orange-700',
            rank > 3 && 'bg-zinc-100 text-zinc-500'
          )}
        >
          {rank === 1 ? <AwardIcon className="size-4" /> : rank}
        </div>

        {/* Thumbnail */}
        {post.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.mediaUrl}
            alt=""
            className="size-12 shrink-0 rounded-md object-cover bg-zinc-100"
            loading="lazy"
          />
        ) : (
          <div className="size-12 shrink-0 rounded-md bg-zinc-100 flex items-center justify-center text-zinc-400 text-[10px] font-medium">
            IMG
          </div>
        )}

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Row 1: type badge + channel name + posted-ago */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-1">
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded border font-semibold',
                typeMeta.cls
              )}
            >
              {typeMeta.label}
            </span>
            <Link
              href={`/channels/${post.accountId}`}
              className="text-zinc-700 font-medium hover:text-violet-700 truncate"
            >
              {post.accountName}
            </Link>
            {postedAgo && (
              <span className="text-zinc-400">· {postedAgo}</span>
            )}
          </div>

          {/* Row 2: content excerpt */}
          <p className="text-sm text-zinc-700 leading-snug line-clamp-2">
            {truncate(post.content, 140)}
          </p>

          {/* Row 3: clicks bar + clicks count + CTR + external link */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden min-w-[40px]">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  rank === 1 && 'bg-amber-500',
                  rank === 2 && 'bg-zinc-400',
                  rank === 3 && 'bg-orange-400',
                  rank > 3 && 'bg-violet-500'
                )}
                style={{ width: `${Math.max(barPercent, 3)}%` }}
              />
            </div>

            <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 tabular-nums shrink-0">
              <MousePointerClickIcon className="size-3 text-zinc-400" />
              {formatCount(post.clicks)}
            </span>

            {post.ctr !== null && (
              <span
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold tabular-nums shrink-0',
                  ctrColor
                )}
                title={`CTR = ${post.clicks} clicks / ${post.impressions} impressions`}
              >
                CTR {(post.ctr * 100).toFixed(2)}%
              </span>
            )}

            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-violet-600 shrink-0"
                title="Mở bài viết gốc"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
