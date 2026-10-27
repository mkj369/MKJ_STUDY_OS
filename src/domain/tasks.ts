import { addDaysISO, diffDaysISO, weekRange } from '@/domain/dates';
import type { DateOnly, StudyTask, TaskPriority, TaskStatus } from '@/types/domain';

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 3, medium: 2, low: 1 };

export const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress'];

export function isOpenTask(task: StudyTask): boolean {
  return OPEN_STATUSES.includes(task.status);
}

export function isOverdue(task: StudyTask, today: DateOnly): boolean {
  return isOpenTask(task) && task.due_date !== null && task.due_date < today;
}

export function isDueToday(task: StudyTask, today: DateOnly): boolean {
  return isOpenTask(task) && task.due_date === today;
}

/**
 * Planning order (documented, deterministic):
 * overdue first, then due date (soonest first, undated last), then priority,
 * then carried-over count, then shorter tasks first.
 */
export function compareTasksForPlanning(a: StudyTask, b: StudyTask, today: DateOnly): number {
  const overdueA = isOverdue(a, today) ? 0 : 1;
  const overdueB = isOverdue(b, today) ? 0 : 1;
  if (overdueA !== overdueB) return overdueA - overdueB;
  const dueA = a.due_date ?? '9999-12-31';
  const dueB = b.due_date ?? '9999-12-31';
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  if (PRIORITY_WEIGHT[a.priority] !== PRIORITY_WEIGHT[b.priority]) {
    return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  }
  if (a.carried_over_count !== b.carried_over_count) return b.carried_over_count - a.carried_over_count;
  if (a.estimated_minutes !== b.estimated_minutes) return a.estimated_minutes - b.estimated_minutes;
  return a.title.localeCompare(b.title);
}

export function sortTasksForPlanning(tasks: StudyTask[], today: DateOnly): StudyTask[] {
  return [...tasks].sort((a, b) => compareTasksForPlanning(a, b, today));
}

export interface TaskCounts {
  open: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  doneThisWeek: number;
  blocked: number;
  totalMinutesOpen: number;
  completedMinutesThisWeek: number;
}

export function summarizeTasks(tasks: StudyTask[], today: DateOnly): TaskCounts {
  const week = weekRange(today);
  const open = tasks.filter(isOpenTask);
  return {
    open: open.length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    dueToday: tasks.filter((t) => isDueToday(t, today)).length,
    dueThisWeek: open.filter(
      (t) => t.due_date !== null && t.due_date >= week.start && t.due_date <= week.end,
    ).length,
    doneThisWeek: tasks.filter(
      (t) => t.status === 'done' && t.completed_at !== null && t.completed_at.slice(0, 10) >= week.start && t.completed_at.slice(0, 10) <= week.end,
    ).length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    totalMinutesOpen: open.reduce((sum, t) => sum + t.estimated_minutes, 0),
    completedMinutesThisWeek: tasks
      .filter((t) => t.status === 'done' && t.completed_at !== null && t.completed_at.slice(0, 10) >= week.start && t.completed_at.slice(0, 10) <= week.end)
      .reduce((sum, t) => sum + t.estimated_minutes, 0),
  };
}

/** Patch that carries an unfinished task into the current week without guilt. */
export function carryOverPatch(task: StudyTask, today: DateOnly): Partial<StudyTask> | null {
  if (!isOpenTask(task)) return null;
  if (task.planned_date === null || task.planned_date >= today) return null;
  return { planned_date: null, carried_over_count: task.carried_over_count + 1 };
}

export function tasksForDay(tasks: StudyTask[], date: DateOnly): StudyTask[] {
  return tasks
    .filter((t) => isOpenTask(t) && t.planned_date === date)
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
}

/** Tasks that should appear on the dashboard as "today". */
export function todayTasks(tasks: StudyTask[], today: DateOnly): StudyTask[] {
  return tasks
    .filter((t) => isOpenTask(t))
    .filter((t) => t.planned_date === today || t.due_date === today || isOverdue(t, today))
    .sort((a, b) => compareTasksForPlanning(a, b, today));
}

export interface PlannerDay {
  date: DateOnly;
  weekday: number;
  capacityMinutes: number;
  planned: StudyTask[];
  usedMinutes: number;
  isRestDay: boolean;
}

export interface PlanDraft {
  weekStart: DateOnly;
  weekEnd: DateOnly;
  days: PlannerDay[];
  unscheduled: StudyTask[];
  carriedForward: StudyTask[];
  totalCapacityMinutes: number;
  totalPlannedMinutes: number;
  warnings: string[];
}

