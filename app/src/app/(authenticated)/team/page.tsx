import type { Metadata } from 'next';
import { fetchTeamKpi } from '@/lib/queries/team-kpi';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { TeamKpiSummaryCards } from '@/components/team/team-kpi-summary';
import { TeamMemberGrid } from '@/components/team/team-member-grid';
import { AddMemberDialog } from './add-member-dialog';
import { DeleteMemberButton } from './delete-member-button';
import { ResetPasswordDialog } from './reset-password-dialog';
import { GoalEditorDialog } from './goal-editor-dialog';
import { EditMemberDialog } from './edit-member-dialog';

export const metadata: Metadata = {
  title: 'Team — Marketing OS',
};

export default async function TeamPage() {
  const [{ summary, members }, user] = await Promise.all([
    fetchTeamKpi(),
    getCurrentUser(),
  ]);

  const role = user ? await getUserRole(user.userId) : null;
  const isAdmin = role === 'admin';
  const currentUserId = user?.userId ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header — title + subtitle + CTA dialog */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">KPI đội ngũ</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Hiệu suất từng thành viên · radar 5 dimension · xếp hạng tuần
          </p>
        </div>
        <AddMemberDialog />
      </div>

      {/* Tier 1: 4 summary cards */}
      <TeamKpiSummaryCards data={summary} />

      {/* Tier 2: Member cards grid — admin sees: GoalEditorDialog cho mọi
          member (kể cả chính mình), + ResetPassword/Delete cho member khác
          (không cho self-action → tránh lock-out). Non-admin chỉ thấy goal
          read-only (qua progress bars trong card body). */}
      <TeamMemberGrid
        members={members}
        renderAction={
          isAdmin
            ? (m) => (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <GoalEditorDialog
                    memberId={m.id}
                    memberName={m.name}
                    initialFollowGrowth={m.goals.goalFollowGrowth30d}
                    initialReach={m.goals.goalReach30d}
                    initialPostsPerChannel={m.goals.goalPostsPerChannel30d}
                  />
                  <EditMemberDialog
                    id={m.id}
                    initialName={m.name}
                    initialEmail={m.email}
                    initialRole={m.role}
                    isSelf={m.id === currentUserId}
                  />
                  {m.id !== currentUserId && (
                    <>
                      <ResetPasswordDialog id={m.id} name={m.name} />
                      <DeleteMemberButton id={m.id} name={m.name} />
                    </>
                  )}
                </div>
              )
            : undefined
        }
      />
    </div>
  );
}
