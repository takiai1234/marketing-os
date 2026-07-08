'use client';

import { useState } from 'react';
import { LarkBaseTable } from './lark-base-table';
import { cn } from '@/lib/utils';

interface SlotData {
  configured: boolean;
  records: { record_id: string; fields: { [key: string]: unknown } }[];
  columns: string[];
  total: number;
  error: string | null;
}

interface Props {
  marketing: SlotData;
  order: SlotData;
  dashboardMktUrl: string | null;
  dashboardOrderUrl: string | null;
}

function LarkIframe({ url }: { url: string }) {
  return (
    <div className="rounded-xl border overflow-hidden bg-white" style={{ height: '80vh' }}>
      <iframe
        src={url}
        className="w-full h-full border-0"
        allow="fullscreen"
        title="Lark Dashboard"
      />
    </div>
  );
}

function SlotContent({ data, dashboardUrl, label }: { data: SlotData; dashboardUrl: string | null; label: string }) {
  const [view, setView] = useState<'dashboard' | 'table'>(dashboardUrl ? 'dashboard' : 'table');

  return (
    <div className="flex flex-col gap-3">
      {/* Toggle nếu có cả 2 */}
      {dashboardUrl && data.configured && (
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-lg w-fit">
          <button
            onClick={() => setView('dashboard')}
            className={cn('px-3 py-1 text-xs rounded-md transition-colors', view === 'dashboard' ? 'bg-white shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-700')}
          >
            Bảng điều khiển
          </button>
          <button
            onClick={() => setView('table')}
            className={cn('px-3 py-1 text-xs rounded-md transition-colors', view === 'table' ? 'bg-white shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-700')}
          >
            Dữ liệu bảng
          </button>
        </div>
      )}

      {/* Dashboard iframe */}
      {view === 'dashboard' && dashboardUrl && <LarkIframe url={dashboardUrl} />}

      {/* Table data */}
      {view === 'table' && (
        !data.configured ? (
          <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center text-sm text-zinc-400">
            {label} chưa được cấu hình.{' '}
            <a href="/settings/integrations" className="underline text-blue-500">Settings → Tích hợp</a>
          </div>
        ) : data.error ? (
          <div className="rounded-xl bg-red-50 ring-1 ring-red-200 px-5 py-4 text-sm text-red-800">
            <strong>Lỗi:</strong> {data.error}
          </div>
        ) : data.records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center text-sm text-zinc-400">
            Bảng trống.
          </div>
        ) : (
          <LarkBaseTable columns={data.columns} records={data.records} total={data.total} />
        )
      )}

      {/* Chỉ có dashboard, không có table */}
      {!data.configured && dashboardUrl && view === 'dashboard' && null}
    </div>
  );
}

export function LarkBaseTabs({ marketing, order, dashboardMktUrl, dashboardOrderUrl }: Props) {
  const [tab, setTab] = useState<'marketing' | 'order'>('marketing');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b">
        {[
          { key: 'marketing' as const, label: '📊 Dashboard Marketing' },
          { key: 'order'     as const, label: '📋 Order Media' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'marketing' && (
        <SlotContent data={marketing} dashboardUrl={dashboardMktUrl} label="Dashboard Marketing" />
      )}
      {tab === 'order' && (
        <SlotContent data={order} dashboardUrl={dashboardOrderUrl} label="Order Media" />
      )}
    </div>
  );
}
