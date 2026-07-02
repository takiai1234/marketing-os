'use client';

import { useState, FormEvent } from 'react';
import { toast } from 'sonner';
import {
  CheckCircleIcon, AlertCircleIcon, ExternalLinkIcon, Loader2Icon,
  Trash2Icon, EyeIcon, EyeOffIcon, KeyRoundIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  clientIdIsSet: boolean;
  clientSecretIsSet: boolean;
  isConnected: boolean;
  connectError?: string;
  connectSuccess?: boolean;
}

const inputCls = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 font-mono';

export function GoogleAnalyticsForm({
  clientIdIsSet: initialIdSet,
  clientSecretIsSet: initialSecretSet,
  isConnected: initialConnected,
  connectError,
  connectSuccess,
}: Props) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [idIsSet, setIdIsSet] = useState(initialIdSet);
  const [secretIsSet, setSecretIsSet] = useState(initialSecretSet);
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [error, setError] = useState<string | null>(null);

  const credentialsOk = idIsSet && secretIsSet;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Nhập đủ Client ID và Client Secret');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/settings/google', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (res.ok) {
        toast.success('Đã lưu Google credentials');
        setIdIsSet(true); setSecretIsSet(true);
        setClientId(''); setClientSecret('');
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? 'Lưu thất bại');
      }
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm('Xoá Google credentials và ngắt kết nối Analytics?')) return;
    setDeleting(true);
    try {
      await fetch('/api/settings/google', { method: 'DELETE' });
      toast.success('Đã xoá Google credentials');
      setIdIsSet(false); setSecretIsSet(false); setIsConnected(false);
    } catch {
      toast.error('Xoá thất bại');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-zinc-400 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Google Analytics 4</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pull sessions từng landing page → tính tỉ lệ chuyển đổi với leads n8n.
            </p>
          </div>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ring-1 shrink-0',
          isConnected
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : credentialsOk
              ? 'bg-amber-50 text-amber-700 ring-amber-200'
              : 'bg-zinc-50 text-zinc-500 ring-zinc-200'
        )}>
          {isConnected
            ? <><CheckCircleIcon className="size-3" /> Đã kết nối</>
            : credentialsOk
              ? <><AlertCircleIcon className="size-3" /> Chưa OAuth</>
              : 'Chưa cấu hình'}
        </span>
      </div>

      {connectSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1.5">
          <CheckCircleIcon className="size-3.5 shrink-0" />
          Google Analytics kết nối thành công!
        </div>
      )}
      {connectError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center gap-1.5">
          <AlertCircleIcon className="size-3.5 shrink-0" />
          Lỗi OAuth: {connectError}
        </div>
      )}

      {/* Form nhập credentials */}
      <form onSubmit={onSave} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-700">
            Client ID {idIsSet && <span className="text-emerald-600 font-normal">(đã set)</span>}
          </label>
          <input
            className={inputCls}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder={idIsSet ? '••••••••••••• (giữ nguyên nếu không đổi)' : 'Paste Client ID từ Google Cloud Console'}
            disabled={saving}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-700">
            Client Secret {secretIsSet && <span className="text-emerald-600 font-normal">(đã set)</span>}
          </label>
          <div className="relative">
            <input
              className={cn(inputCls, 'pr-10')}
              type={showSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={secretIsSet ? '••••••••••••• (giữ nguyên nếu không đổi)' : 'Paste Client Secret'}
              disabled={saving}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {showSecret ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="submit" size="sm" disabled={saving || (!clientId && !clientSecret)}>
            {saving && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
            {saving ? 'Đang lưu…' : 'Lưu credentials'}
          </Button>

          {credentialsOk && (
            <a
              href="/api/integrations/google/auth"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <ExternalLinkIcon className="size-3.5" />
              {isConnected ? 'Kết nối lại Google' : 'Kết nối Google Analytics'}
            </a>
          )}

          {isConnected && (
            <a
              href="/landing-pages"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium bg-white ring-1 ring-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Quản lý Landing Pages →
            </a>
          )}

          {(idIsSet || secretIsSet) && (
            <Button type="button" variant="outline" size="sm" onClick={onDelete} disabled={deleting}
              className="ml-auto text-red-600 border-red-200 hover:bg-red-50">
              {deleting ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
            </Button>
          )}
        </div>
      </form>

      <p className="text-[11px] text-zinc-400">
        Lấy credentials tại Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
        Redirect URI cần set: <code className="font-mono bg-zinc-100 px-1 rounded">https://mkt.taki.vn/api/integrations/google/callback</code>
      </p>
    </div>
  );
}
