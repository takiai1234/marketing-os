'use client';

// News ingestion form — Twitter qua Apify, Facebook qua fb-cli (free).
//
// Twitter: cần Apify token. Facebook: KHÔNG cần token — binary `fb`
// (tamnd/facebook-cli) đọc thẳng data public của facebook.com.
// Optional: paste 2 cookie (c_user + xs) để lấy full timeline thay vì
// chỉ post mới nhất mỗi page.

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
  RefreshCwIcon,
  WebhookIcon,
  CookieIcon,
} from 'lucide-react';

interface Props {
  apiTokenIsSet: boolean;
  fbSessionIsSet: boolean;
  twitterHandles: string;
  facebookPages: string;
  twitterActor: string;
  updatedAt: string | null;
  updatedByName: string | null;
}

const DEFAULT_TWITTER_ACTOR = 'apidojo/twitter-scraper-lite';

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
  fbSessionIsSet,
  twitterHandles: initialTwitter,
  facebookPages: initialFacebook,
  twitterActor: initialTwActor,
  updatedAt,
  updatedByName,
}: Props) {
  const router = useRouter();
  const [apiToken, setApiToken] = useState('');
  const [twitter, setTwitter] = useState(initialTwitter);
  const [facebook, setFacebook] = useState(initialFacebook);
  const [twActor, setTwActor] = useState(initialTwActor || DEFAULT_TWITTER_ACTOR);
  const [fbCUser, setFbCUser] = useState('');
  const [fbXs, setFbXs] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tokenSet, setTokenSet] = useState(apiTokenIsSet);
  const [sessionSet, setSessionSet] = useState(fbSessionIsSet);

  // Đếm số source active
  const twCount = twitter.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).length;
  const fbCount = facebook.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).length;
  // FB không cần token — chỉ Twitter cần
  const totalActive = (tokenSet ? twCount : 0) + fbCount;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if ((fbCUser.trim() !== '') !== (fbXs.trim() !== '')) {
      toast.error('Cookie phải paste đủ cả 2: c_user VÀ xs');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        twitterHandles: twitter.trim(),
        facebookPages: facebook.trim(),
      };
      // Chỉ gửi secret nếu user nhập mới
      if (apiToken.trim()) body.apiToken = apiToken.trim();
      if (twActor !== DEFAULT_TWITTER_ACTOR) body.twitterActor = twActor.trim();
      if (fbCUser.trim() && fbXs.trim()) {
        body.fbCUser = fbCUser.trim();
        body.fbXs = fbXs.trim();
      }

      const res = await fetch('/api/settings/apify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success('Đã lưu cấu hình');
      if (apiToken.trim()) {
        setApiToken('');
        setTokenSet(true);
      }
      if (fbCUser.trim() && fbXs.trim()) {
        setFbCUser('');
        setFbXs('');
        setSessionSet(true);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lưu fail');
    } finally {
      setSaving(false);
    }
  }

  async function onSyncNow() {
    if (twCount + fbCount === 0) {
      toast.error('Chưa có username/page nào — paste danh sách trước');
      return;
    }
    if (fbCount === 0 && twCount > 0 && !tokenSet) {
      toast.error('Twitter cần Apify token — save token trước (Facebook thì không cần)');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/settings/apify', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const r = data.result;
      const twMsg = r.twitter
        ? `Twitter: ${r.twitter.inserted}/${r.twitter.fetched} new`
        : 'Twitter: skip';
      const fbMsg = r.facebook
        ? `FB: ${r.facebook.inserted}/${r.facebook.fetched} new`
        : 'FB: skip';
      toast.success(`Sync xong! ${twMsg} · ${fbMsg}`);
      router.refresh();
    } catch (err) {
      toast.error(
        `Sync fail: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSyncing(false);
    }
  }

  async function onDelete() {
    if (!window.confirm('Xoá toàn bộ cấu hình news ingestion (token + cookie + lists)?')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/settings/apify', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Đã xoá cấu hình');
      setTokenSet(false);
      setSessionSet(false);
      setTwitter('');
      setFacebook('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xoá fail');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <WebhookIcon className="size-4 text-violet-600" />
        <h4 className="text-sm font-semibold text-zinc-900">
          News feed — Twitter (Apify) + Facebook (fb-cli, free) → /news
        </h4>
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        Paste list usernames → app cron mỗi 6h pull tweet/post mới vào /news.
        Facebook KHÔNG cần token (dùng fb-cli). Twitter cần Apify token.
      </p>

      {/* Status */}
      <div
        className={cn(
          'mb-3 rounded-md px-3 py-2 text-xs flex items-center gap-2',
          totalActive > 0
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
        )}
      >
        {totalActive > 0 ? (
          <CheckCircleIcon className="size-4" />
        ) : (
          <AlertCircleIcon className="size-4" />
        )}
        <span>
          {totalActive > 0
            ? `✓ ${totalActive} nguồn đang track ${updatedByName ? `· set bởi ${updatedByName}` : ''} ${formatRelativeTime(updatedAt)} · FB session: ${sessionSet ? 'có (full timeline)' : 'chưa (chỉ post mới nhất/page)'}`
            : '✗ Chưa có nguồn nào active'}
        </span>
      </div>

      <form onSubmit={onSave} className="space-y-3">
        {/* Facebook pages — free, đặt lên đầu */}
        <div>
          <Label htmlFor="apify-facebook" className="text-xs">
            Facebook pages ({fbCount} trang) — free qua fb-cli
          </Label>
          <textarea
            id="apify-facebook"
            value={facebook}
            onChange={(e) => setFacebook(e.target.value)}
            placeholder="huanyoutube, nghecontent, CuongMeAI&#10;hoặc full URL: https://www.facebook.com/HoangChironCTO"
            rows={4}
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-xs font-mono focus:border-violet-400 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Page slug (vd <code>huanyoutube</code>) hoặc full URL. Không cần
            token. Mặc định mỗi lần sync chỉ lấy được <strong>post mới
            nhất</strong> của mỗi page — muốn cả timeline thì paste 2 cookie
            bên dưới.
          </p>
        </div>

        {/* fb-cli session cookies (tier 1) */}
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold text-zinc-500 hover:text-zinc-700 flex items-center gap-1">
            <CookieIcon className="size-3 inline" />
            Cookie Facebook (tuỳ chọn — mở khoá full timeline)
            {sessionSet && <span className="text-emerald-600 ml-1">✓ đã set</span>}
          </summary>
          <div className="mt-2 space-y-2 pl-2 border-l-2 border-zinc-100">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="fb-c-user" className="text-[11px] text-zinc-600">
                  c_user
                </Label>
                <Input
                  id="fb-c-user"
                  value={fbCUser}
                  onChange={(e) => setFbCUser(e.target.value)}
                  placeholder={sessionSet ? '(đã set)' : '100000123456789'}
                  className="font-mono text-xs h-8"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="fb-xs" className="text-[11px] text-zinc-600">
                  xs
                </Label>
                <Input
                  id="fb-xs"
                  type="password"
                  value={fbXs}
                  onChange={(e) => setFbXs(e.target.value)}
                  placeholder={sessionSet ? '(đã set)' : 'paste cookie xs'}
                  className="font-mono text-xs h-8"
                  autoComplete="off"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-400">
              Lấy từ browser đã đăng nhập Facebook: DevTools → Application →
              Cookies → facebook.com → copy giá trị <code>c_user</code> và{' '}
              <code>xs</code>. Lưu encrypted trong DB, chỉ dùng để đọc.
            </p>
          </div>
        </details>

        {/* Twitter — cần Apify */}
        <div>
          <Label htmlFor="apify-twitter" className="text-xs">
            Twitter handles ({twCount} tài khoản) — cần Apify token
          </Label>
          <textarea
            id="apify-twitter"
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="sama, rubenhassid, NFTCPS, claudeai&#10;hoặc mỗi tài khoản 1 dòng (KHÔNG có @)"
            rows={4}
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-xs font-mono focus:border-violet-400 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Username không có dấu @. Cách bởi dấu phẩy hoặc xuống dòng.
          </p>
        </div>

        {/* API token — chỉ cho Twitter */}
        <div>
          <Label htmlFor="apify-token" className="text-xs">
            Apify API token (chỉ cần cho Twitter)
            {tokenSet && <span className="text-emerald-600 ml-1">✓ đã set</span>}
          </Label>
          <div className="mt-1 flex gap-1">
            <Input
              id="apify-token"
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                tokenSet ? '(đã set — để trống nếu không đổi)' : 'apify_api_...'
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
            Lấy tại{' '}
            <a
              href="https://console.apify.com/account/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              console.apify.com/account/integrations
            </a>
            {' '}— bỏ trống nếu chỉ track Facebook.
          </p>
        </div>

        {/* Advanced — Twitter actor override */}
        <details
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-[11px] font-semibold text-zinc-500 hover:text-zinc-700">
            Nâng cao: Twitter actor ID (chỉ đổi khi biết bạn đang làm gì)
          </summary>
          <div className="mt-2 space-y-2 pl-2 border-l-2 border-zinc-100">
            <div>
              <Label htmlFor="tw-actor" className="text-[11px] text-zinc-600">
                Twitter actor
              </Label>
              <Input
                id="tw-actor"
                value={twActor}
                onChange={(e) => setTwActor(e.target.value)}
                placeholder={DEFAULT_TWITTER_ACTOR}
                className="font-mono text-xs h-8"
              />
            </div>
            <p className="text-[10px] text-zinc-400 italic">
              Nếu actor khác → input shape có thể không khớp, cần check log{' '}
              /settings/dashboard-debug.
            </p>
          </div>
        </details>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving} className="text-xs">
            {saving && <Loader2Icon className="size-3 animate-spin mr-1" />}
            <KeyRoundIcon className="size-3 mr-1" />
            Lưu
          </Button>
          <Button
            type="button"
            onClick={onSyncNow}
            disabled={syncing || twCount + fbCount === 0}
            variant="outline"
            className="text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200"
          >
            {syncing && <Loader2Icon className="size-3 animate-spin mr-1" />}
            {!syncing && <RefreshCwIcon className="size-3 mr-1" />}
            {syncing ? 'Đang sync (1-3 phút)...' : 'Sync ngay'}
          </Button>
          {(tokenSet || sessionSet || twCount + fbCount > 0) && (
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={onDelete}
              className="text-xs text-red-600 hover:bg-red-50 ml-auto"
            >
              {deleting && <Loader2Icon className="size-3 animate-spin mr-1" />}
              <Trash2Icon className="size-3 mr-1" />
              Xoá tất cả
            </Button>
          )}
        </div>
      </form>

      {/* Mini guide */}
      <div className="mt-4 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        <strong>Cách dùng:</strong>
        <ol className="mt-1 space-y-0.5 list-decimal list-inside">
          <li>
            <strong>Facebook (free):</strong> paste list page → Lưu → Sync ngay.
            Muốn lấy nhiều post hơn mỗi page → paste thêm 2 cookie c_user + xs.
          </li>
          <li>
            <strong>Twitter:</strong> cần token Apify (
            <a
              href="https://console.apify.com/account/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-mono"
            >
              console.apify.com
            </a>
            , ~$0.30/1k tweets).
          </li>
          <li>Sau lần sync đầu, cron 6h/lần tự chạy.</li>
        </ol>
      </div>
    </section>
  );
}
