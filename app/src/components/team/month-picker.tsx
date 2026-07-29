'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthPickerProps {
  current: string; // "YYYY-MM"
}

export function MonthPicker({ current }: MonthPickerProps) {
  const router = useRouter();
  const parts = current.split('-');
  const year  = Number(parts[0] ?? 2026);
  const month = Number(parts[1] ?? 1);

  const navigate = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    router.push(`/team?month=${y}-${String(m).padStart(2, '0')}`);
  };

  const label = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center size-7 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
        aria-label="Tháng trước"
      >
        <ChevronLeft className="size-4" />
      </button>

      <span className="text-sm font-medium text-zinc-700 min-w-[130px] text-center capitalize">
        {label}
      </span>

      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="flex items-center justify-center size-7 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Tháng sau"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
