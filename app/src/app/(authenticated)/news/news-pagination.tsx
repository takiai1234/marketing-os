'use client';

// Phân trang dạng số cho /news. Giữ nguyên filter ?source= khi đổi trang.
// Hiển thị cửa sổ trang quanh trang hiện tại + nút Trước/Sau + first/last.
//
// Pattern: dùng searchParams làm nguồn sự thật (deep-link, back/forward chạy).

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
}

/** Tạo dãy số trang có "…" rút gọn: 1 … 4 5 [6] 7 8 … 20. */
function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function NewsPagination({ page, totalPages }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function go(target: number) {
    if (target < 1 || target > totalPages || target === page) return;
    const params = new URLSearchParams(searchParams.toString());
    if (target === 1) params.delete('page');
    else params.set('page', String(target));
    const qs = params.toString();
    router.push('/news' + (qs ? '?' + qs : ''));
  }

  const items = buildPageList(page, totalPages);
  const btnBase =
    'inline-flex items-center justify-center min-w-9 h-9 px-2.5 rounded-lg text-sm font-medium transition-colors';

  return (
    <nav className="flex items-center justify-center gap-1.5 flex-wrap pt-2" aria-label="Phân trang">
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className={
          btnBase +
          ' ring-1 ring-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-default'
        }
        aria-label="Trang trước"
      >
        <ChevronLeft className="size-4" />
      </button>

      {items.map((it, i) =>
        it === 'ellipsis' ? (
          <span key={`e${i}`} className="px-1 text-zinc-400 select-none">
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => go(it)}
            aria-current={it === page ? 'page' : undefined}
            className={
              btnBase +
              (it === page
                ? ' bg-zinc-900 text-white'
                : ' ring-1 ring-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
            }
          >
            {it}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className={
          btnBase +
          ' ring-1 ring-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-default'
        }
        aria-label="Trang sau"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