/**
 * Draft a week from real availability.
 *
 * The draft is only a *suggestion*: nothing is written until the student taps
 * "Accept plan". Tasks already planned on a visible day keep that day (locked),
 * remaining tasks fill the remaining capacity by the planning order above.
 */
export function buildWeeklyPlanDraft(
  tasks: StudyTask[],
  availability: Record<string, number> | null,
  weekStartDate: DateOnly,
  today: DateOnly,
): PlanDraft {
  const { start, end } = weekRange(weekStartDate);
  const warnings: string[] = [];
  const days: PlannerDay[] = [];
  const open = tasks.filter(isOpenTask);
  const assigned = new Map<string, DateOnly>();
  const availableFor = (weekday: number) => Math.max(0, Math.round(availability?.[String(weekday)] ?? 0));

  const dates: DateOnly[] = [];
  for (let i = 0; i < 7; i += 1) dates.push(addDaysISO(start, i));

  for (const date of dates) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const capacity = availableFor(weekday);
    const planned = open
      .filter((t) => t.planned_date === date)
      .sort((a, b) => compareTasksForPlanning(a, b, today));
    for (const task of planned) assigned.set(task.id, date);
    days.push({
      date,
      weekday,
      capacityMinutes: capacity,
      planned,
      usedMinutes: planned.reduce((sum, t) => sum + t.estimated_minutes, 0),
      isRestDay: capacity === 0,
    });
  }

  const pool = sortTasksForPlanning(
    open.filter((t) => !assigned.has(t.id)),
    today,
  );

  const carriedForward: StudyTask[] = [];
  for (const task of pool) {
    const overdue = isOverdue(task, today) || (task.planned_date !== null && task.planned_date < today);
    if (overdue) carriedForward.push(task);
    // Never schedule into days that already passed.
    const candidates = days.filter((d) => d.date >= today && !d.isRestDay);
    const target = candidates.find((d) => d.usedMinutes + task.estimated_minutes <= d.capacityMinutes);
    const fallback = candidates.find((d) => d.usedMinutes === 0);
    const chosen = target ?? fallback;
    if (chosen) {
      chosen.planned.push(task);
      chosen.usedMinutes += task.estimated_minutes;
      assigned.set(task.id, chosen.date);
    }
  }

  const unscheduled = pool.filter((t) => !assigned.has(t.id));
  const totalCapacityMinutes = days
    .filter((d) => d.date >= today)
    .reduce((sum, d) => sum + d.capacityMinutes, 0);
  const totalPlannedMinutes = days.reduce((sum, d) => sum + d.usedMinutes, 0);

  if (totalCapacityMinutes === 0 && pool.length > 0) {
    warnings.push('No study time is set for the remaining days this week. Add availability or pick a smaller plan.');
  }
  if (totalPlannedMinutes > totalCapacityMinutes) {
    warnings.push(
      `The plan needs ${totalPlannedMinutes - totalCapacityMinutes} minutes more than the time you entered. Consider a smaller plan.`,
    );
  }
  if (unscheduled.length > 0) {
    warnings.push(
      `${unscheduled.length} task${unscheduled.length === 1 ? " doesn't" : "s don't"} fit this week. Move them, split them, or keep them for next week.`,
    );
  }
  if (carriedForward.length > 0) {
    warnings.push(
      `${carriedForward.length} unfinished task${carriedForward.length === 1 ? '' : 's'} carried forward from earlier. Nothing was deleted.`,
    );
  }

  return {
    weekStart: start,
    weekEnd: end,
    days,
    unscheduled,
    carriedForward,
    totalCapacityMinutes,
    totalPlannedMinutes,
    warnings,
  };
}

/** Recovery plan: reduce scope to what actually fits, never delete work. */
export function buildRecoveryDraft(draft: PlanDraft): { keep: StudyTask[]; defer: StudyTask[]; message: string } {
  const keep: StudyTask[] = [];
  const defer: StudyTask[] = [];
  for (const day of draft.days) {
    let used = 0;
    for (const task of day.planned) {
      if (used + task.estimated_minutes <= day.capacityMinutes) {
        keep.push(task);
        used += task.estimated_minutes;
      } else {
        defer.push(task);
      }
    }
  }
  defer.push(...draft.unscheduled);
  const message =
    defer.length === 0
      ? 'Everything already fits. No changes needed.'
      : `Keep ${keep.length} task${keep.length === 1 ? '' : 's'} this week and carry ${defer.length} forward. A shorter plan you finish beats a long one you abandon.`;
  return { keep, defer, message };
}

export function daysUntil(date: DateOnly, today: DateOnly): number {
  return diffDaysISO(today, date);
}
