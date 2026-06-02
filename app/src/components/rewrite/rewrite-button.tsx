'use client';

// Button "Viết lại" mở RewriteDialog. Mặc định compact (icon + text nhỏ),
// có 2 variant: 'inline' (text bên cạnh icon) và 'icon-only' (chỉ icon).
//
// Lazy-load RewriteDialog để giảm initial bundle size — dialog logic +
// model list chỉ tải khi user thực sự click button.

import { useState, lazy, Suspense, type MouseEvent } from 'react';
import { SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RewriteSourceType } from '@/lib/rewrite/build-prompt';

const RewriteDialog = lazy(() =>
  import('./rewrite-dialog').then((m) => ({ default: m.RewriteDialog }))
);

interface Props {
  sourceType: RewriteSourceType;
  sourceTitle: string | null;
  sourceContent: string;
  sourceContext: string | null;
  sourcePlatform: string | null;
  /** 'inline' (icon + text) | 'icon' (chỉ icon, smaller) */
  variant?: 'inline' | 'icon';
  /** Class custom override */
  className?: string;
}

export function RewriteButton({
  sourceType,
  sourceTitle,
  sourceContent,
  sourceContext,
  sourcePlatform,
  variant = 'inline',
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  function handleClick(e: MouseEvent) {
    // Card thường là <a target="_blank"> wrap toàn bộ → ngăn parent navigate
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  // Skip render hoàn toàn nếu source content quá ngắn — không bài để rewrite
  if (!sourceContent || sourceContent.trim().length < 20) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Viết lại bài viết tương tự bằng AI"
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-medium transition',
          'bg-violet-50 text-violet-700 hover:bg-violet-100 ring-1 ring-violet-200 hover:ring-violet-300',
          variant === 'inline'
            ? 'px-2 py-1 text-[11px]'
            : 'p-1.5 text-xs',
          className
        )}
      >
        <SparklesIcon className={variant === 'inline' ? 'size-3' : 'size-3.5'} />
        {variant === 'inline' && <span>Viết lại</span>}
      </button>

      {/* Dialog lazy-load — chỉ mount khi user open lần đầu */}
      {open && (
        <Suspense fallback={null}>
          <RewriteDialog
            open={open}
            onOpenChange={setOpen}
            sourceType={sourceType}
            sourceTitle={sourceTitle}
            sourceContent={sourceContent}
            sourceContext={sourceContext}
            sourcePlatform={sourcePlatform}
          />
        </Suspense>
      )}
    </>
  );
}
