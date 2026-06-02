// Skill chat page — server component shell.
// Load session list + current session (if param) → pass xuống client component.
// Default URL: /skills/[id]/chat → render với no active session (user click
// "Cuộc trò chuyện mới" để start). Có ?session=<uuid> → load active session.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageSquareIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSkillById } from '@/lib/queries/skill-lib';
import { listSessions, getSessionForUser } from '@/lib/queries/skill-chat';
import {
  AVAILABLE_MODELS,
  isOpenRouterConfigured,
} from '@/lib/llm/openrouter';
import { ChatShell } from './chat-shell';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SkillChatPage({
  params,
  searchParams,
}: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id: skillId } = await params;
  const sp = await searchParams;
  const sessionParam = typeof sp.session === 'string' ? sp.session : null;

  if (!(await isOpenRouterConfigured())) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <Link
          href={`/skills/${skillId}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại
        </Link>
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
          <h2 className="text-base font-semibold text-amber-900 mb-2">
            Feature Chat chưa được bật
          </h2>
          <p className="text-sm text-amber-800">
            Admin cần set <code className="bg-white px-1 rounded">OPENROUTER_API_KEY</code>{' '}
            tại{' '}
            <Link
              href="/settings/integrations"
              className="underline font-semibold"
            >
              /settings/integrations
            </Link>
            . Lấy key tại{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              openrouter.ai/keys
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const [skill, sessions] = await Promise.all([
    getSkillById(skillId),
    listSessions(skillId, user.userId),
  ]);

  if (!skill) notFound();

  // Load active session messages nếu URL có ?session=
  const activeSession =
    sessionParam && /^[0-9a-f-]{36}$/.test(sessionParam)
      ? await getSessionForUser(sessionParam, user.userId)
      : null;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
      {/* Header — back link + skill name */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href={`/skills/${skillId}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại skill
        </Link>
        <span className="text-zinc-300">·</span>
        <MessageSquareIcon className="size-4 text-blue-600" />
        <h1 className="text-sm font-semibold text-zinc-900 truncate">
          Chat: {skill.name}
        </h1>
      </div>

      {/* Main shell — sidebar + chat area */}
      <ChatShell
        skillId={skillId}
        skillName={skill.name}
        initialSessions={sessions}
        activeSession={activeSession}
        availableModels={[...AVAILABLE_MODELS]}
      />
    </div>
  );
}
