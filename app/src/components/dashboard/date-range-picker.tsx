'use client';

// Dashboard date range picker: 4 preset (7/14/30/90) + "Tuỳ chỉnh" custom popover.
// Write URL: ?range=N (preset) hoặc ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
// Server page resolve qua resolveRangeFromSearchParams() → pass to queries.
//
// Tương tự component ở /ads (date-range-picker.tsx) nhưng URL params dùng
// 'range' (số int hoặc 'custom') thay vì preset-id pattern.

import { useState, useTransition, FormEvent } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import {
  TIME_RANGE_OPTIONS,
  type TimeRangeDays,
} from '@/lib/dashboard/time-range';

const PRESET_LABELS: Record<TimeRangeDays, string> = {
  7: '7 ngày',
  14: '14 ngày',
  30: '30 ngày',
  90: '90 ngày',
};

interface Props {
  /** Đang chọn preset (7/14/30/90) hay custom? */
  currentMode: 'preset' | 'custom';
  currentPreset: TimeRangeDays | null;
  currentFromIso: string;
  currentToIso: string;
}

export function DashboardDateRangePicker({
  currentMode,
  currentPreset,
  currentFromIso,
  currentToIso,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(currentMode === 'custom');
  const [customFrom, setCustomFrom] = useState(currentFromIso);
  const [customTo, setCustomTo] = useState(currentToIso);

  function applyPreset(days: TimeRangeDays) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('range', String(days));
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
    <div className="flex items-center gap-2 flex-wrap" aria-label="Khung thời gian">
      {/* Preset segmented + custom toggle */}
      <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
        {TIME_RANGE_OPTIONS.map((days) => {
          const isActive = currentMode === 'preset' && currentPreset === days;
          return (
            <button
              key={days}
              type="button"
              onClick={() => applyPreset(days)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              {PRESET_LABELS[days]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            currentMode === 'custom'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          )}
        >
          <CalendarIcon className="size-3" />
          Tuỳ chỉnh
        </button>
      </div>

      {/* Display current custom range text when popover closed */}
      {currentMode === 'custom' && !showCustom && (
        <span className="text-[11px] text-zinc-500 font-mono">
          {currentFromIso} → {currentToIso}
        </span>
      )}

      {/* Custom popover inline form */}
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
            max={customTo || undefined}
          />
          <span className="text-xs text-zinc-400">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="text-xs border-0 outline-none p-0 font-mono"
            required
            min={customFrom || undefined}
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
