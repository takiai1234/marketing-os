'use client';

// Chat shell client component. Quản lý:
//   - Session list (sidebar trái)
//   - Active session (messages + input)
//   - New chat creation (chọn model → POST session → switch active)
//   - Send message (POST /messages → optimistic UI update)
//   - Delete session (DELETE → refresh list)

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  MessageSquareIcon,
} from 'lucide-react';
import type { ChatSession, ChatMessage } from '@/lib/queries/skill-chat';
import { AttachmentInput, type AttachmentInputSubmit } from '@/components/chat/attachment-input';
import { MessageAttachments } from '@/components/chat/message-attachments';

interface ModelOption {
  id: string;
  label: string;
  description: string;
}

interface Props {
  skillId: string;
  skillName: string;
  initialSessions: ChatSession[];
  activeSession:
    | (ChatSession & { messages: ChatMessage[] })
    | null;
  availableModels: ModelOption[];
}

const NUMBER_FMT = new Intl.NumberFormat('vi-VN');

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN');
}

export function ChatShell({
  skillId,
  skillName,
  initialSessions,
  activeSession,
  availableModels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState(initialSessions);
  const [messages, setMessages] = useState<ChatMessage[]>(
    activeSession?.messages ?? []
  );
  const [selectedModel, setSelectedModel] = useState(
    availableModels[0]?.id ?? '~anthropic/claude-sonnet-latest'
  );
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom khi messages thay đổi
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Sync local messages state khi server re-renders với active session khác
  useEffect(() => {
    setMessages(activeSession?.messages ?? []);
  }, [activeSession]);

  async function handleNewChat() {
    setCreating(true);
    try {
      const res = await fetch(`/api/skills/${skillId}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Tạo session thất bại');
        return;
      }
      const data = (await res.json()) as { session: ChatSession };
      setSessions((prev) => [data.session, ...prev]);
      // Navigate to new session
      const params = new URLSearchParams(searchParams.toString());
      params.set('session', data.session.id);
      router.push(`?${params.toString()}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function handleSwitchSession(sessionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('session', sessionId);
    router.push(`?${params.toString()}`);
  }

  async function handleDeleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Xoá cuộc trò chuyện này? Không thể undo.')) return;
    try {
      const res = await fetch(
        `/api/skills/${skillId}/chat/sessions/${sessionId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        toast.error('Xoá thất bại');
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      // Nếu đang xoá session active → quay về no-session view
      if (activeSession?.id === sessionId) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('session');
        router.push(`?${params.toString()}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleSubmit(data: AttachmentInputSubmit) {
    if (!data.content && data.files.length === 0) return;

    if (!activeSession) {
      setCreating(true);
      try {
        const res = await fetch(`/api/skills/${skillId}/chat/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel }),
        });
        if (!res.ok) {
          toast.error('Tạo session thất bại');
          return;
        }
        const respData = (await res.json()) as { session: ChatSession };
        await submitMessage(respData.session.id, data.content, data.files);
        setSessions((prev) => [respData.session, ...prev]);
        const params = new URLSearchParams(searchParams.toString());
        params.set('session', respData.session.id);
        router.push(`?${params.toString()}`);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setCreating(false);
      }
      return;
    }

    await submitMessage(activeSession.id, data.content, data.files);
  }

  async function submitMessage(
    sessionId: string,
    userText: string,
    files: File[]
  ) {
    const tempUserMsg: ChatMessage = {
      id: 'temp-user-' + Date.now(),
      sessionId,
      role: 'user',
      content:
        userText ||
        (files.length > 0
          ? `(đang gửi ${files.length} file đính kèm...)`
          : ''),
      tokensIn: 0,
      tokensOut: 0,
      createdAt: new Date().toISOString(),
      attachments: [],
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setSending(true);

    try {
      const fd = new FormData();
      fd.append('content', userText);
      for (const f of files) fd.append('files', f);

      const res = await fetch(
        `/api/skills/${skillId}/chat/sessions/${sessionId}/messages`,
        { method: 'POST', body: fd }
      );

      if (!res.ok) {
        const text = await res.text();
        let errMsg = '';
        try {
          const data = JSON.parse(text) as { error?: string };
          if (data.error) errMsg = data.error;
        } catch {
          errMsg = text.slice(0, 200).replace(/<[^>]+>/g, '').trim();
        }
        if (!errMsg) errMsg = `HTTP ${res.status} ${res.statusText || ''}`.trim();
        toast.error(`Gửi thất bại — ${errMsg}`);
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return;
      }

      const data = (await res.json()) as {
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
        warnings?: string[];
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      if (data.warnings && data.warnings.length > 0) {
        for (const w of data.warnings) toast.warning(w);
      }
      router.refresh();
    } catch (err) {
      const errName = (err as Error).name ?? 'Error';
      const errMsg = (err as Error).message ?? String(err);
      toast.error(`Lỗi kết nối: ${errName}: ${errMsg}`);
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-h-0 flex-1">
      {/* ─── Sidebar: session list ───────────────────────────────────── */}
      <aside className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm flex flex-col min-h-0">
        <div className="p-3 border-b border-zinc-100">
          <Button
            onClick={handleNewChat}
            disabled={creating}
            className="w-full"
            size="sm"
          >
            <PlusIcon className="size-4" />
            {creating ? 'Đang tạo...' : 'Cuộc trò chuyện mới'}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-zinc-400 italic text-center py-4">
              Chưa có cuộc trò chuyện
            </p>
          ) : (
            <ul className="space-y-1">
              {sessions.map((s) => {
                const isActive = activeSession?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => handleSwitchSession(s.id)}
                      className={cn(
                        'group w-full text-left rounded-md px-2.5 py-2 transition-colors',
                        isActive
                          ? 'bg-blue-50 ring-1 ring-blue-200'
                          : 'hover:bg-zinc-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            'text-xs font-medium truncate flex-1',
                            isActive ? 'text-blue-900' : 'text-zinc-800'
                          )}
                        >
                          {s.title}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(s.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-600 shrink-0"
                          title="Xoá"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-500">
                        <span className="font-mono">{s.model}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(s.updatedAt)}</span>
                      </div>
                      {s.totalTokensOut > 0 && (
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {NUMBER_FMT.format(s.totalTokensIn)}↑ ·{' '}
                          {NUMBER_FMT.format(s.totalTokensOut)}↓ tokens
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ─── Main: messages + input ─────────────────────────────────── */}
      <main className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm flex flex-col min-h-0">
        {/* Header — session info + model */}
        <div className="p-3 border-b border-zinc-100 flex items-center justify-between gap-3 flex-wrap">
          {activeSession ? (
            <>
              <p className="text-sm font-medium text-zinc-800 truncate">
                {activeSession.title}
              </p>
              <span className="text-xs text-zinc-500 font-mono">
                {activeSession.model}
              </span>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-500 italic">
                Chọn cuộc trò chuyện hoặc bắt đầu mới
              </p>
              <Select
                value={selectedModel}
                onValueChange={(v) => v && setSelectedModel(v)}
              >
                <SelectTrigger className="w-56" size="sm">
                  <SelectValue placeholder="Chọn model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-[10px] text-zinc-500">
                          {m.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* Messages scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
        >
          {messages.length === 0 ? (
            <EmptyChat skillName={skillName} />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 italic">
              <Loader2Icon className="size-3 animate-spin" />
              Claude đang trả lời... (có thể mất 10-60s tuỳ độ dài)
            </div>
          )}
        </div>

        {/* Input */}
        <AttachmentInput
          placeholder={
            activeSession
              ? `Hỏi skill "${skillName}"... (kéo file/ảnh để đính kèm)`
              : `Bắt đầu cuộc trò chuyện với skill "${skillName}"...`
          }
          disabled={sending || creating}
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function EmptyChat({ skillName }: { skillName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-zinc-400 px-4">
      <MessageSquareIcon className="size-10 mb-3 text-zinc-300" />
      <p className="text-sm font-medium text-zinc-600">
        Chat với skill "{skillName}"
      </p>
      <p className="text-xs mt-1 max-w-sm">
        Gõ message để bắt đầu. Claude sẽ follow hướng dẫn trong skill bundle —
        tone, workflow, output format đều theo skill.
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 max-w-[85%]',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200'
        )}
      >
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments
            messageId={message.id}
            attachments={message.attachments}
            invertColors={isUser}
          />
        )}
        {!isUser && (message.tokensIn > 0 || message.tokensOut > 0) && (
          <p className="text-[10px] text-zinc-500 mt-1.5 tabular-nums">
            {NUMBER_FMT.format(message.tokensIn)} in ·{' '}
            {NUMBER_FMT.format(message.tokensOut)} out
          </p>
        )}
      </div>
    </div>
  );
}
