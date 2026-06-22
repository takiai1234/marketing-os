'use client';

// Form quản lý ADS_INGEST_TOKEN — khoá cho extension quét FB Ads đẩy dữ liệu về.
// Admin: Tạo token ngẫu nhiên / Tự nhập / Hiện để copy / Xoá.
//
// Khác các key khác: token này CẦN copy sang extension nên có nút "Hiện" +
// "Copy". Bấm "Tạo token mới" sẽ thay token cũ → phải dán lại vào extension.

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  Trash2Icon,
  CopyIcon,
  EyeIcon,
  RefreshCwIcon,
  RadarIcon,
} from 'lucide-react';

interface Props {
  initialIsSet: boolean;
  initialUpdatedAt: string | null;
  initialUpdatedByName: string | null;
  hasEnvFallback: boolean;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}

export function AdsTokenForm({
  initialIsSet,
  initialUpdatedAt,
  initialUpdatedByName,
  hasEnvFallback,
}: Props) {
  const router = useRouter();
  const [isSet, setIsSet] = useState(initialIsSet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [updatedByName, setUpdatedByName] = useState(initialUpdatedByName);
  // Giá trị token đang hiện trên UI (sau khi tạo / hiện). null = đang ẩn.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState<null | 'gen' | 'reveal' | 'save' | 'delete'>(null);

  const effectiveSet = isSet || hasEnvFallback;

  const sourceText = isSet
    ? `✓ Đã set trong DB (encrypted) ${updatedByName ? `bởi ${updatedByName}` : ''} ${formatRelativeTime(updatedAt)}`
    : hasEnvFallback
      ? '⚙ Đang dùng env var ADS_INGEST_TOKEN. Tạo/lưu qua UI để override.'
      : '✗ CHƯA SET — extension chưa đẩy được dữ liệu (server trả 503).';

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Đã copy token vào clipboard');
    } catch {
      toast.error('Không copy được — chọn và copy tay.');
    }
  }

  async function onGenerate() {
    if (
      effectiveSet &&
      !confirm(
        'Tạo token MỚI sẽ thay token cũ. Mọi extension đang dùng token cũ phải dán lại token mới. Tiếp tục?'
      )
    ) {
      return;
    }
    setBusy('gen');
    try {
      const res = await fetch('/api/settings/integrations/ads-token', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        toast.error(data.error ?? 'Tạo token thất bại');
        return;
      }
      setRevealed(data.token);
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setUpdatedByName('Bạn');
      toast.success('Đã tạo token mới — copy vào extension.');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onReveal() {
    setBusy('reveal');
    try {
      const res = await fetch('/api/settings/integrations/ads-token');
      const data = (await res.json().catch(() => ({}))) as { token?: string | null; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Không lấy được token');
        return;
      }
      if (!data.token) {
        toast.error('Chưa có token nào được set.');
        return;
      }
      setRevealed(data.token);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onSaveManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim().length < 16) {
      toast.error('Token tối thiểu 16 ký tự');
      return;
    }
    setBusy('save');
    try {
      const res = await fetch('/api/settings/integrations/ads-token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manual.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Lưu thất bại');
        return;
      }
      setRevealed(data.token ?? manual.trim());
      setManual('');
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setUpdatedByName('Bạn');
      toast.success('Đã lưu token.');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm('Xoá token? Extension sẽ không đẩy được dữ liệu cho tới khi set lại.')) return;
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/integrations/ads-token', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Xoá thất bại');
        return;
      }
      setIsSet(false);
      setRevealed(null);
      setUpdatedAt(null);
      setUpdatedByName(null);
      toast.success('Đã xoá token.');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 shrink-0">
          <RadarIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-zinc-900">
            Token quét FB Ads (Chrome extension)
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            Khoá bí mật cho endpoint <code className="bg-zinc-100 px-1 rounded">/api/news/ingest-ads</code>.
            Extension <strong>fb-ads-scanner</strong> dùng token này để đẩy quảng
            cáo từ Facebook Ads Library về mục Tin tức AI. Tạo token ở đây rồi dán
            vào ô <em>Ingest token</em> trong popup của extension.
          </p>

          <div
            className={cn(
              'mt-3 rounded-md border px-3 py-2 text-xs flex items-start gap-2',
              isSet
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : hasEnvFallback
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
            )}
          >
            {effectiveSet ? (
              <CheckCircleIcon className="size-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircleIcon className="size-3.5 mt-0.5 shrink-0" />
            )}
            <span>{sourceText}</span>
          </div>
        </div>
      </div>

      {/* Token đang hiện (sau khi tạo/hiện) */}
      {revealed && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3">
          <div className="text-[11px] font-semibold text-emerald-800 mb-1.5">
            Token của bạn — copy vào extension:
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={revealed}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 font-mono text-xs bg-white"
            />
            <Button type="button" size="sm" onClick={() => copy(revealed)}>
              <CopyIcon className="size-3.5" />
              Copy
            </Button>
          </div>
        </div>
      )}

      {/* Hành động chính */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onGenerate} disabled={busy !== null}>
          <RefreshCwIcon className={cn('size-3.5', busy === 'gen' && 'animate-spin')} />
          {isSet || hasEnvFallback ? 'Tạo token mới' : 'Tạo token'}
        </Button>

        {effectiveSet && (
          <Button type="button" variant="outline" size="sm" onClick={onReveal} disabled={busy !== null}>
            <EyeIcon className="size-3.5" />
            Hiện token hiện tại
          </Button>
        )}

        {isSet && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={busy !== null}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <Trash2Icon className="size-3.5" />
            Xoá
          </Button>
        )}
      </div>

      {/* Nhập tay (tuỳ chọn) */}
      <form onSubmit={onSaveManual} className="mt-4 border-t border-zinc-100 pt-4">
        <Label htmlFor="ads-token-manual" className="text-xs text-zinc-500">
          Hoặc tự nhập token riêng (tuỳ chọn)
        </Label>
        <div className="flex gap-2 mt-1.5">
          <Input
            id="ads-token-manual"
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="dán token tự đặt (≥ 16 ký tự)"
            autoComplete="off"
            disabled={busy !== null}
            className="flex-1 font-mono text-xs"
          />
          <Button type="submit" variant="outline" disabled={busy !== null || manual.trim().length < 16}>
            Lưu
          </Button>
        </div>
      </form>

      <p className="text-[11px] text-zinc-400 mt-3">
        Token được mã hoá AES-256 (pgcrypto) trước khi lưu DB. Endpoint đã được
        loại khỏi auth đăng nhập nên token này là lớp bảo vệ duy nhất — giữ bí mật.
      </p>
    </section>
  );
}
