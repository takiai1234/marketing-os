'use client';

// Apify integration form — admin only.
// 2 keys cùng 1 form (save atomic):
//   - APIFY_API_TOKEN: app dùng fetch dataset items sau khi webhook fired
//   - APIFY_WEBHOOK_SECRET: app verify webhook calls (?secret= query)
//
// Webhook URL hiển thị động theo origin user đang xem (dùng window.location).

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
  CopyIcon,
  WebhookIcon,
} from 'lucide-react';

interface Props {
  apiTokenIsSet: boolean;
  webhookSecretIsSet: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
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

export function ApifyForm({
  apiTokenIsSet,
  webhookSecretIsSet,
  updatedAt,
  updatedByName,
}: Props) {
  const router = useRouter();
  const [apiToken, setApiToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bothSet, setBothSet] = useState(apiTokenIsSet && webhookSecretIsSet);

  // Origin để dựng webhook URL hiển thị
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const sourceText = bothSet
    ? `✓ Đã set Apify token + webhook secret ${updatedByName ? `bởi ${updatedByName}` : ''} ${formatRelativeTime(updatedAt)}`
    : '✗ CHƯA SET — webhook từ Apify sẽ bị reject 401.';

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!apiToken.trim() || !webhookSecret.trim()) {
      toast.error('Nhập đủ cả Apify API token + Webhook secret');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/apify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, webhookSecret }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success('Đã lưu cấu hình Apify');
      setApiToken('');
      setWebhookSecret('');
      setBothSet(true);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lưu fail');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm('Xoá Apify token + webhook secret khỏi DB?')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/settings/apify', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Đã xoá cấu hình Apify');
      setBothSet(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xoá fail');
    } finally {
      setDeleting(false);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success('Đã copy'));
  }

  const webhookTwitter = origin
    ? `${origin}/api/news/apify-webhook?type=twitter&secret=${webhookSecret || '<SECRET>'}`
    : '...';
  const webhookFacebook = origin
    ? `${origin}/api/news/apify-webhook?type=facebook&secret=${webhookSecret || '<SECRET>'}`
    : '...';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <WebhookIcon className="size-4 text-violet-600" />
        <h4 className="text-sm font-semibold text-zinc-900">
          Apify (Twitter + Facebook scraping)
        </h4>
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        Pull Twitter/X tweets + Facebook page posts vào /news. User setup Apify
        Schedule + webhook → Apify gọi app sau mỗi actor run.
      </p>

      {/* Status */}
      <div
        className={cn(
          'mb-3 rounded-md px-3 py-2 text-xs flex items-center gap-2',
          bothSet
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
        )}
      >
        {bothSet ? (
          <CheckCircleIcon className="size-4" />
        ) : (
          <AlertCircleIcon className="size-4" />
        )}
        <span>{sourceText}</span>
      </div>

      {/* Form */}
      <form onSubmit={onSave} className="space-y-3">
        <div>
          <Label htmlFor="apify-token" className="text-xs">
            APIFY API token
          </Label>
          <div className="mt-1 flex gap-1">
            <Input
              id="apify-token"
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                apiTokenIsSet
                  ? '(đã set — để trống nếu không đổi)'
                  : 'apify_api_...'
              }
              className="font-mono text-xs"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="rounded-md border border-zinc-200 px-2 hover:bg-zinc-50"
              aria-label="Toggle hiển thị token"
            >
              {showToken ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Lấy từ{' '}
            <a
              href="https://console.apify.com/account/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              console.apify.com/account/integrations
            </a>
          </p>
        </div>

        <div>
          <Label htmlFor="apify-secret" className="text-xs">
            Webhook secret (tự đặt — tối thiểu 8 ký tự)
          </Label>
          <div className="mt-1 flex gap-1">
            <Input
              id="apify-secret"
              type={showSecret ? 'text' : 'password'}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={
                webhookSecretIsSet ? '(đã set — để trống nếu không đổi)' : 'random-string-12345...'
              }
              className="font-mono text-xs"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="rounded-md border border-zinc-200 px-2 hover:bg-zinc-50"
              aria-label="Toggle hiển thị secret"
            >
              {showSecret ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Chuỗi random bất kỳ. Dùng làm <code>?secret=</code> trong URL webhook
            để app verify request từ Apify.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving} className="text-xs">
            {saving && <Loader2Icon className="size-3 animate-spin mr-1" />}
            <KeyRoundIcon className="size-3 mr-1" />
            Lưu cả 2
          </Button>
          {bothSet && (
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={onDelete}
              className="text-xs text-red-600 hover:bg-red-50"
            >
              {deleting && <Loader2Icon className="size-3 animate-spin mr-1" />}
              <Trash2Icon className="size-3 mr-1" />
              Xoá
            </Button>
          )}
        </div>
      </form>

      {/* Setup guide */}
      <details className="mt-4 rounded-md bg-zinc-50 border border-zinc-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
          📖 Hướng dẫn setup Apify Schedule + Webhook
        </summary>
        <div className="mt-2 space-y-3 text-xs text-zinc-600">
          <div>
            <strong className="text-zinc-800">Bước 1: Apify token</strong>
            <ol className="mt-1 space-y-0.5 list-decimal list-inside ml-1">
              <li>Vào console.apify.com → Settings → Integrations</li>
              <li>Copy "Personal API tokens" → paste vào ô trên</li>
            </ol>
          </div>
          <div>
            <strong className="text-zinc-800">Bước 2: Webhook URL</strong>
            <p className="mt-1">Copy URL dưới, paste vào Apify Schedule → Webhook → URL:</p>
            <div className="mt-1.5 space-y-1.5">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
                  Cho actor Twitter:
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="flex-1 bg-white border border-zinc-200 rounded px-2 py-1 text-[10px] font-mono break-all">
                    {webhookTwitter}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookTwitter)}
                    className="rounded border border-zinc-200 p-1 hover:bg-white"
                    title="Copy"
                  >
                    <CopyIcon className="size-3" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
                  Cho actor Facebook:
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="flex-1 bg-white border border-zinc-200 rounded px-2 py-1 text-[10px] font-mono break-all">
                    {webhookFacebook}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookFacebook)}
                    className="rounded border border-zinc-200 p-1 hover:bg-white"
                    title="Copy"
                  >
                    <CopyIcon className="size-3" />
                  </button>
                </div>
              </div>
            </div>
            <p className="mt-1 text-[10px] italic text-zinc-500">
              ⚠️ URL chứa secret. Đừng share public — chỉ paste trên Apify.
            </p>
          </div>
          <div>
            <strong className="text-zinc-800">Bước 3: Apify Schedule</strong>
            <ol className="mt-1 space-y-0.5 list-decimal list-inside ml-1">
              <li>Apify Console → Schedules → Create new schedule</li>
              <li>Actor: chọn Twitter scraper (vd apidojo/twitter-scraper-lite) hoặc FB scraper</li>
              <li>Input: list usernames cần pull (vd 10 Twitter handles)</li>
              <li>Cron: vd <code>0 */6 * * *</code> (6h/lần)</li>
              <li>Webhook tab → URL từ Bước 2 → Event: ACTOR.RUN.SUCCEEDED → Save</li>
              <li>Click "Run now" để test, check /news 1-2 phút sau</li>
            </ol>
          </div>
          <div>
            <strong className="text-zinc-800">Bước 4: Verify</strong>
            <p className="mt-1">
              GET{' '}
              <a
                href="/api/news/apify-webhook"
                target="_blank"
                className="text-blue-600 hover:underline font-mono"
              >
                /api/news/apify-webhook
              </a>{' '}
              trả status JSON. Xem sync history tại{' '}
              <a
                href="/settings/dashboard-debug"
                className="text-blue-600 hover:underline"
              >
                /settings/dashboard-debug
              </a>{' '}
              (bảng 3 — sync log).
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}
