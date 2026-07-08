'use client';

// Lark Base form — dán URL file Lark Base → tự parse app_token → auto-load tables.
// URL format: https://<tenant>.larksuite.com/base/<appToken>?table=<tableId>&view=...
// hoặc:       https://<tenant>.feishu.cn/base/<appToken>?...

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircleIcon, AlertCircleIcon, Trash2Icon, Loader2Icon } from 'lucide-react';

interface Props {
  initialAppTokenIsSet: boolean;
  initialTableIdIsSet: boolean;
  initialUpdatedAt: string | null;
  larkAppConfigured: boolean;
}

interface TableOption { table_id: string; name: string }

function parseAppToken(input: string): string | null {
  input = input.trim();
  // Nếu là URL: extract phần sau /base/
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/base\/([A-Za-z0-9_-]+)/);
    if (match) return match[1] ?? null;
  } catch {
    // không phải URL — kiểm tra nếu là raw token
  }
  // raw token: bascnXXX hoặc BascXXX
  if (/^[A-Za-z0-9_-]{10,}$/.test(input)) return input;
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

export function LarkBaseForm({ initialAppTokenIsSet, initialTableIdIsSet, initialUpdatedAt, larkAppConfigured }: Props) {
  const router = useRouter();
  const [isSet, setIsSet] = useState(initialAppTokenIsSet && initialTableIdIsSet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);

  const [urlInput, setUrlInput] = useState('');
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [busy, setBusy] = useState<null | 'load' | 'save' | 'delete'>(null);
  const [parsedToken, setParsedToken] = useState<string | null>(null);

  async function onLoad() {
    const token = parseAppToken(urlInput);
    if (!token) { toast.error('Không nhận ra URL hoặc App Token. Hãy dán URL file Lark Base.'); return; }

    setBusy('load');
    setParsedToken(token);
    try {
      // Lưu tạm app_token để API /tables dùng được
      await fetch('/api/settings/lark-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appToken: token, tableId: '_tmp' }),
      });

      const res = await fetch('/api/lark/base/tables');
      const data = await res.json() as { tables?: TableOption[]; error?: string };
      if (!res.ok || !data.tables) { toast.error(data.error ?? 'Không load được bảng'); return; }

      setTables(data.tables);
      // Auto-chọn nếu chỉ có 1 bảng
      if (data.tables.length === 1 && data.tables[0]) setSelectedTableId(data.tables[0].table_id);
      toast.success(`Tìm thấy ${data.tables.length} bảng — chọn bảng muốn hiển thị`);
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!parsedToken || !selectedTableId) return;
    setBusy('save');
    try {
      const res = await fetch('/api/settings/lark-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appToken: parsedToken, tableId: selectedTableId }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Lưu thất bại'); return; }
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setUrlInput(''); setTables([]); setSelectedTableId(''); setParsedToken(null);
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
      setIsSet(false); setUpdatedAt(null);
      toast.success('Đã xoá');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-[#0B6EFD] flex items-center justify-center text-white font-bold text-sm">B</div>
        <div>
          <h3 className="font-semibold text-sm">Lark Base</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Dán URL file Lark Base để kéo dữ liệu vào trang Order Media.</p>
        </div>
      </div>

      {!larkAppConfigured && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
          Cần cấu hình <strong>Lark App</strong> (App ID + App Secret) ở trên trước.
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        {isSet ? (
          <><CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" /><span className="text-green-700">Đã kết nối {formatRelativeTime(updatedAt)}</span></>
        ) : (
          <><AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" /><span className="text-amber-700">Chưa cấu hình</span></>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lark-base-url" className="text-xs font-medium">URL file Lark Base</Label>
          <div className="flex gap-2">
            <Input
              id="lark-base-url"
              placeholder="https://xxx.larksuite.com/base/bascnXXX..."
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setTables([]); setSelectedTableId(''); }}
              className="text-xs h-8 flex-1"
              disabled={!larkAppConfigured || busy !== null}
            />
            <Button type="button" size="sm" variant="outline" disabled={!urlInput.trim() || !larkAppConfigured || busy !== null} onClick={onLoad}>
              {busy === 'load' ? <Loader2Icon className="w-3 h-3 animate-spin" /> : 'Load'}
            </Button>
          </div>
        </div>

        {tables.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Chọn bảng dữ liệu</Label>
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
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={onDelete}>
              {busy === 'delete' ? <Loader2Icon className="w-3 h-3 mr-1 animate-spin" /> : <Trash2Icon className="w-3 h-3 mr-1" />}
              Xoá
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
