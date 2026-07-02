'use client';

import { CheckCircleIcon, AlertCircleIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  clientIdIsSet: boolean;
  clientSecretIsSet: boolean;
  isConnected: boolean;
  connectError?: string;
  connectSuccess?: boolean;
}

export function GoogleAnalyticsForm({
  clientIdIsSet,
  clientSecretIsSet,
  isConnected,
  connectError,
  connectSuccess,
}: Props) {
  const credentialsOk = clientIdIsSet && clientSecretIsSet;

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Google Analytics 4</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kết nối GA4 để pull sessions theo từng landing page — tính tỉ lệ chuyển đổi.
          </p>
        </div>
        {isConnected ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shrink-0">
            <CheckCircleIcon className="size-3" /> Đã kết nối
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 shrink-0">
            Chưa kết nối
          </span>
        )}
      </div>

      {connectSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1.5">
          <CheckCircleIcon className="size-3.5 shrink-0" />
          Google Analytics đã kết nối thành công!
        </div>
      )}
      {connectError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center gap-1.5">
          <AlertCircleIcon className="size-3.5 shrink-0" />
          Lỗi: {connectError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          {clientIdIsSet
            ? <CheckCircleIcon className="size-3.5 text-emerald-600" />
            : <AlertCircleIcon className="size-3.5 text-amber-500" />}
          <span className={clientIdIsSet ? 'text-zinc-700' : 'text-amber-700'}>
            Client ID {clientIdIsSet ? '(đã set)' : '(chưa set)'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {clientSecretIsSet
            ? <CheckCircleIcon className="size-3.5 text-emerald-600" />
            : <AlertCircleIcon className="size-3.5 text-amber-500" />}
          <span className={clientSecretIsSet ? 'text-zinc-700' : 'text-amber-700'}>
            Client Secret {clientSecretIsSet ? '(đã set)' : '(chưa set)'}
          </span>
        </div>
      </div>

      {!credentialsOk && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
          Paste <strong>GOOGLE_CLIENT_ID</strong> và <strong>GOOGLE_CLIENT_SECRET</strong> vào Coolify env vars trước, sau đó restart app.
        </p>
      )}

      <div className="flex items-center gap-2">
        <a
          href="/api/integrations/google/auth"
          className={
            !credentialsOk
              ? 'pointer-events-none opacity-40 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-white'
              : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-700 transition-colors'
          }
        >
          <ExternalLinkIcon className="size-3.5" />
          {isConnected ? 'Kết nối lại Google' : 'Kết nối Google Analytics'}
        </a>
        {isConnected && (
          <a
            href="/landing-pages"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white ring-1 ring-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Quản lý Landing Pages →
          </a>
        )}
      </div>
    </div>
  );
}
