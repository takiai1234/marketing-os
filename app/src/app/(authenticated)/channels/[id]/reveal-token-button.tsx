'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { EyeIcon, EyeOffIcon, CopyIcon, Loader2Icon } from 'lucide-react';

export function RevealTokenButton({ accountId }: { accountId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (token) { setVisible(v => !v); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/channels/${accountId}/token`);
      const data = await res.json() as { token?: string | null; error?: string };
      if (!res.ok || !data.token) { toast.error(data.error ?? 'Không lấy được token'); return; }
      setToken(data.token);
      setVisible(true);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    toast.success('Đã copy token');
  }

  return (
    <span className="flex items-center gap-1 flex-wrap">
      <button
        onClick={load}
        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
        title={visible ? 'Ẩn token' : 'Hiện token'}
      >
        {loading
          ? <Loader2Icon className="w-3 h-3 animate-spin" />
          : visible
            ? <EyeOffIcon className="w-3 h-3" />
            : <EyeIcon className="w-3 h-3" />}
        <span>{visible ? 'Ẩn token' : 'Hiện token'}</span>
      </button>

      {visible && token && (
        <>
          <span className="font-mono text-xs text-zinc-500 break-all max-w-xs sm:max-w-sm">
            {token.slice(0, 20)}…{token.slice(-8)}
          </span>
          <button
            onClick={copy}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
            title="Copy token đầy đủ"
          >
            <CopyIcon className="w-3 h-3" />
            Copy
          </button>
        </>
      )}
    </span>
  );
}
