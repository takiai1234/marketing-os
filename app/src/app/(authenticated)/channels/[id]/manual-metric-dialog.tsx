'use client';

// Nhập số liệu thủ công cho kênh is_manual: followers / reach (views) /
// engagement theo 1 ngày. Admin nhập "tổng hiện tại" mỗi lần → ghi snapshot
// vào account_metric_daily → lên dashboard như kênh thường.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, PencilLine } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  accountId: string;
  channelName: string;
  /** Gợi ý cho label: TikTok/YouTube → "Views", còn lại → "Reach". */
  platform: string;
}

function todayIso(): string {
  // YYYY-MM-DD theo local. Date input nhận format này.
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function ManualMetricDialog({ accountId, channelName, platform }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [followers, setFollowers] = useState('');
  const [reach, setReach] = useState('');
  const [engagement, setEngagement] = useState('');
  const [leads, setLeads] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reachLabel = platform === 'tiktok' || platform === 'youtube' ? 'Views' : 'Reach';

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDate(todayIso());
      setFollowers(''); setReach(''); setEngagement(''); setLeads(''); setError(null);
    }
    if (!next) setLoading(false);
  }

  function numOrNull(v: string): number | null {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t.replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const body = {
      date,
      followers: numOrNull(followers),
      reach: numOrNull(reach),
      engagement: numOrNull(engagement),
      leads: numOrNull(leads),
    };
    if (body.followers == null && body.reach == null && body.engagement == null && body.leads == null) {
      setError('Nhập ít nhất 1 chỉ số.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/channels/${accountId}/manual-metric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Đã lưu số liệu — dashboard sẽ cập nhật.');
        onOpenChange(false);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Lưu thất bại');
    } catch {
      setError('Lỗi kết nối — thử lại sau');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-1.5')}>
        <PencilLine className="size-3.5" />
        Nhập số liệu
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nhập số liệu — {channelName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mm-date" className="text-xs font-medium text-zinc-700">Ngày</label>
            <input id="mm-date" type="date" required value={date}
              onChange={(e) => setDate(e.target.value)} disabled={loading} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mm-fol" className="text-xs font-medium text-zinc-700">Followers (tổng hiện tại)</label>
              <input id="mm-fol" inputMode="numeric" value={followers}
                onChange={(e) => setFollowers(e.target.value)} placeholder="VD: 12000" disabled={loading} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mm-reach" className="text-xs font-medium text-zinc-700">{reachLabel} (tổng)</label>
              <input id="mm-reach" inputMode="numeric" value={reach}
                onChange={(e) => setReach(e.target.value)} placeholder="VD: 250000" disabled={loading} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mm-eng" className="text-xs font-medium text-zinc-700">Engagement (like+comment+share)</label>
              <input id="mm-eng" inputMode="numeric" value={engagement}
                onChange={(e) => setEngagement(e.target.value)} placeholder="VD: 8000" disabled={loading} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mm-leads" className="text-xs font-medium text-zinc-700">Lead (số đơn / khách hàng tiềm năng)</label>
              <input id="mm-leads" inputMode="numeric" value={leads}
                onChange={(e) => setLeads(e.target.value)} placeholder="VD: 45" disabled={loading} className={inputCls} />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Nhập tổng hiện tại của kênh. Để trống ô nào thì giữ nguyên giá trị cũ.
            Tăng trưởng followers tự tính so với lần nhập trước.
          </p>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" disabled={loading} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {loading ? 'Đang lưu…' : 'Lưu số liệu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
