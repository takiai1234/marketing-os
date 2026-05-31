import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type {
  GoalProgress,
  TeamMemberKpi,
  MemberStatus,
} from '@/lib/queries/team-kpi';
import { EMPTY_ROLE_LABEL } from '@/lib/queries/team-kpi';
import { TeamRadarChart } from './team-radar-chart';

// Neutral palette for unmeasured members — distinct from coach (rose) so admins
// don't mistake "no data yet" for "underperforming".
const EMPTY_BADGE_CLS = 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200';

interface TeamMemberCardProps {
  member: TeamMemberKpi;
  /** Optional action slot rendered in the header (e.g. delete button). */
  action?: ReactNode;
}

// Style của status badge — match palette với radar polygon trong cùng card.
const STATUS_STYLE: Record<
  MemberStatus,
  { label: string; cls: string }
> = {
  top: {
    label: 'TOP',
    cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  },
  good: {
    label: 'TỐT',
    cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  },
  coach: {
    label: 'CẦN COACH',
    cls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
  },
};

export function TeamMemberCard({ member, action }: TeamMemberCardProps) {
  const status = STATUS_STYLE[member.status];
  const isEmpty = member.roleLabel === EMPTY_ROLE_LABEL;

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-5 ring-1 ring-zinc-200 shadow-sm">
      {/* Header — avatar + name + role + status */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
            member.avatarColor
          )}
        >
          {member.initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900 leading-tight">
            {member.name}
          </p>
          <p className="truncate text-[11px] text-zinc-400 mt-0.5">
            {member.roleLabel}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {member.rank === 1 && (
            <span className="text-[10px] font-bold text-amber-600 leading-none">
              #1
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold',
              isEmpty ? EMPTY_BADGE_CLS : status.cls
            )}
          >
            {isEmpty ? 'CHƯA CÓ DATA' : status.label}
          </span>
          {action}
        </div>
      </div>

      {/* Body — radar (left) + 6 metrics (right) */}
      <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
        <TeamRadarChart
          dimensions={member.radar}
          status={member.status}
          size={140}
        />

        <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
          {member.metrics.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] text-zinc-500 truncate">
                {m.label}
              </span>
              <span className="text-xs font-semibold text-zinc-900 tabular-nums shrink-0">
                {m.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Goals section — 3 progress bars (Follow / Reach / Posts per channel).
          Chỉ hiển thị khi có ít nhất 1 goal được set; nếu cả 3 = 0 (chưa set)
          → chỉ show 1 dòng nhắc admin có thể đặt mục tiêu qua nút trên header.
          Display luôn bất kể empty/measured member — admin có thể đặt goal
          cho member chưa có data để baseline trước. */}
      <GoalsSection goals={member.goals} />

      {/* Footer tags */}
      {member.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {member.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-[10px] font-medium text-zinc-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goals subcomponent ────────────────────────────────────────────────────

function GoalsSection({ goals }: { goals: TeamMemberKpi['goals'] }) {
  const items = [goals.progress.follow, goals.progress.reach, goals.progress.postsPerChannel];
  const hasAnyGoal = items.some((g) => g.goal > 0);

  return (
    <div className="border-t border-zinc-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Mục tiêu 30 ngày
        </h4>
        {goals.numChannels > 0 && (
          <span className="text-[10px] text-zinc-400">
            {goals.numChannels} kênh
          </span>
        )}
      </div>

      {!hasAnyGoal ? (
        <p className="text-xs text-zinc-400 italic">
          Chưa đặt mục tiêu. Admin bấm <strong>Mục tiêu</strong> ở góc phải để đặt.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((g) => (
            <GoalProgressRow key={g.label} goal={g} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalProgressRow({ goal }: { goal: GoalProgress }) {
  // Cap bar 100% nhưng số raw có thể > 100% (vd 120% = đạt vượt mục tiêu)
  const barWidth = goal.progressPct === null
    ? 0
    : Math.min(100, goal.progressPct);

  // Color theo % đạt: ≥100% green, 70-99% blue, 40-69% amber, <40% rose
  // null (chưa set goal) → neutral zinc
  const colorClass =
    goal.progressPct === null ? 'bg-zinc-200'
    : goal.progressPct >= 100 ? 'bg-emerald-500'
    : goal.progressPct >= 70  ? 'bg-blue-500'
    : goal.progressPct >= 40  ? 'bg-amber-500'
    :                            'bg-rose-500';

  const labelColorClass =
    goal.progressPct === null ? 'text-zinc-400'
    : goal.progressPct >= 100 ? 'text-emerald-700'
    : goal.progressPct >= 70  ? 'text-blue-700'
    : goal.progressPct >= 40  ? 'text-amber-700'
    :                            'text-rose-700';

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-zinc-700 truncate min-w-0">{goal.label}</span>
        <span className="tabular-nums shrink-0 text-zinc-500">
          <span className={cn('font-semibold', labelColorClass)}>
            {goal.actualLabel}
          </span>
          {goal.goal > 0 && (
            <>
              {' / '}
              <span className="text-zinc-600">{goal.goalLabel}</span>
              {goal.progressPct !== null && (
                <span className={cn('ml-1.5 text-[10px] font-bold', labelColorClass)}>
                  {goal.progressPct}%
                </span>
              )}
            </>
          )}
        </span>
      </div>
      {goal.goal > 0 && (
        <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', colorClass)}
            style={{ width: `${Math.max(barWidth, 2)}%` }}
          />
        </div>
      )}
    </li>
  );
}
