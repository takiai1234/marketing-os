'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircleIcon, AlertCircleIcon, Trash2Icon, SendIcon, Loader2Icon } from 'lucide-react';

interface Props {
  initialAppIdIsSet: boolean;
  initialAppSecretIsSet: boolean;
  initialChatIdIsSet: boolean;
  initialUpdatedAt: string | null;
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

export function LarkWebhookForm({
  initialAppIdIsSet,
  initialAppSecretIsSet,
  initialChatIdIsSet,
  initialUpdatedAt,
}: Props) {
  const router = useRouter();
  const isFullySet = initialAppIdIsSet && initialAppSecretIsSet && initialChatIdIsSet;
  const [fullySet, setFullySet] = useState(isFullySet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);

  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [chatId, setChatId] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'delete' | 'test'>(null);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!appId.trim() || !appSecret.trim() || !chatId.trim()) return;
    setBusy('save');
    try {
      const res = await fetch('/api/settings/lark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim(), chatId: chatId.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Lưu thất bại'); return; }
      setFullySet(true);
      setUpdatedAt(new Date().toISOString());
      setAppId(''); setAppSecret(''); setChatId('');
      toast.success('Đã lưu cấu hình Lark');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm('Xoá toàn bộ cấu hình Lark?')) return;
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/lark', { method: 'DELETE' });
      if (!res.ok) { toast.error('Xoá thất bại'); return; }
      setFullySet(false);
      setUpdatedAt(null);
      toast.success('Đã xoá cấu hình Lark');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy('test');
    try {
      const res = await fetch('/api/settings/lark', { method: 'PUT' });
      const data = await res.json().catch(() => ({})) as { error?: string; detail?: unknown };
      if (!res.ok) {
        toast.error(`Test thất bại: ${data.error ?? 'lỗi không xác định'}${data.detail ? ` (${JSON.stringify(data.detail)})` : ''}`);
        return;
      }
      toast.success('Đã gửi tin nhắn test vào Lark!');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-[#0B6EFD] flex items-center justify-center text-white font-bold text-sm">
          L
        </div>
        <div>
          <h3 className="font-semibold text-sm">Lark Bot</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gửi báo cáo dashboard Marketing OS vào Lark group tự động qua Bot API.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {fullySet ? (
          <>
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-green-700">Đã kết nối {formatRelativeTime(updatedAt)}</span>
          </>
        ) : (
          <>
            <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700">Chưa cấu hình đủ</span>
          </>
        )}
      </div>

      <form onSubmit={onSave} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lark-app-id" className="text-xs font-medium">App ID</Label>
            <Input
              id="lark-app-id"
              placeholder="cli_xxxxxxxxxxxxxxxxx"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="font-mono text-xs h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lark-app-secret" className="text-xs font-medium">App Secret</Label>
            <Input
              id="lark-app-secret"
              type="password"
              placeholder="••••••••••••••••"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              className="font-mono text-xs h-8"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lark-chat-id" className="text-xs font-medium">Chat ID (group nhận báo cáo)</Label>
          <Input
            id="lark-chat-id"
            placeholder="oc_xxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="font-mono text-xs h-8"
          />
          <p className="text-xs text-muted-foreground">
            Chat ID của group Lark muốn nhận báo cáo. Lấy từ bot event hoặc{' '}
            <a
              href="https://open.larksuite.com/document/server-docs/im-v1/chat/get"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              API /im/v1/chats
            </a>
            .
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            type="submit"
            size="sm"
            disabled={!appId.trim() || !appSecret.trim() || !chatId.trim() || busy !== null}
          >
            {busy === 'save' && <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />}
            Lưu
          </Button>
          {fullySet && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={onTest}>
                {busy === 'test' ? (
                  <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <SendIcon className="w-3 h-3 mr-1" />
                )}
                Gửi test
              </Button>
              <Button
                type="button" size="sm" variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy !== null} onClick={onDelete}
              >
                {busy === 'delete' ? (
                  <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Trash2Icon className="w-3 h-3 mr-1" />
                )}
                Xoá
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
