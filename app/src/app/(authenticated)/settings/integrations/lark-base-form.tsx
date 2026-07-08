'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircleIcon, AlertCircleIcon, Trash2Icon, RefreshCwIcon, Loader2Icon } from 'lucide-react';

interface Props {
  initialAppTokenIsSet: boolean;
  initialTableIdIsSet: boolean;
  initialUpdatedAt: string | null;
  larkAppConfigured: boolean; // App ID + App Secret đã set chưa
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

interface TableOption { table_id: string; name: string }

export function LarkBaseForm({
  initialAppTokenIsSet,
  initialTableIdIsSet,
  initialUpdatedAt,
  larkAppConfigured,
}: Props) {
  const router = useRouter();
  const fullySet = initialAppTokenIsSet && initialTableIdIsSet;
  const [isSet, setIsSet] = useState(fullySet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);

  const [appToken, setAppToken] = useState('');
  const [tableId, setTableId] = useState('');
  const [tables, setTables] = useState<TableOption[]>([]);
  const [busy, setBusy] = useState<null | 'save' | 'delete' | 'load-tables'>(null);

  async function onLoadTables() {
    if (!appToken.trim()) { toast.error('Nhập App Token trước'); return; }

    // Tạm thời lưu app_token để list tables
    const saveTmpRes = await fetch('/api/settings/lark-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appToken: appToken.trim(), tableId: tableId.trim() || 'tmp' }),
    });
    if (!saveTmpRes.ok) { toast.error('Lưu tạm thất bại'); return; }

    setBusy('load-tables');
    try {
      const res = await fetch('/api/lark/base/tables');
      const data = await res.json() as { tables?: TableOption[]; error?: string };
      if (!res.ok || !data.tables) { toast.error(data.error ?? 'Không load được tables'); return; }
      setTables(data.tables);
      toast.success(`Tìm thấy ${data.tables.length} bảng`);
    } finally {
      setBusy(null);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!appToken.trim() || !tableId.trim()) return;
    setBusy('save');
    try {
      const res = await fetch('/api/settings/lark-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appToken: appToken.trim(), tableId: tableId.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Lưu thất bại'); return; }
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setAppToken(''); setTableId(''); setTables([]);
      toast.success('Đã lưu cấu hình Lark Base');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm('Xoá cấu hình Lark Base?')) return;
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/lark-base', { method: 'DELETE' });
      if (!res.ok) { toast.error('Xoá thất bại'); return; }
      setIsSet(false);
      setUpdatedAt(null);
      toast.success('Đã xoá cấu hình Lark Base');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-[#0B6EFD] flex items-center justify-center text-white font-bold text-sm">
          B
        </div>
        <div>
          <h3 className="font-semibold text-sm">Lark Base</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kéo dữ liệu từ bảng Lark Base vào trang Dashboard riêng trong Marketing OS.
          </p>
        </div>
      </div>

      {!larkAppConfigured && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
          Cần cấu hình <strong>Lark Bot</strong> (App ID + App Secret) ở trên trước.
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        {isSet ? (
          <>
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-green-700">Đã kết nối {formatRelativeTime(updatedAt)}</span>
          </>
        ) : (
          <>
            <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700">Chưa cấu hình</span>
          </>
        )}
      </div>

      <form onSubmit={onSave} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lark-base-app-token" className="text-xs font-medium">
            App Token (ID của file Lark Base)
          </Label>
          <div className="flex gap-2">
            <Input
              id="lark-base-app-token"
              placeholder="bascnxxxxxxxxxxxxxxxxxx"
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              className="font-mono text-xs h-8 flex-1"
              disabled={!larkAppConfigured}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!appToken.trim() || busy !== null || !larkAppConfigured}
              onClick={onLoadTables}
            >
              {busy === 'load-tables' ? (
                <Loader2Icon className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCwIcon className="w-3 h-3" />
              )}
              <span className="ml-1">Load bảng</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Lấy từ URL file Lark Base: /base/<strong>bascnXXX...</strong>/...
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lark-base-table-id" className="text-xs font-medium">
            Table ID (bảng dữ liệu)
          </Label>
          {tables.length > 0 ? (
            <select
              id="lark-base-table-id"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs font-mono"
            >
              <option value="">— Chọn bảng —</option>
              {tables.map((t) => (
                <option key={t.table_id} value={t.table_id}>
                  {t.name} ({t.table_id})
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="lark-base-table-id"
              placeholder="tblxxxxxxxxxxxxxxxxxx"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="font-mono text-xs h-8"
              disabled={!larkAppConfigured}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Nhập thủ công hoặc bấm <em>Load bảng</em> để chọn từ danh sách.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            type="submit"
            size="sm"
            disabled={!appToken.trim() || !tableId.trim() || busy !== null || !larkAppConfigured}
          >
            {busy === 'save' && <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />}
            Lưu
          </Button>
          {isSet && (
            <Button
              type="button" size="sm" variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy !== null} onClick={onDelete}
            >
              {busy === 'delete' ? (
                <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Trash2Icon className="w-3 h-3 mr-1" />
              )}
              Xoá
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
