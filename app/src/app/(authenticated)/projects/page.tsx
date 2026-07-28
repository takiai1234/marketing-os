// /projects — list user's projects (grid card)

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FolderPlusIcon, FilesIcon, MessageSquareIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { listProjectsForUser } from '@/lib/queries/projects';
import { isOpenRouterConfigured } from '@/lib/llm/openrouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Projects — Marketing OS',
};

const DATE_FMT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return DATE_FMT.format(date);
}

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [projects, llmReady] = await Promise.all([
    listProjectsForUser(user.userId),
    isOpenRouterConfigured(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Projects</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Workspace cá nhân với custom instructions + knowledge files.
            Giống Claude.ai Projects. Mỗi project có chat session riêng.
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="bg-violet-600 hover:bg-violet-700 text-white">
            <FolderPlusIcon className="size-4" />
            Tạo project mới
          </Button>
        </Link>
      </div>

      {!llmReady && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-900">
          <strong>Chú ý:</strong> Chat trong project cần{' '}
          <code className="bg-white px-1 rounded">NINE_ROUTER_API_KEY</code>.
          Admin set tại{' '}
          <Link href="/settings/integrations" className="underline font-semibold">
            /settings/integrations
          </Link>
          . Bạn vẫn tạo + upload file được, chỉ tab Chat sẽ ẩn.
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/30 px-6 py-12 text-center">
          <FolderPlusIcon className="size-12 text-zinc-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-zinc-700 mb-1">
            Chưa có project nào
          </h3>
          <p className="text-sm text-zinc-500 mb-4 max-w-md mx-auto">
            Tạo project đầu tiên — paste custom instructions + upload file
            knowledge (PDF/DOCX/MD/...) để chat với AI dùng context riêng.
          </p>
          <Link href="/projects/new">
            <Button className="bg-violet-600 hover:bg-violet-700 text-white">
              <FolderPlusIcon className="size-4" />
              Tạo project đầu tiên
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group rounded-xl bg-white ring-1 ring-zinc-200 hover:ring-violet-300 hover:shadow-md transition p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex size-10 items-center justify-center rounded-lg shrink-0 text-lg',
                    p.colorHex
                      ? 'text-white'
                      : 'bg-violet-50 text-violet-600'
                  )}
                  style={p.colorHex ? { backgroundColor: `#${p.colorHex}` } : undefined}
                >
                  {p.icon ?? '📁'}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-zinc-900 truncate group-hover:text-violet-700">
                    {p.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Sửa {formatRelativeTime(p.updatedAt)}
                  </p>
                </div>
              </div>

              {p.instructions && (
                <p className="text-xs text-zinc-600 line-clamp-3 leading-relaxed">
                  {p.instructions}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-auto pt-2 border-t border-zinc-100">
                <span className="flex items-center gap-1">
                  <FilesIcon className="size-3.5" />
                  {p.fileCount} file
                </span>
                {p.totalContentChars > 0 && (
                  <span>{(p.totalContentChars / 1000).toFixed(0)}K chars</span>
                )}
                <span className="ml-auto flex items-center gap-1 text-violet-600 group-hover:text-violet-800">
                  <MessageSquareIcon className="size-3.5" />
                  Mở
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
