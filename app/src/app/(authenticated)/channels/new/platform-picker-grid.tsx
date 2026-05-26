'use client';

// Grid of platform tiles. Click behavior:
//   - flow='native_fb'  → navigate to /channels/new/facebook
//   - flow='bundle'     → POST /api/channels/bundle/initiate, then show URL panel
//   - importSupported=false (disabled prop) → tooltip only, no action
//
// Keeping all interaction in one component avoids prop-drilling the initiate
// state through multiple children.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { PlatformMeta } from '@/lib/platforms/registry';
import { BundleConnectPanel } from './bundle-connect-panel';

interface InitiateResponse {
  connectUrl: string;
  sessionId: string;
  expiresAt: string;
  platformLabel: string;
}

export function PlatformPickerGrid({
  platforms,
  disabled = false,
}: {
  platforms: PlatformMeta[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [active, setActive] = useState<InitiateResponse | null>(null);

  async function handleClick(p: PlatformMeta) {
    if (disabled) return;
    if (p.flow === 'native_fb') {
      router.push('/channels/new/facebook');
      return;
    }

    setLoadingKey(p.key);
    try {
      const res = await fetch('/api/channels/bundle/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: p.key }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Không khởi tạo được link kết nối.');
        return;
      }
      setActive({
        connectUrl: data.connectUrl,
        sessionId: data.sessionId,
        expiresAt: data.expiresAt,
        platformLabel: p.label,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      toast.error(`Lỗi kết nối Bundle: ${msg}`);
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {platforms.map((p) => (
          <PlatformTile
            key={p.key}
            platform={p}
            disabled={disabled}
            loading={loadingKey === p.key}
            onClick={() => handleClick(p)}
          />
        ))}
      </div>

      {active && (
        <BundleConnectPanel
          connectUrl={active.connectUrl}
          platformLabel={active.platformLabel}
          expiresAt={active.expiresAt}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function PlatformTile({
  platform,
  disabled,
  loading,
  onClick,
}: {
  platform: PlatformMeta;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const muted = disabled || loading;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={muted}
      title={disabled ? platform.comingSoonReason : undefined}
      className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl border bg-white p-4 transition-all ${
        muted
          ? 'border-zinc-200 opacity-50 cursor-not-allowed'
          : 'border-zinc-200 hover:border-orange-400 hover:shadow-md cursor-pointer'
      }`}
    >
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: platform.brandColor }}
      >
        {platform.label.charAt(0)}
      </div>
      <span className="text-sm font-medium text-zinc-700">{platform.label}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-xs text-zinc-600">
          Đang tạo link…
        </span>
      )}
    </button>
  );
}
