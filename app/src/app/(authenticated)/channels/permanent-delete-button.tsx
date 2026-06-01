'use client';

// Permanent delete button cho channel đã disconnected.
//
// 2 lớp safety:
//   1. Button chỉ hiện cho admin + channel ở status='disconnected'
//      (ChannelCard parent control prop)
//   2. Confirm dialog yêu cầu admin gõ tên channel để verify (chống misclick)
//   3. Server side: API check `status='disconnected'` lần nữa (defense-in-depth
//      nếu UI bypass do bug)
//
// Click "Xoá vĩnh viễn" → dialog mở → admin gõ tên channel + click confirm →
// DELETE /api/channels/[id]?permanent=true → CASCADE xoá hết. Redirect về
// /channels (không show toast trên trang đã bị remove).

import { useState, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Trash2Icon, AlertTriangleIcon } from 'lucide-react';

interface Props {
  accountId: string;
  channelName: string;
  /** Optional callback trước/sau xoá — cho phép parent kiểm soát side effects */
  onDeleted?: () => void;
}

export function PermanentDeleteButton({
  accountId,
  channelName,
  onDeleted,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) setTyped('');
    setOpen(next);
  }

  // Stop propagation — button nằm trong Link wrapper (ChannelCard), không
  // muốn click trigger navigation.
  function stop(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  const confirmEnabled = typed.trim() === channelName.trim();

  async function onConfirm() {
    if (!confirmEnabled) {
      toast.error('Tên kênh không khớp');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/channels/${accountId}?permanent=true`,
        { method: 'DELETE' }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Xoá thất bại');
        return;
      }
      toast.success(`Đã xoá vĩnh viễn kênh "${channelName}"`);
      setOpen(false);
      onDeleted?.();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        onClick={stop}
        className={cn(
          buttonVariants({ variant: 'destructive', size: 'sm' }),
          'h-7 px-2 text-xs gap-1'
        )}
        title="Xoá vĩnh viễn — xoá hẳn khỏi DB cùng tất cả posts, metrics, sync log"
      >
        <Trash2Icon className="size-3" />
        Xoá vĩnh viễn
      </DialogTrigger>

      <DialogContent
        className="w-full sm:max-w-md"
        // Stop propagation cho mọi click bên trong dialog
        onClick={stop}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-rose-600" />
            Xoá vĩnh viễn kênh?
          </DialogTitle>
          <p className="text-xs text-zinc-500 mt-1">
            Hành động này <strong className="text-rose-700">KHÔNG THỂ UNDO</strong>.
          </p>
        </DialogHeader>

        {/* Warning panel */}
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs text-rose-900 space-y-1.5">
          <div className="font-semibold">Sẽ bị xoá vĩnh viễn:</div>
          <ul className="list-disc list-inside space-y-0.5 text-rose-800">
            <li>Tất cả bài viết của kênh (`social_post`)</li>
            <li>Metrics 30-90 ngày (reach, ER, clicks, video views)</li>
            <li>Lịch sử follower growth (`account_metric_daily`)</li>
            <li>Lead data từ Ladipage (`landing_page_conversion`)</li>
            <li>Lịch sử sync (`api_sync_log`)</li>
            <li>Owner / editor assignments (`social_account_member`)</li>
            <li>Health score history</li>
          </ul>
          <div className="pt-1 text-rose-900">
            Nếu chỉ muốn ẩn khỏi UI mà giữ data → bạn ĐÃ làm rồi (Hủy kết
            nối). Chỉ tiếp tục nếu thật sự không cần data này nữa.
          </div>
        </div>

        {/* Type-to-confirm */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-name" className="text-xs">
            Gõ chính xác tên kênh để confirm:{' '}
            <code className="bg-zinc-100 px-1.5 py-0.5 rounded font-mono text-[11px] text-zinc-900">
              {channelName}
            </code>
          </Label>
          <Input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={channelName}
            disabled={deleting}
            autoComplete="off"
          />
        </div>

        <div className="flex justify-end gap-2 mt-2 border-t pt-3">
          <DialogClose render={<Button variant="outline" type="button" />}>
            Huỷ
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!confirmEnabled || deleting}
          >
            {deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
