'use client';

// Form input cho Anthropic API key — admin only (server đã enforce).
// 3 actions: Lưu (PUT), Test (POST /test), Xoá (DELETE).

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  KeyRoundIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  Trash2Icon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
} from 'lucide-react';

interface Props {
  /** Đã set trong DB? (KHÔNG plaintext) */
  initialIsSet: boolean;
  initialUpdatedAt: string | null;
  initialUpdatedByName: string | null;
  /** Env var có set không (fallback nếu DB chưa có) */
  hasEnvFallback: boolean;
}

interface TestResult {
  ok: boolean;
  model?: string;
  usage?: { tokensIn: number; tokensOut: number };
  error?: string;
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

export function AnthropicKeyForm({
  initialIsSet,
  initialUpdatedAt,
  initialUpdatedByName,
  hasEnvFallback,
}: Props) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isSet, setIsSet] = useState(initialIsSet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [updatedByName, setUpdatedByName] = useState(initialUpdatedByName);

  // Hiển thị status badge phía trên form
  const sourceText = isSet
    ? `✓ Đã set trong DB (encrypted) ${updatedByName ? `bởi ${updatedByName}` : ''} ${formatRelativeTime(updatedAt)}`
    : hasEnvFallback
      ? '⚙ Đang dùng env var (ANTHROPIC_API_KEY). Set qua UI để override.'
      : '✗ CHƯA SET — chưa có ở DB lẫn env. Feature Chat sẽ bị tắt.';

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error('Paste API key trước khi lưu');
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/integrations/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Lưu thất bại');
        return;
      }
      toast.success('Đã lưu API key (encrypted)');
      setApiKey('');
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setUpdatedByName('Bạn');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/integrations/anthropic/test', {
        method: 'POST',
      });
      const data = (await res.json()) as TestResult;
      setTestResult(res.ok ? { ...data, ok: true } : { ok: false, error: data.error });
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function onDelete() {
    if (!confirm('Xoá API key đã lưu? Feature Chat sẽ fall back về env var (nếu có) hoặc bị tắt.')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/settings/integrations/anthropic', {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Xoá thất bại');
        return;
      }
      toast.success('Đã xoá API key');
      setIsSet(false);
      setUpdatedAt(null);
      setUpdatedByName(null);
      setTestResult(null);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
          <KeyRoundIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-zinc-900">
            Anthropic Claude API
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            Bật feature "Chat với Skill" tại{' '}
            <code className="bg-zinc-100 px-1 rounded">/skills/[id]/chat</code>.
            Lấy key tại{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-600 hover:text-blue-800"
            >
              console.anthropic.com
            </a>
            .
          </p>

          {/* Status banner */}
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
            {isSet ? (
              <CheckCircleIcon className="size-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircleIcon className="size-3.5 mt-0.5 shrink-0" />
            )}
            <span>{sourceText}</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={onSave} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="anthropic-key" className="text-sm">
            {isSet ? 'Cập nhật API key mới' : 'Paste API key'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="anthropic-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                autoComplete="off"
                disabled={saving}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                title={showKey ? 'Ẩn' : 'Hiện'}
              >
                {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            <Button type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Bắt đầu <code className="bg-zinc-100 px-1 rounded">sk-ant-</code>.
            Encrypted bằng AES-256 (pgcrypto) trước khi lưu DB — admin khác
            không đọc plaintext.
          </p>
        </div>

        {/* Test + Delete action bar */}
        {isSet && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testing}
            >
              {testing ? (
                <>
                  <Loader2Icon className="size-3 animate-spin" />
                  Đang test...
                </>
              ) : (
                'Test key (gọi /messages, ~$0.0001)'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              <Trash2Icon className="size-3.5" />
              Xoá key
            </Button>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              testResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            )}
          >
            {testResult.ok ? (
              <div>
                <div className="font-semibold mb-1">✓ Key hoạt động OK</div>
                <div className="text-emerald-800 space-y-0.5">
                  <div>
                    Model echo: <code className="bg-white px-1 rounded">{testResult.model}</code>
                  </div>
                  {testResult.usage && (
                    <div>
                      Token: {testResult.usage.tokensIn} in /{' '}
                      {testResult.usage.tokensOut} out (cost ~$
                      {((testResult.usage.tokensIn * 3 + testResult.usage.tokensOut * 15) / 1_000_000).toFixed(6)})
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-semibold mb-1">✗ Test fail</div>
                <div className="text-rose-800 break-all">{testResult.error}</div>
              </div>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
