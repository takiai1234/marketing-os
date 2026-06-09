'use client';

// Segmented control để chọn nhóm kênh hiển thị trên dashboard.
// "Tổng" = không filter (all kênh). Các tab khác = filter theo channel_tag.slug.
//
// Tab "Tổng" KHÔNG ghi tag param vào URL (giữ URL sạch — /dashboard thay vì
// /dashboard?tag=all). Các tag khác ghi ?tag=<slug>.
//
// Server Component DashboardPage đọc searchParams.tag → pass xuống tất cả
// queries qua tagSlug. URL change → Next.js re-render với data mới.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

export interface ChannelTagOption {
  /** null = tab "Tổng" (no filter). */
  slug: string | null;
  label: string;
}

interface ChannelTagTabsProps {
  /** Slug đang được chọn — null = "Tổng". */
  current: string | null;
  /** Danh sách tag từ DB (đã sort) + tab "Tổng" prepended bởi caller. */
  options: ChannelTagOption[];
}

export function ChannelTagTabs({ current, options }: ChannelTagTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setTag(slug: string | null) {
    if (slug === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (slug === null) {
      params.delete('tag');
    } else {
      params.set('tag', slug);
    }
    const queryStr = params.toString();
    startTransition(() => {
      router.push(queryStr ? `${pathname}?${queryStr}` : pathname);
    });
  }

  return (
    <div
      className={cn(
        'inline-flex flex-wrap rounded-lg bg-zinc-100 p-0.5 text-xs',
        isPending && 'opacity-60'
      )}
      role="tablist"
      aria-label="Nhóm kênh"
    >
      {options.map((opt) => {
        const isActive = current === opt.slug;
        return (
          <button
            key={opt.slug ?? '__all'}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setTag(opt.slug)}
            disabled={isPending}
            className={cn(
              'px-3 py-1.5 rounded-md font-medium transition-colors',
              isActive
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
