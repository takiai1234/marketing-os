// /projects/[id]/chat — chat trong project.
// Server shell: auth + load project + load sessions + active session.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageSquareIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getProjectForUser,
  listProjectSessions,
  getProjectSessionForUser,
} from '@/lib/queries/projects';
import { AVAILABLE_MODELS, isOpenRouterConfigured } from '@/lib/llm/openrouter';
import { ProjectChatShell } from './project-chat-shell';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProjectChatPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id: projectId } = await params;
  const sp = await searchParams;
  const sessionParam = typeof sp.session === 'string' ? sp.session : null;

  if (!(await isOpenRouterConfigured())) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại project
        </Link>
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
          <h2 className="text-base font-semibold text-amber-900 mb-2">
            Feature Chat chưa được bật
          </h2>
          <p className="text-sm text-amber-800">
            Admin cần set <code className="bg-white px-1 rounded">OPENROUTER_API_KEY</code>{' '}
            tại{' '}
            <Link href="/settings/integrations" className="underline font-semibold">
              /settings/integrations
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const [project, sessions] = await Promise.all([
    getProjectForUser(projectId, user.userId),
    listProjectSessions(projectId, user.userId),
  ]);
  if (!project) notFound();

  const activeSession =
    sessionParam && /^[0-9a-f-]{36}$/.test(sessionParam)
      ? await getProjectSessionForUser(sessionParam, user.userId)
      : null;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại project
        </Link>
        <span className="text-zinc-300">·</span>
        <MessageSquareIcon className="size-4 text-blue-600" />
        <h1 className="text-sm font-semibold text-zinc-900 truncate">
          {project.icon ?? '📁'} {project.name}
        </h1>
      </div>

      <ProjectChatShell
        projectId={projectId}
        projectName={project.name}
        initialSessions={sessions}
        activeSession={activeSession}
        availableModels={AVAILABLE_MODELS.map((m) => ({
          id: m.id,
          label: m.label,
          description: m.description,
        }))}
      />
    </div>
  );
}
