'use client';

// Inline activate / disconnect / delete buttons cho mỗi ad account card.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { AdAccountStatus } from '@/lib/queries/ad-accounts';
import { CheckIcon, UnplugIcon, Trash2Icon, Loader2Icon } from 'lucide-react';

interface Props {
  accountId: string;
  status: AdAccountStatus;
}

export function AdsAccountActions({ accountId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'activate' | 'disconnect' | 'delete' | null>(null);
  const [_, startTransition] = useTransition();

  async function callPatch(action: 'activate' | 'disconnect') {
    setBusy(action);
    try {
      const res = await fetch(`/api/ads/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Thao tác thất bại');
        return;
      }
      toast.success(action === 'activate' ? 'Đã kích hoạt' : 'Đã ngắt kết nối');
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function callDelete() {
    if (
      !confirm(
        'Xoá hẳn ad account này (kèm tất cả campaign + metric đã sync)? Không thể undo.'
      )
    )
      return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/ads/accounts/${accountId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Xoá thất bại');
        return;
      }
      toast.success('Đã xoá');
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {status === 'pending' && (
        <button
          type="button"
          onClick={() => callPatch('activate')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 disabled:opacity-50"
        >
          {busy === 'activate' ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <CheckIcon className="size-3" />
          )}
          Kích hoạt
        </button>
      )}
      {(status === 'active' || status === 'error') && (
        <button
          type="button"
          onClick={() => callPatch('disconnect')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
        >
          {busy === 'disconnect' ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <UnplugIcon className="size-3" />
          )}
          Ngắt
        </button>
      )}
      {status === 'disconnected' && (
        <button
          type="button"
          onClick={callDelete}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-rose-700 hover:text-rose-900 hover:bg-rose-50 disabled:opacity-50"
        >
          {busy === 'delete' ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <Trash2Icon className="size-3" />
          )}
          Xoá
        </button>
      )}
    </div>
  );
}
