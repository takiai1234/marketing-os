// Card hiển thị 1 tin tức AI — server component, không có client interactivity.
// Click vào card mở link bài viết ở tab mới (target=_blank).
//
// Cover image: render <img> nếu có URL, else fallback gradient theo source.

import { ExternalLink } from 'lucide-react';
import { getSourceById } from '@/lib/news/sources';
import type { StoredNewsItem } from '@/lib/news/news-db';
import { RewriteButton } from '@/components/rewrite/rewrite-button';
import { NewsCoverImage } from './news-cover-image';
import { NewsDeleteButton } from './news-delete-button';

/** Format "Xh trước" / "Xd trước" / "DD/MM" — pattern giống library/post-card. */
function formatRelativeDate(isoStr: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'Vừa xong';
  if (diffH < 24) return `${diffH}h trước`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d trước`;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** Rút gọn số: 1234 → "1.2k", 1_200_000 → "1.2M" */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Hiển thị inline likes + shares nếu có giá trị. */
function EngagementBadge({
  likesCount,
  sharesCount,
}: {
  likesCount: number | null;
  sharesCount: number | null;
}) {
  // null = nguồn không có engagement data (RSS, web clips) → ẩn hoàn toàn
  if (likesCount === null && sharesCount === null) return null;
  return (
    <span className="flex items-center gap-1.5 shrink-0 text-[10px] text-zinc-400">
      <span title="Likes">❤ {fmtCount(likesCount ?? 0)}</span>
      <span title="Shares">↻ {fmtCount(sharesCount ?? 0)}</span>
    </span>
  );
}

const FALLBACK_GRADIENT = 'from-zinc-400 to-zinc-600';

// Gradient + label cho social source mới (twitter:user, facebook:page).
// Map sang gradient riêng theo platform để UI phân biệt visual.
const SOCIAL_GRADIENTS: Record<string, string> = {
  twitter: 'from-sky-400 to-blue-600',
  facebook: 'from-indigo-500 to-blue-700',
  facebook_ads: 'from-rose-500 to-pink-600',
  web: 'from-teal-400 to-emerald-600',
};

/** Resolve source → { name, gradient }.
 *  - RSS source: lookup từ NEWS_SOURCES registry
 *  - Social source format "twitter:sama" / "facebook:HoangChironCTO" /
 *    "facebook_ads:PageName":
 *    - name = "X @sama" / "FB HoangChironCTO" / "FB Ads PageName"
 *    - gradient theo platform
 *  Lưu ý "facebook_ads" phải check TRƯỚC "facebook" vì cùng tiền tố. */
function resolveSource(rawSource: string): { name: string; gradient: string } {
  if (rawSource.startsWith('facebook_ads:')) {
    const handle = rawSource.slice('facebook_ads:'.length);
    return {
      name: `FB Ads ${handle}`,
      gradient: SOCIAL_GRADIENTS.facebook_ads!,
    };
  }
  if (rawSource.startsWith('web:')) {
    const domain = rawSource.slice('web:'.length);
    return {
      name: `Web · ${domain}`,
      gradient: SOCIAL_GRADIENTS.web!,
    };
  }
  if (rawSource.startsWith('twitter:') || rawSource.startsWith('facebook:')) {
    const [platform, handle] = rawSource.split(':');
    const platformLabel =
      platform === 'twitter' ? `@${handle}` : (handle ?? rawSource);
    const prefix = platform === 'twitter' ? 'X' : 'FB';
    return {
      name: `${prefix} ${platformLabel}`,
      gradient: SOCIAL_GRADIENTS[platform!] ?? FALLBACK_GRADIENT,
    };
  }
  const meta = getSourceById(rawSource);
  return {
    name: meta?.name ?? rawSource,
    gradient: meta?.gradient ?? FALLBACK_GRADIENT,
  };
}

interface NewsItemCardProps {
  item: StoredNewsItem;
}

export function NewsItemCard({ item }: NewsItemCardProps) {
  const { name: sourceName, gradient } = resolveSource(item.source);

  // Build source content cho AI rewrite — title + excerpt (nếu có)
  const aiSourceContent = item.excerpt
    ? `${item.title}\n\n${item.excerpt}`
    : item.title;

  return (
    <div className="relative group">
      {/* Nút ẩn bài — sibling của <a> (không lồng trong link) */}
      <NewsDeleteButton id={item.id} />
      <a
      href={item.link}
      target="_blank"
      // rel noopener: chống tab-nabbing
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl bg-white ring-1 ring-zinc-200 overflow-hidden hover:ring-blue-400 hover:shadow-md transition-all"
    >
      {/* Cover image — aspect 16/9 cố định. Client subcomponent handle
          onError fallback (FB CDN expire token, image 404, CORS block...) */}
      <div className="relative">
        <NewsCoverImage
          src={item.coverImage}
          gradient={gradient}
          fallbackLabel={sourceName}
        />
        {/* Badge nguồn — overlay góc trái-trên */}
        <span className="absolute top-2 left-2 rounded-md bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white">
          {sourceName}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
            {item.title}
          </h3>
          <ExternalLink className="size-3.5 shrink-0 text-zinc-400 group-hover:text-blue-600 mt-0.5" />
        </div>

        {item.excerpt && (
          <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
            {item.excerpt}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 mt-auto pt-2 border-t border-zinc-100">
          <div className="flex items-center gap-2 min-w-0">
            {item.pubDate ? (
              <time dateTime={item.pubDate}>{formatRelativeDate(item.pubDate)}</time>
            ) : (
              <span>Mới ingest</span>
            )}
            <EngagementBadge likesCount={item.likesCount} sharesCount={item.sharesCount} />
          </div>
          <RewriteButton
            sourceType="news"
            sourceTitle={item.title}
            sourceContent={aiSourceContent}
            sourceContext={sourceName}
            sourcePlatform={null}
            variant="inline"
          />
        </div>
      </div>
      </a>
    </div>
  );
}
