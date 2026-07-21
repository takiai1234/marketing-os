'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircleIcon, AlertCircleIcon, Trash2Icon, Loader2Icon, SendIcon, FileTextIcon } from 'lucide-react';

interface Props {
  initialBotTokenIsSet: boolean;
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

export function TelegramForm({ initialBotTokenIsSet, initialChatIdIsSet, initialUpdatedAt }: Props) {
  const router = useRouter();
  const [isSet, setIsSet] = useState(initialBotTokenIsSet && initialChatIdIsSet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'delete' | 'test' | 'send'>(null);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!botToken.trim() || !chatId.trim()) return;
    setBusy('save');
    try {
      const res = await fetch('/api/settings/telegram', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Lưu thất bại'); return; }
      setIsSet(true);
      setUpdatedAt(new Date().toISOString());
      setBotToken('');
      setChatId('');
      toast.success('Đã lưu cấu hình Telegram');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy('test');
    try {
      const res = await fetch('/api/settings/telegram/test', { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Gửi test thất bại'); return; }
      toast.success('Đã gửi tin nhắn test lên Telegram!');
    } finally {
      setBusy(null);
    }
  }

  async function onSendReport() {
    setBusy('send');
    try {
      const res = await fetch('/api/settings/telegram/send-report', { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Gửi báo cáo thất bại'); return; }
      toast.success('Đã gửi báo cáo lên Telegram!');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm('Xoá cấu hình Telegram? Báo cáo sáng sẽ ngừng gửi.')) return;
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/telegram', { method: 'DELETE' });
      if (!res.ok) { toast.error('Xoá thất bại'); return; }
      setIsSet(false);
      setUpdatedAt(null);
      toast.success('Đã xoá');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-[#229ED9] flex items-center justify-center">
          <SendIcon className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Telegram — Báo cáo sáng</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gửi báo cáo KPI + Ads lúc 07:00 mỗi ngày vào group Telegram.{' '}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Tạo bot tại @BotFather
            </a>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {isSet ? (
          <>
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-green-700">Đã kết nối {formatRelativeTime(updatedAt)}</span>
          </>
        ) : (
          <>
            <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700">Chưa cấu hình — báo cáo sáng chưa hoạt động</span>
          </>
        )}
      </div>

      <form onSubmit={onSave} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="tg-bot-token" className="text-xs font-medium">Bot Token</Label>
          <Input
            id="tg-bot-token"
            type="password"
            placeholder="1234567890:ABCDEFGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            className="font-mono text-xs h-8"
          />
          <p className="text-[11px] text-muted-foreground">
            Lấy từ @BotFather → /newbot → copy token
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tg-chat-id" className="text-xs font-medium">Chat ID (Group)</Label>
          <Input
            id="tg-chat-id"
            placeholder="-100xxxxxxxxxx"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="font-mono text-xs h-8"
          />
          <p className="text-[11px] text-muted-foreground">
            Thêm bot vào group → dùng @userinfobot hoặc getUpdates để lấy chat_id (thường có dấu -)
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={!botToken.trim() || !chatId.trim() || busy !== null}
          >
            {busy === 'save' && <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />}
            Lưu
          </Button>
          {isSet && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={onTest}
              >
                {busy === 'test' ? (
                  <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <SendIcon className="w-3 h-3 mr-1" />
                )}
                Gửi test
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={onSendReport}
              >
                {busy === 'send' ? (
                  <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <FileTextIcon className="w-3 h-3 mr-1" />
                )}
                Gửi báo cáo ngay
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy !== null}
                onClick={onDelete}
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
