'use client';

// UpdateTokenDialog — admin replace Page Access Token cho 1 kênh đang
// kết nối, KHÔNG mất config (owner, KPI goal, persona, metric history).
//
// Use cases:
//   - Token cũ thiếu scope mới (vd vừa add read_insights vào Meta App)
//   - Token expired sau khi user đổi mật khẩu FB hoặc revoke quyền
//   - Đổi sang Meta App khác → re-onboard nhẹ nhàng
//
// Flow:
//   1. Admin click nút "Cập nhật token" → dialog mở
//   2. Paste Page Token mới vào textarea
//   3. Click "Lưu" → POST /api/channels/[id]/token
//      - Server validate FB debug_token (is_valid + type=PAGE + scope)
//      - Verify page_id khớp external_id (chống paste nhầm token page khác)
//      - Encrypt + save vào access_token_encrypted
//   4. Success → toast + close + router.refresh() → ngay sau cron next
//      run / "Đồng bộ ngay" sẽ dùng token mới

import { useState, FormEvent } from 'react';
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
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { KeyRoundIcon, ExternalLinkIcon } from 'lucide-react';

interface Props {
  accountId: string;
  channelName: string;
  /** Tên page để hiển thị trong dialog cho admin verify đúng kênh. */
  externalId: string;
}

interface TokenInfo {
  type: string;
  expires_at: number;       // 0 = vĩnh viễn
  scopes: string[];
}

interface SuccessResponse {
  ok: true;
  page: { id: string; name?: string; category?: string };
  token: TokenInfo;
}

function formatExpiry(expiresAt: number): string {
  if (expiresAt === 0) return 'Vĩnh viễn (không hết hạn)';
  const diffMs = expiresAt * 1000 - Date.now();
  if (diffMs < 0) return 'Đã hết hạn';
  const days = Math.floor(diffMs / 86_400_000);
  return `Còn ${days} ngày`;
}

export function UpdateTokenDialog({
  accountId,
  channelName,
  externalId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<SuccessResponse | null>(null);

  function onOpenChange(next: boolean) {
    if (next) {
      // Reset state mỗi lần mở để tránh hiển thị result của lần trước
      setToken('');
      setLastResult(null);
    }
    setOpen(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      toast.error('Cần paste Page Token mới');
      return;
    }

    setSaving(true);
    setLastResult(null);
    try {
      const res = await fetch(`/api/channels/${accountId}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageToken: token.trim() }),
      });

      const data = (await res.json().catch(() => ({}))) as
        | SuccessResponse
        | { error?: string };

      if (!res.ok || !('ok' in data) || !data.ok) {
        const errMsg = 'error' in data ? data.error : 'Cập nhật thất bại';
        toast.error(errMsg ?? 'Cập nhật thất bại');
        return;
      }

      setLastResult(data);
      toast.success(`Token đã cập nhật cho ${channelName}`);
      // KHÔNG đóng dialog ngay — để admin xem scopes/expiry của token mới
      // trước khi tự đóng. router.refresh() để header reload status.
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 px-2 text-xs gap-1'
        )}
        title="Cập nhật Page Access Token mà không cần re-onboard"
      >
        <KeyRoundIcon className="size-3" />
        Cập nhật token
      </DialogTrigger>

      <DialogContent className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-blue-600" />
            Cập nhật Page Access Token
          </DialogTitle>
          <div className="text-xs text-zinc-500 mt-1 space-y-0.5">
            <p>
              Kênh:{' '}
              <strong className="text-zinc-700">{channelName}</strong> · Page ID:{' '}
              <code className="bg-zinc-100 px-1 rounded font-mono">
                {externalId}
              </code>
            </p>
            <p>
              Giữ nguyên owner, KPI, persona, metric history — chỉ thay token.
            </p>
          </div>
        </DialogHeader>

        {/* Khi nào cần dùng tính năng này? */}
        <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900 space-y-1">
          <p className="font-semibold">Dùng tính năng này khi:</p>
          <ul className="list-disc list-inside text-blue-800 space-y-0.5 leading-relaxed">
            <li>Token cũ hết hạn (FB throw error #190 trong cron logs)</li>
            <li>Vừa add permission mới vào Meta App (vd <code>read_insights</code>) → cần regenerate token</li>
            <li>Đổi sang Meta App khác</li>
          </ul>
          <p className="pt-1">
            Chưa có Page Token mới? Xem hướng dẫn lấy ở trang{' '}
            <a
              href="/channels/new/facebook"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold inline-flex items-center gap-0.5"
            >
              Onboard FB <ExternalLinkIcon className="size-3" />
            </a>{' '}
            (popup "Hướng dẫn chi tiết").
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-token">Page Access Token mới</Label>
            <textarea
              id="page-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAxxx... (paste token từ Graph API Explorer)"
              rows={4}
              autoComplete="off"
              disabled={saving}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono break-all focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-zinc-500">
              Server tự verify: token loại PAGE + scope có{' '}
              <code className="bg-zinc-100 px-1 rounded">pages_read_engagement</code>{' '}
              + page_id khớp{' '}
              <code className="bg-zinc-100 px-1 rounded">{externalId}</code>.
              Sai bất kỳ điều kiện nào → reject, không ghi DB.
            </p>
          </div>

          {/* Result panel — hiện sau khi save thành công */}
          {lastResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs space-y-1.5">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                ✓ Token đã được lưu encrypted vào DB
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-emerald-800">
                <span>Loại:</span>
                <span className="font-medium">{lastResult.token.type}</span>
                <span>Hết hạn:</span>
                <span className="font-medium">
                  {formatExpiry(lastResult.token.expires_at)}
                </span>
                <span>Page:</span>
                <span className="font-medium">
                  {lastResult.page.name}{' '}
                  <span className="text-emerald-600">
                    ({lastResult.page.category})
                  </span>
                </span>
                <span>Scopes:</span>
                <span className="font-mono text-[11px] break-all leading-relaxed">
                  {lastResult.token.scopes.join(', ')}
                </span>
              </div>
              <div className="pt-1 text-emerald-900">
                <strong>Sync tiếp theo</strong> (cron 9:30/17:30/1:30 VN hoặc
                bấm "Đồng bộ ngay") sẽ dùng token mới.
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-1 border-t pt-3">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {lastResult ? 'Đóng' : 'Huỷ'}
            </DialogClose>
            {!lastResult && (
              <Button type="submit" disabled={saving || !token.trim()}>
                {saving ? 'Đang verify & lưu...' : 'Lưu token'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
