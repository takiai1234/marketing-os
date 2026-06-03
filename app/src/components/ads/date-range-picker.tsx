'use client';

// Segmented control 7d/14d/30d/90d + Custom popover (2 date inputs).
// Update URL ?range=X (hoặc ?range=custom&from=&to=) via router.push,
// trigger server re-render.

import { useState, useTransition, FormEvent } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import type { DateRangePreset } from '@/lib/ads/date-ranges';
import { PRESET_LABELS } from '@/lib/ads/date-ranges';

interface Props {
  /** Current range — pass từ server page sau khi parse */
  currentPreset: DateRangePreset;
  currentFrom: string;
  currentTo: string;
}

const PRESETS: Exclude<DateRangePreset, 'custom'>[] = ['7d', '14d', '30d', '90d'];

export function DateRangePicker({ currentPreset, currentFrom, currentTo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(currentPreset === 'custom');
  const [customFrom, setCustomFrom] = useState(currentFrom);
  const [customTo, setCustomTo] = useState(currentTo);

  function applyPreset(preset: Exclude<DateRangePreset, 'custom'>) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('range', preset);
    sp.delete('from');
    sp.delete('to');
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    setShowCustom(false);
  }

  function applyCustom(e: FormEvent) {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('range', 'custom');
    sp.set('from', customFrom);
    sp.set('to', customTo);
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset buttons */}
      <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyPreset(p)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              currentPreset === p
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
            )}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            currentPreset === 'custom'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
          )}
        >
          <CalendarIcon className="size-3" />
          Tuỳ chỉnh
        </button>
      </div>

      {/* Display current range as text khi đang custom */}
      {currentPreset === 'custom' && !showCustom && (
        <span className="text-[11px] text-zinc-500 font-mono">
          {currentFrom} → {currentTo}
        </span>
      )}

      {/* Custom popover (inline form) */}
      {showCustom && (
        <form
          onSubmit={applyCustom}
          className="inline-flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-2 py-1.5 shadow-sm"
        >
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="text-xs border-0 outline-none p-0 font-mono"
            required
          />
          <span className="text-xs text-zinc-400">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="text-xs border-0 outline-none p-0 font-mono"
            required
          />
          <button
            type="submit"
            className="ml-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-700"
          >
            Áp dụng
          </button>
        </form>
      )}
    </div>
  );
}
