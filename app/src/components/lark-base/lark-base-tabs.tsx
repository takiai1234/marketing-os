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
}

function SlotContent({ data, label }: { data: SlotData; label: string }) {
  if (!data.configured) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center text-sm text-zinc-400">
        {label} chưa được cấu hình.{' '}
        <a href="/settings/integrations" className="underline text-blue-500">Settings → Tích hợp</a>
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="rounded-xl bg-red-50 ring-1 ring-red-200 px-5 py-4 text-sm text-red-800">
        <strong>Lỗi:</strong> {data.error}
      </div>
    );
  }
  if (data.records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center text-sm text-zinc-400">
        Bảng trống.
      </div>
    );
  }
  return <LarkBaseTable columns={data.columns} records={data.records} total={data.total} />;
}

export function LarkBaseTabs({ marketing, order }: Props) {
  const [tab, setTab] = useState<'marketing' | 'order'>('marketing');

  const tabs = [
    { key: 'marketing' as const, label: '📊 Dashboard Marketing', count: marketing.total },
    { key: 'order'     as const, label: '📋 Order Media',          count: order.total },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-xs text-zinc-400">({t.count.toLocaleString('vi-VN')})</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'marketing' && <SlotContent data={marketing} label="Dashboard Marketing" />}
      {tab === 'order'     && <SlotContent data={order}     label="Order Media" />}
    </div>
  );
}
