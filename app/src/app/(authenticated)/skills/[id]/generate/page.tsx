// /skills/[id]/generate — server shell.
// Auth + load skill + check 9Router configured → hand off to client shell.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, SparklesIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSkillById } from '@/lib/queries/skill-lib';
import { isOpenRouterConfigured } from '@/lib/llm/openrouter';
import { listAssetsForSkill } from '@/lib/queries/generated-asset';
import { GenerateShell } from './generate-shell';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SkillGeneratePage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id: skillId } = await params;

  // Check 9Router configured first → cheap fail trước khi load skill
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
            Feature &quot;Tạo ảnh&quot; chưa được bật
          </h2>
          <p className="text-sm text-amber-800">
            Admin cần set{' '}
            <code className="bg-white px-1 rounded">NINE_ROUTER_API_KEY</code> tại{' '}
            <Link href="/settings/integrations" className="underline font-semibold">
              /settings/integrations
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const [skill, recentAssets] = await Promise.all([
    getSkillById(skillId),
    listAssetsForSkill(skillId, user.userId, 12),
  ]);
  if (!skill) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href={`/skills/${skillId}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại skill
        </Link>
        <span className="text-zinc-300">·</span>
        <SparklesIcon className="size-4 text-pink-600" />
        <h1 className="text-sm font-semibold text-zinc-900 truncate">
          Tạo ảnh: {skill.name}
        </h1>
      </div>

      <GenerateShell skillId={skillId} initialAssets={recentAssets} />
    </div>
  );
}
