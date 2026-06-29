'use client';

// Form tạo kênh nhập số liệu thủ công (vd Facebook cá nhân). Sau khi tạo →
// chuyển tới trang chi tiết kênh để nhập số liệu.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook (cá nhân)' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'threads', label: 'Threads' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'zalo', label: 'Zalo' },
];

export function ManualChannelForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('facebook');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!name.trim()) {
      setError('Nhập tên kênh');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/channels/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), platform }),
      });
      const data = (await res.json().catch(() => ({}))) as { accountId?: string; error?: string };
      if (!res.ok || !data.accountId) {
        setError(data.error ?? 'Không tạo được kênh');
        return;
      }
      toast.success('Đã tạo kênh thủ công. Nhập số liệu ngay trong trang kênh.');
      router.push(`/channels/${data.accountId}`);
    } catch {
      setError('Lỗi kết nối — thử lại sau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-name" className="text-xs font-medium text-zinc-700">
          Tên kênh
        </label>
        <input
          id="m-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: FB cá nhân - Nguyễn Văn A"
          disabled={loading}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-platform" className="text-xs font-medium text-zinc-700">
          Nền tảng
        </label>
        <select
          id="m-platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          disabled={loading}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
        >
          {PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-zinc-500">
        Kênh thủ công không tự đồng bộ. Sau khi tạo, bạn nhập followers / reach /
        engagement bằng tay trong trang chi tiết kênh — số liệu sẽ lên dashboard
        như các kênh khác.
      </p>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin mr-1.5" />}
          {loading ? 'Đang tạo…' : 'Tạo kênh thủ công'}
        </Button>
      </div>
    </form>
  );
}
