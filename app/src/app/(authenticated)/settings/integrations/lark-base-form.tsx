'use client';

// Lark Base form — 2 slot riêng: Marketing dashboard + Dashboard Lark.
// Dán URL Lark Base → tự parse app_token + tenant domain → load tables → chọn bảng.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircleIcon, AlertCircleIcon, Trash2Icon, Loader2Icon } from 'lucide-react';

interface SlotState {
  isSet: boolean;
  updatedAt: string | null;
}

interface Props {
  marketing: SlotState;
  order: SlotState;
  larkAppConfigured: boolean;
}

interface TableOption { table_id: string; name: string }

function parseFromUrl(input: string): { appToken: string; domain: string; tableId?: string } | null {
  input = input.trim();
  try {
    const url = new URL(input);
    // Hỗ trợ cả /base/<token> và /wiki/<token>
    const match = url.pathname.match(/\/(?:base|wiki)\/([^/?#]+)/);
    if (match?.[1]) {
      const tableId = url.searchParams.get('table') ?? undefined;
      return { appToken: match[1], domain: url.hostname, tableId };
    }
  } catch { /* không phải URL */ }
  // raw token
  if (!input.includes('/') && input.length >= 8) return { appToken: input, domain: '' };
  return null;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}

function SlotForm({
  slot,
  label,
  isSet: initialIsSet,
  updatedAt: initialUpdatedAt,
  disabled,
}: {
  slot: 'marketing' | 'order';
  label: string;
  isSet: boolean;
  updatedAt: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isSet, setIsSet] = useState(initialIsSet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [urlInput, setUrlInput] = useState('');
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [parsed, setParsed] = useState<{ appToken: string; domain: string; tableId?: string } | null>(null);
  const [busy, setBusy] = useState<null | 'load' | 'save' | 'delete'>(null);

  async function onLoad() {
    const info = parseFromUrl(urlInput);
    if (!info) {
      toast.error('Không nhận ra URL. Dán URL đầy đủ của file Lark Base.');
      return;
    }
    setParsed(info);
    setBusy('load');

    // Lưu tạm để API /tables dùng
    await fetch('/api/settings/lark-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, appToken: info.appToken, tableId: '_tmp', domain: info.domain }),
    });

    try {
      const res = await fetch(`/api/lark/base/tables?slot=${slot}`);
      const data = await res.json() as { tables?: TableOption[]; error?: string };
      if (!res.ok || !data.tables) {
        toast.error(data.error ?? 'Không load được bảng');
        return;
      }
      if (data.tables.length === 0) {
        toast.error(
          'Không tìm thấy bảng nào. Kiểm tra: (1) App đã được thêm vào file Lark Base chưa? ' +
          '(2) App có scope bitable:app:readonly chưa?'
        );
        return;
      }
      setTables(data.tables);
      // Ưu tiên table_id từ URL query string, rồi mới fallback chọn nếu chỉ có 1
      if (info.tableId) {
        setSelectedTableId(info.tableId);
      } else if (data.tables.length === 1 && data.tables[0]) {
        setSelectedTableId(data.tables[0].table_id);
      }
      toast.success(`Tìm thấy ${data.tables.length} bảng`);
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!parsed || !selectedTableId) return;
    setBusy('save');
    try {
      const res = await fetch('/api/settings/lark-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, appToken: parsed.appToken, tableId: selectedTableId, domain: parsed.domain }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Lưu thất bại'); return; }
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setUrlInput(''); setTables([]); setSelectedTableId(''); setParsed(null);
      toast.success(`Đã lưu ${label}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm(`Xoá cấu hình ${label}?`)) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/settings/lark-base?slot=${slot}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Xoá thất bại'); return; }
      setIsSet(false); setUpdatedAt(null);
      toast.success('Đã xoá');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-100 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-700">{label}</p>
        <div className="flex items-center gap-1.5 text-xs">
          {isSet ? (
            <><CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /><span className="text-green-700">Đã kết nối {formatRelativeTime(updatedAt)}</span></>
          ) : (
            <><AlertCircleIcon className="w-3.5 h-3.5 text-amber-500" /><span className="text-amber-600">Chưa cấu hình</span></>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">URL file Lark Base</Label>
        <div className="flex gap-2">
          <Input
            placeholder="https://xxx.feishu.cn/base/bascnXXX..."
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setTables([]); setSelectedTableId(''); }}
            className="text-xs h-8 flex-1"
            disabled={disabled || busy !== null}
          />
          <Button type="button" size="sm" variant="outline"
            disabled={!urlInput.trim() || disabled || busy !== null}
            onClick={onLoad}
          >
            {busy === 'load' ? <Loader2Icon className="w-3 h-3 animate-spin" /> : 'Load'}
          </Button>
        </div>
      </div>

      {tables.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Chọn bảng</Label>
          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs"
          >
            <option value="">— Chọn bảng —</option>
            {tables.map((t) => (
              <option key={t.table_id} value={t.table_id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        {tables.length > 0 && (
          <Button size="sm" disabled={!selectedTableId || busy !== null} onClick={onSave}>
            {busy === 'save' && <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />}
            Lưu
          </Button>
        )}
        {isSet && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
            disabled={busy !== null} onClick={onDelete}
          >
            {busy === 'delete' ? <Loader2Icon className="w-3 h-3 mr-1 animate-spin" /> : <Trash2Icon className="w-3 h-3 mr-1" />}
            Xoá
          </Button>
        )}
      </div>
    </div>
  );
}

export function LarkBaseForm({ marketing, order, larkAppConfigured }: Props) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-[#0B6EFD] flex items-center justify-center text-white font-bold text-sm">B</div>
        <div>
          <h3 className="font-semibold text-sm">Lark Base</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kéo dữ liệu từ 2 file Lark Base vào Marketing OS. Dán URL file → Load → Chọn bảng.
          </p>
        </div>
      </div>

      {!larkAppConfigured && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
          Cần cấu hình <strong>Lark App</strong> (App ID + App Secret) ở trên trước.
        </div>
      )}

      <div className="text-xs text-zinc-500 bg-zinc-50 rounded-lg px-3 py-2 space-y-1">
        <p className="font-medium text-zinc-700">Yêu cầu để Load được bảng:</p>
        <p>1. Mở file Lark Base → Share → thêm bot app của bạn làm collaborator</p>
        <p>2. Lark Developer Console → Permissions → bật scope <code className="bg-zinc-200 px-1 rounded">bitable:app:readonly</code></p>
      </div>

      <SlotForm slot="marketing" label="📊 Dashboard Marketing" {...marketing} disabled={!larkAppConfigured} />
      <SlotForm slot="order"     label="📋 Dashboard Lark"        {...order}     disabled={!larkAppConfigured} />

      <DashboardUrlSlot slot="marketing" label="📊 Link Dashboard Marketing (embed)" />
      <DashboardUrlSlot slot="order"     label="📋 Link Dashboard Dashboard Lark (embed)" />
    </div>
  );
}

function DashboardUrlSlot({ slot, label }: { slot: 'marketing' | 'order'; label: string }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/settings/lark-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, url: url.trim() }),
      });
      if (!res.ok) { toast.error('Lưu thất bại'); return; }
      setSaved(true); setUrl('');
      toast.success('Đã lưu link dashboard');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-100 p-4">
      <Label className="text-xs font-semibold text-zinc-700">{label}</Label>
      <p className="text-xs text-zinc-400">
        Dán URL Lark Wiki/Base có chứa Bảng điều khiển. Trang sẽ nhúng bằng iframe.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="https://xxx.larksuite.com/wiki/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="text-xs h-8 flex-1"
        />
        <Button size="sm" disabled={!url.trim() || busy} onClick={onSave}>
          {busy ? <Loader2Icon className="w-3 h-3 animate-spin" /> : 'Lưu'}
        </Button>
      </div>
      {saved && <p className="text-xs text-green-600">✓ Đã lưu</p>}
    </div>
  );
}
