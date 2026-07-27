'use client';

// Component chọn thứ tự sắp xếp tin tức.
// URL param ?sort=engagement để sort theo likes+shares. Không có = mới nhất.

import { useRouter, useSearchParams } from 'next/navigation';

const SORT_OPTIONS = [
  { value: '', label: 'Mới nhất' },
  { value: 'engagement', label: 'Nhiều tương tác' },
] as const;

export function NewsSortSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get('sort') ?? '';

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') {
      params.delete('sort');
    } else {
      params.set('sort', value);
    }
    params.delete('page');
    const qs = params.toString();
    router.push('/news' + (qs ? '?' + qs : ''));
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1 -mb-1">
      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">
        Sắp xếp
      </span>
      {SORT_OPTIONS.map((opt) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value || 'newest'}
            type="button"
            onClick={() => handleSelect(opt.value)}
            className={
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ' +
              (isActive
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
