'use client';

// Form input FB App ID + App Secret — admin only.
// 3 actions: Lưu (PUT), Test (POST /test), Xoá (DELETE).
//
// Lưu ý: cả 2 setting save cùng lúc trong 1 PUT để không bao giờ
// có half-state (chỉ có ID thiếu Secret hoặc ngược lại).

import { useState, useEffect, FormEvent } from 'react';
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
  /** ID đã set? */
  appIdIsSet: boolean;
  /** Secret đã set? */
  secretIsSet: boolean;
  appIdUpdatedAt: string | null;
  appIdUpdatedByName: string | null;
  hasEnvFallback: boolean;
}

interface TestResult {
  ok: boolean;
  appId?: string;
  appName?: string;
  appLink?: string | null;
  note?: string;
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

export function FacebookAppForm({
  appIdIsSet,
  secretIsSet,
  appIdUpdatedAt,
  appIdUpdatedByName,
  hasEnvFallback,
}: Props) {
  const router = useRouter();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  // Origin hiện tại để hiển thị trong hướng dẫn FB App setup. Dùng
  // window.location thay vì hardcode domain → instructions luôn khớp domain
  // user đang xem (an toàn cả khi domain đổi vd test002 → mkt.taki.vn).
  // useEffect vì SSR không có window.
  const [origin, setOrigin] = useState('');
  const [host, setHost] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
    setHost(window.location.host);
  }, []);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [bothSet, setBothSet] = useState(appIdIsSet && secretIsSet);

  const sourceText = bothSet
    ? `✓ Đã set App ID + Secret trong DB ${appIdUpdatedByName ? `bởi ${appIdUpdatedByName}` : ''} ${formatRelativeTime(appIdUpdatedAt)}`
    : hasEnvFallback
      ? '⚙ Đang dùng env var FB_APP_ID + FB_APP_SECRET. Set qua UI để override.'
      : '✗ CHƯA SET — flow OAuth FB Ads sẽ fail "ID ứng dụng không hợp lệ".';

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!appId.trim() || !appSecret.trim()) {
      toast.error('Cần điền cả App ID + App Secret');
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/integrations/facebook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: appId.trim(),
          appSecret: appSecret.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Lưu thất bại');
        return;
      }
      toast.success('Đã lưu FB credentials (encrypted)');
      setAppId('');
      setAppSecret('');
      setBothSet(true);
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
      const res = await fetch('/api/settings/integrations/facebook/test', {
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
    if (
      !confirm(
        'Xoá FB App credentials? Flow OAuth Pages + Ads sẽ fail nếu không có env fallback.'
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch('/api/settings/integrations/facebook', {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Xoá thất bại');
        return;
      }
      toast.success('Đã xoá FB credentials');
      setBothSet(false);
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
            Facebook App (Pages + Ads OAuth)
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            App ID + Secret từ{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-600 hover:text-blue-800"
            >
              developers.facebook.com/apps
            </a>{' '}
            → app của bạn → Settings → Basic. Dùng cho flow OAuth khi kết nối
            Page + Ad Account.
          </p>

          <div
            className={cn(
              'mt-3 rounded-md border px-3 py-2 text-xs flex items-start gap-2',
              bothSet
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : hasEnvFallback
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
            )}
          >
            {bothSet ? (
              <CheckCircleIcon className="size-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircleIcon className="size-3.5 mt-0.5 shrink-0" />
            )}
            <span>{sourceText}</span>
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fb-app-id" className="text-sm">
              App ID
            </Label>
            <Input
              id="fb-app-id"
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="1234567890123456"
              maxLength={30}
              autoComplete="off"
              disabled={saving}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-zinc-500">
              Số 15-16 digits, không có dấu chấm
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fb-app-secret" className="text-sm">
              App Secret
            </Label>
            <div className="relative">
              <Input
                id="fb-app-secret"
                type={showSecret ? 'text' : 'password'}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="abc123def456..."
                maxLength={200}
                autoComplete="off"
                disabled={saving}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                title={showSecret ? 'Ẩn' : 'Hiện'}
              >
                {showSecret ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Hex 32 chars. Settings → Basic → "Show"
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            {bothSet && (
              <>
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
                    'Test (FREE)'
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
                  Xoá
                </Button>
              </>
            )}
          </div>

          <Button type="submit" disabled={saving || !appId.trim() || !appSecret.trim()}>
            {saving ? 'Đang lưu...' : 'Lưu App ID + Secret'}
          </Button>
        </div>

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
                <div className="font-semibold mb-1">✓ Credentials hợp lệ</div>
                <div className="text-emerald-800 space-y-0.5">
                  <div>
                    App ID: <code className="bg-white px-1 rounded">{testResult.appId}</code>
                  </div>
                  <div>App Name: {testResult.appName}</div>
                  {testResult.appLink && (
                    <a
                      href={testResult.appLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-emerald-700"
                    >
                      Mở app trên FB →
                    </a>
                  )}
                  {testResult.note && (
                    <div className="text-emerald-700 mt-1">{testResult.note}</div>
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

      {/* Setup guide expand */}
      <details className="mt-3">
        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700">
          Lấy App ID + Secret từ đâu? (hướng dẫn nhanh)
        </summary>
        <ol className="mt-2 space-y-1.5 text-xs text-zinc-600 list-decimal list-inside ml-1">
          <li>
            Vào{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-600"
            >
              developers.facebook.com/apps
            </a>{' '}
            (login bằng FB account admin)
          </li>
          <li>Chọn app của bạn (hoặc "Create App" → "Business" type)</li>
          <li>
            Settings → Basic → <strong>App ID</strong> (numeric) +{' '}
            <strong>App Secret</strong> (click "Show", nhập password FB)
          </li>
          <li>
            App Domains thêm <code>{host || '<domain-app>'}</code>
          </li>
          <li>
            Add Platform → Website → URL{' '}
            <code>{origin || 'https://<domain-app>'}</code>
          </li>
          <li>
            Facebook Login → Settings → Valid OAuth Redirect URIs thêm{' '}
            <code>{origin || 'https://<domain-app>'}/api/auth/fb/callback</code>
          </li>
          <li>
            Permissions: enable <code>pages_show_list</code>,{' '}
            <code>pages_read_engagement</code>, <code>ads_read</code>
          </li>
        </ol>
      </details>
    </section>
  );
}
