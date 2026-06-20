'use client';

// Form quét Facebook Ads Library — dán link (Ads Library hoặc page) rồi bấm
// "Scan". Gọi POST /api/news/scan (đồng bộ, có thể mất vài phút), toast kết quả
// và refresh trang để hiển thị ad vừa quét.
//
// Quét đồng bộ nên không có cooldown như nút Fetch RSS — nút tự disable trong
// lúc đang chạy (loading) là đủ chống double-submit.

import { useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Radar } from 'lucide-react';

interface ScanResult {
  inserted?: number;
  mapped?: number;
  fetched?: number;
  error?: string;
  detail?: string;
}

export function NewsScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function handleScan() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error('Dán link Facebook Ads Library hoặc link page để quét.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/news/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as ScanResult;

      if (!res.ok) {
        toast.error(data.error ?? 'Quét thất bại.', {
          description: data.detail?.slice(0, 160),
        });
        return;
      }

      const inserted = data.inserted ?? 0;
      const fetched = data.fetched ?? 0;
      if (fetched === 0) {
        toast.warning('Không tìm thấy quảng cáo nào ở link này.');
      } else if (inserted === 0) {
        toast.info(`Đã quét ${fetched} ad — tất cả đều đã có sẵn (không có ad mới).`);
      } else {
        toast.success(`Đã thêm ${inserted} ad mới (quét ${fetched}).`);
        setUrl('');
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error('Lỗi kết nối. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      handleScan();
    }
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Radar className="size-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-zinc-900">Quét Facebook Ads Library</h3>
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        Dán link{' '}
        <span className="font-medium text-zinc-700">Ads Library</span> (facebook.com/ads/library/…)
        hoặc link page cần quét, rồi bấm <span className="font-medium text-zinc-700">Scan</span>.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="url"
          inputMode="url"
          placeholder="https://www.facebook.com/ads/library/?id=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={handleScan} disabled={loading} className="gap-2 shrink-0">
          <Radar className={'size-3.5 ' + (loading ? 'animate-spin' : '')} />
          {loading ? 'Đang quét…' : 'Scan'}
        </Button>
      </div>
      {loading && (
        <p className="text-[11px] text-zinc-400 mt-2">
          Quét có thể mất 1–3 phút tuỳ số lượng quảng cáo — vui lòng đợi…
        </p>
      )}
    </div>
  );
}
