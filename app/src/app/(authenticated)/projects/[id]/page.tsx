// /projects/[id] — chi tiết project: edit instructions + manage files + chat link

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageSquareIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getProjectForUser, listFilesForProject } from '@/lib/queries/projects';
import { isKieConfigured } from '@/lib/llm/kie-ai';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProjectDetailShell } from './project-detail-shell';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const [project, kieReady] = await Promise.all([
    getProjectForUser(id, user.userId),
    isKieConfigured(),
  ]);
  if (!project) notFound();

  const files = await listFilesForProject(id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại danh sách
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-xl shrink-0 text-2xl',
              project.colorHex ? 'text-white' : 'bg-violet-50 text-violet-600'
            )}
            style={
              project.colorHex
                ? { backgroundColor: `#${project.colorHex}` }
                : undefined
            }
          >
            {project.icon ?? '📁'}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-zinc-900 truncate">
              {project.name}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {project.fileCount} file ·{' '}
              {(project.totalContentChars / 1000).toFixed(0)}K chars knowledge
            </p>
          </div>
        </div>

        {kieReady && (
          <Link
            href={`/projects/${project.id}/chat`}
            className={cn(
              buttonVariants({ variant: 'default' }),
              'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            <MessageSquareIcon className="size-4" />
            Mở chat
          </Link>
        )}
      </div>

      <ProjectDetailShell
        initialProject={project}
        initialFiles={files}
      />
    </div>
  );
}
