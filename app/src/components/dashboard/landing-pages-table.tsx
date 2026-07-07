import Link from 'next/link';
import { ExternalLinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardLandingPage } from '@/lib/queries/dashboard-landing-pages';

const NUMBER_FMT = new Intl.NumberFormat('vi-VN');

function rateColor(rate: number | null): string {
  if (rate === null) return 'text-zinc-400';
  if (rate >= 15) return 'text-emerald-700 bg-emerald-50 ring-emerald-200';
  if (rate >= 8)  return 'text-teal-700 bg-teal-50 ring-teal-200';
  if (rate >= 3)  return 'text-amber-700 bg-amber-50 ring-amber-200';
  return 'text-rose-700 bg-rose-50 ring-rose-200';
}

interface Props {
  data: DashboardLandingPage[];
}

export function LandingPagesTable({ data }: Props) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">Landing Pages</h3>
        <Link
          href="/landing-pages"
          className="text-[11px] text-zinc-500 hover:text-blue-600 flex items-center gap-0.5"
        >
          Xem tất cả <ExternalLinkIcon className="size-3" />
        </Link>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-zinc-400 italic px-4 py-6 text-center">
          Chưa có landing page nào. Vào <strong>Landing Pages</strong> để thêm.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Landing Page</th>
                <th className="text-right px-3 py-2 font-medium">Sessions 30d</th>
                <th className="text-right px-3 py-2 font-medium">Leads 30d</th>
                <th className="text-right px-3 py-2 font-medium">Tỉ lệ %</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {data.map((lp) => (
                <tr key={lp.id} className="hover:bg-zinc-50/50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-zinc-900 truncate max-w-[180px]">{lp.name}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[180px]">
                      {lp.pagePath} · prop {lp.ga4PropertyId}
                    </p>
                    {lp.sheetName && (
                      <p className="text-[10px] text-teal-600 mt-0.5">↳ Sheet: {lp.sheetName}</p>
                    )}
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-zinc-700">
                    {NUMBER_FMT.format(lp.sessions30d)}
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums font-semibold text-zinc-900">
                    {NUMBER_FMT.format(lp.leads30d)}
                  </td>
                  <td className="text-right px-3 py-2.5">
                    {lp.conversionRate !== null ? (
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1', rateColor(lp.conversionRate))}>
                        {lp.conversionRate.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="text-center px-3 py-2.5">
                    {lp.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 rounded-full">
                        <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-zinc-50 ring-1 ring-zinc-200 px-1.5 py-0.5 rounded-full">
                        <span className="size-1.5 rounded-full bg-zinc-400 inline-block" />
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
