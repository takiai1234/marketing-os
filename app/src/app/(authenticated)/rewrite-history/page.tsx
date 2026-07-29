// /rewrite-history — lịch sử dùng AI (viết lại nội dung + chat Skill Library).
// Admin thấy toàn bộ team; member thường chỉ thấy của mình.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { listRewriteHistory } from '@/lib/queries/rewrite-history';

export const metadata = {
  title: 'Lịch sử dùng AI — Marketing OS',
};

const DATE_FMT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

const TONE_LABEL: Record<string, string> = {
  friendly: 'Thân thiện',
  professional: 'Chuyên nghiệp',
  'gen-z': 'Gen Z',
  storytelling: 'Kể chuyện',
  analytical: 'Phân tích',
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook_post: 'FB Post',
  facebook_reel: 'FB Reel',
  tiktok: 'TikTok',
  threads: 'Threads',
  blog: 'Blog',
  instagram: 'Instagram',
};

const LENGTH_LABEL: Record<string, string> = {
  short: 'Ngắn',
  medium: 'Vừa',
  long: 'Dài',
};

function modelLabel(model: string): string {
  if (model.startsWith('cc/')) return model.replace('cc/', 'Claude · ');
  if (model.startsWith('cx/')) return model.replace('cx/', 'ChatGPT · ');
  return model;
}

function modelBadgeClass(model: string): string {
  if (model.startsWith('cc/')) return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (model.startsWith('cx/')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  return 'bg-zinc-50 text-zinc-700 ring-zinc-200';
}

function featureLabel(feature: string): string {
  if (feature === 'skill_chat') return 'Chat Skill';
  return 'Viết lại';
}

function featureBadgeClass(feature: string): string {
  if (feature === 'skill_chat') return 'bg-blue-50 text-blue-700 ring-blue-200';
  return 'bg-orange-50 text-orange-700 ring-orange-200';
}

export default async function RewriteHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = await getUserRole(user.userId);
  const isAdmin = role === 'admin';

  const { items } = await listRewriteHistory({
    userId: isAdmin ? undefined : user.userId,
  });

  const totalTokensIn = items.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = items.reduce((s, r) => s + r.tokensOut, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Lịch sử dùng AI</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isAdmin
              ? 'Toàn bộ lịch sử sử dụng AI của team (viết lại nội dung + chat Skill).'
              : 'Lịch sử sử dụng AI của bạn (viết lại nội dung + chat Skill).'}
          </p>
        </div>

        {/* Tổng token */}
        <div className="flex gap-4 text-sm">
          <div className="rounded-lg bg-white ring-1 ring-zinc-200 px-4 py-2 text-center">
            <div className="text-xs text-zinc-500 mb-0.5">Tổng lượt</div>
            <div className="text-lg font-bold text-zinc-900">{items.length}</div>
          </div>
          <div className="rounded-lg bg-white ring-1 ring-zinc-200 px-4 py-2 text-center">
            <div className="text-xs text-zinc-500 mb-0.5">Tokens vào</div>
            <div className="text-lg font-bold text-zinc-900">{totalTokensIn.toLocaleString('vi-VN')}</div>
          </div>
          <div className="rounded-lg bg-white ring-1 ring-zinc-200 px-4 py-2 text-center">
            <div className="text-xs text-zinc-500 mb-0.5">Tokens ra</div>
            <div className="text-lg font-bold text-zinc-900">{totalTokensOut.toLocaleString('vi-VN')}</div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/30 px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">Chưa có lịch sử dùng AI nào.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60">
                  {isAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                      Thành viên
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Tính năng
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Model
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Nguồn / Skill
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Định dạng
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Tone / Dài
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Tokens
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    Thời gian
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/50 transition-colors">
                    {isAdmin && (
                      <td className="px-4 py-3 text-zinc-900 font-medium whitespace-nowrap">
                        {row.userName ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ${featureBadgeClass(row.feature)}`}>
                        {featureLabel(row.feature)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ${modelBadgeClass(row.model)}`}>
                        {modelLabel(row.model)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 text-xs">
                      {row.feature === 'skill_chat' ? (
                        <div className="text-zinc-700 font-medium">{row.skillName ?? row.sourceContext ?? '—'}</div>
                      ) : (
                        <>
                          <div>{row.sourceType === 'news' ? 'Tin tức' : 'Thư viện'}</div>
                          {row.sourceContext && (
                            <div className="text-zinc-400 truncate max-w-[140px]">{row.sourceContext}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 text-xs whitespace-nowrap">
                      {row.platform ? (PLATFORM_LABEL[row.platform] ?? row.platform) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">
                      {row.tone || row.length ? (
                        <>
                          {TONE_LABEL[row.tone ?? ''] ?? row.tone ?? '—'}
                          <span className="text-zinc-400 mx-1">·</span>
                          {LENGTH_LABEL[row.length ?? ''] ?? row.length ?? '—'}
                        </>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                      {row.tokensIn.toLocaleString('vi-VN')} in
                      <span className="text-zinc-300 mx-1">·</span>
                      {row.tokensOut.toLocaleString('vi-VN')} out
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-400 whitespace-nowrap">
                      {DATE_FMT.format(new Date(row.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length === 50 && (
            <div className="px-4 py-3 border-t border-zinc-100 text-xs text-zinc-400 text-center">
              Hiển thị 50 lần gần nhất
            </div>
          )}
        </div>
      )}
    </div>
  );
}
