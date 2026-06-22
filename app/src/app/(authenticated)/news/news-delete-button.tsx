'use client';

// Nút ẩn 1 bài khỏi Tin tức. Đặt overlay góc phải-trên thẻ (sibling của <a>,
// KHÔNG lồng trong <a> để tránh nested interactive). Hiện rõ khi hover thẻ.
//
// Gọi DELETE /api/news/[id] (soft-hide) → toast → refresh để bài biến mất.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Loader2 } from 'lucide-react';

export function NewsDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!confirm('Ẩn bài này khỏi danh sách Tin tức? (quét lại sẽ không hiện lại)')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/news/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Ẩn bài thất bại.');
        return;
      }
      toast.success('Đã ẩn bài.');
      startTransition(() => router.refresh());
    } catch {
      toast.error('Lỗi kết nối. Thử lại sau.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Ẩn bài này"
      aria-label="Ẩn bài này"
      className="absolute top-2 right-2 z-10 inline-flex size-7 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-rose-600 transition-opacity"
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
    </button>
  );
}
