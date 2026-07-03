'use client';

import { useState, FormEvent } from 'react';
import { toast } from 'sonner';
import {
  PlusIcon, Trash2Icon, RefreshCwIcon, Loader2Icon, GlobeIcon, CheckCircle2Icon, PencilIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface LandingPage {
  id: string;
  name: string;
  pagePath: string;
  ga4PropertyId: string;
  sheetId: string | null;
  sheetName: string | null;
  isActive: boolean;
  sessions30d: number;
  leads30d: number;
  conversionRate: number | null;
}

interface Props {
  initialPages: LandingPage[];
}

const inputCls = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50';

function ConversionBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-zinc-400 text-xs">—</span>;
  const cls =
    rate >= 3 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : rate >= 1 ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-red-50 text-red-700 ring-red-200';
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-semibold ring-1', cls)}>
      {rate.toFixed(2)}%
    </span>
  );
}

function AddPageDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pagePath, setPagePath] = useState('/');
  const [propertyId, setPropertyId] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(''); setPagePath('/'); setPropertyId('');
    setSheetId(''); setSheetName(''); setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          pagePath,
          ga4PropertyId: propertyId,
          sheetId: sheetId.trim() || null,
          sheetName: sheetName.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success('Đã thêm landing page');
        setOpen(false); reset(); onCreated();
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? 'Lỗi không xác định');
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); }}>
      <DialogTrigger className={cn('inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-700 transition-colors')}>
        <PlusIcon className="size-3.5" /> Thêm landing page
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm landing page mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">Tên hiển thị</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)}
              placeholder="VD: AI Power Landing Page" required disabled={loading} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">Page path (GA4)</label>
            <input className={inputCls} value={pagePath} onChange={e => setPagePath(e.target.value)}
              placeholder="VD: / hoặc /san-pham/ai-power" required disabled={loading} />
            <p className="text-[11px] text-zinc-400">Đúng theo path trong GA4 → Reports → Pages</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">GA4 Property ID</label>
            <input className={inputCls} value={propertyId} onChange={e => setPropertyId(e.target.value)}
              placeholder="VD: 498041843" required disabled={loading} inputMode="numeric" />
            <p className="text-[11px] text-zinc-400">Số ở dưới tên domain trong Google Analytics → Quản trị → Chi tiết tài sản</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">Google Sheet ID (lead)</label>
            <input className={inputCls} value={sheetId} onChange={e => setSheetId(e.target.value)}
              placeholder="VD: 1OdOFIYD6NRfMLp6PkpQGs4guJhg8WSrFe9noIWWaJPQ" disabled={loading} />
            <p className="text-[11px] text-zinc-400">Phần ID trong URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">Tên tab trong Sheet</label>
            <input className={inputCls} value={sheetName} onChange={e => setSheetName(e.target.value)}
              placeholder="VD: Sheet1 hoặc DATA PHẾU 2025" disabled={loading} />
            <p className="text-[11px] text-zinc-400">Đúng tên tab ở dưới cùng Google Sheet</p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" disabled={loading} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2Icon className="size-4 animate-spin mr-1.5" />}
              {loading ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPageDialog({ page, onSaved }: { page: LandingPage; onSaved: (updated: Partial<LandingPage>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(page.name);
  const [sheetId, setSheetId] = useState(page.sheetId ?? '');
  const [sheetName, setSheetName] = useState(page.sheetName ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setName(page.name);
      setSheetId(page.sheetId ?? '');
      setSheetName(page.sheetName ?? '');
      setError(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/landing-pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sheetId: sheetId.trim() || null,
          sheetName: sheetName.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success('Đã cập nhật');
        setOpen(false);
        onSaved({
          name: name.trim(),
          sheetId: sheetId.trim() || null,
          sheetName: sheetName.trim() || null,
        });
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? 'Lỗi không xác định');
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded">
        <PencilIcon className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa landing page</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">Tên hiển thị</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)}
              required disabled={loading} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700 flex items-center justify-between">
              Google Sheet ID (lead)
              {sheetId && (
                <button type="button" onClick={() => { setSheetId(''); setSheetName(''); }}
                  className="text-[10px] text-red-500 hover:text-red-700 font-normal">Xoá sheet</button>
              )}
            </label>
            <input className={inputCls} value={sheetId} onChange={e => setSheetId(e.target.value)}
              placeholder="VD: 1OdOFIYD6NRfMLp6PkpQGs4guJhg8WSrFe9noIWWaJPQ" disabled={loading} />
            <p className="text-[11px] text-zinc-400">Phần ID trong URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">Tên tab trong Sheet</label>
            <input className={inputCls} value={sheetName} onChange={e => setSheetName(e.target.value)}
              placeholder="VD: Sheet1 hoặc DATA PHẾU 2025" disabled={loading} />
            <p className="text-[11px] text-zinc-400">Đúng tên tab ở dưới cùng Google Sheet</p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" disabled={loading} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2Icon className="size-4 animate-spin mr-1.5" />}
              {loading ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LandingPagesClient({ initialPages }: Props) {
  const [pages, setPages] = useState(initialPages);
  const [syncing, setSyncing] = useState(false);

  async function reload() {
    const res = await fetch('/api/landing-pages');
    if (res.ok) setPages(await res.json());
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/landing-pages/sync', { method: 'POST' });
      if (res.ok) {
        toast.success('Sync GA4 hoàn tất');
        await reload();
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(d.error ?? 'Sync thất bại');
      }
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xoá landing page "${name}"?`)) return;
    const res = await fetch(`/api/landing-pages/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Đã xoá');
      setPages(p => p.filter(x => x.id !== id));
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/landing-pages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setPages(p => p.map(x => x.id === id ? { ...x, isActive: !isActive } : x));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Hiệu suất Landing Pages</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Sessions từ GA4 · Leads từ n8n · Tỉ lệ chuyển đổi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            {syncing
              ? <Loader2Icon className="size-3.5 animate-spin" />
              : <RefreshCwIcon className="size-3.5" />}
            {syncing ? 'Đang sync…' : 'Sync GA4'}
          </Button>
          <AddPageDialog onCreated={reload} />
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-xl bg-zinc-50 ring-1 ring-zinc-200 px-6 py-12 text-center">
          <GlobeIcon className="size-8 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-700">Chưa có landing page nào</p>
          <p className="text-xs text-zinc-500 mt-1">Thêm landing page để bắt đầu track hiệu suất từ GA4</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Landing Page</th>
                <th className="text-right px-3 py-3 font-medium">Sessions 30d</th>
                <th className="text-right px-3 py-3 font-medium">Leads 30d</th>
                <th className="text-right px-3 py-3 font-medium">Tỉ lệ %</th>
                <th className="text-center px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pages.map((p) => (
                <tr key={p.id} className={cn('hover:bg-zinc-50/50', !p.isActive && 'opacity-50')}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{p.name}</p>
                    <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                      {p.pagePath} · prop {p.ga4PropertyId}
                    </p>
                    {p.sheetId && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">↳ Sheet: {p.sheetName ?? p.sheetId.slice(0, 12) + '…'}</p>
                    )}
                  </td>
                  <td className="text-right px-3 py-3 tabular-nums font-medium">
                    {p.sessions30d.toLocaleString('vi-VN')}
                  </td>
                  <td className="text-right px-3 py-3 tabular-nums font-medium">
                    {p.leads30d.toLocaleString('vi-VN')}
                  </td>
                  <td className="text-right px-3 py-3">
                    <ConversionBadge rate={p.conversionRate} />
                  </td>
                  <td className="text-center px-3 py-3">
                    <button
                      onClick={() => handleToggle(p.id, p.isActive)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ring-1 transition-colors',
                        p.isActive
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                          : 'bg-zinc-50 text-zinc-500 ring-zinc-200 hover:bg-zinc-100'
                      )}
                    >
                      {p.isActive ? <><CheckCircle2Icon className="size-3" /> Active</> : 'Tắt'}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <EditPageDialog
                        page={p}
                        onSaved={(updated) =>
                          setPages(prev => prev.map(x => x.id === p.id ? { ...x, ...updated } : x))
                        }
                      />
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="text-zinc-400 hover:text-red-600 transition-colors p-1 rounded"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 text-center">
        Tỉ lệ % = Leads ÷ Sessions × 100 · Sync tự động lúc 00:30 VN mỗi ngày
      </p>
    </div>
  );
}
