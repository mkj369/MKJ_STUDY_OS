/**
 * Reminder planner.
 *
 * Pure logic: decides *what to schedule and when* in the student's own time
 * zone. It never claims delivery — rows are created with status `scheduled` and
 * only a platform confirmation may change that to `sent`.
 *
 * Responsibilities:
 *  - honour enable/disable per reminder type and the global opt-out
 *  - keep reminders outside quiet hours
 *  - cap the number of reminders per local day
 *  - suppress duplicates (same key, or same type+entity+day)
 *  - avoid scheduling anything in the past
 */
import { addDaysISO, getZonedParts, isWithinQuietHours, todayInZone, zonedWallTimeToInstant, addMinutesToTime } from '@/domain/dates';
import type { DateOnly, ReminderEvent, ReminderPreferences, ReminderType, StudyTask } from '@/types/domain';
import { isOpenTask, isOverdue } from '@/domain/tasks';
import type { RevisionQueueEntry } from '@/domain/revisions';

export interface ReminderPlanInput {
  prefs: ReminderPreferences;
  tasks: StudyTask[];
  revisionQueue: RevisionQueueEntry[];
  /** Keys already stored so they are not planned twice. */
  existingKeys: string[];
  /** Instants that already generated a reminder, for per-day caps. */
  existingEvents?: Pick<ReminderEvent, 'scheduled_for' | 'status'>[];
  now?: Date;
  weekHasIncompleteGoals?: boolean;
}

export interface PlannedReminder {
  reminder_key: string;
  reminder_type: ReminderType;
  scheduled_for: string;
  title: string;
  body: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  channel: ReminderPreferences['channel'];
}

export interface ReminderPlan {
  candidates: PlannedReminder[];
  suppressed: { reason: string; count: number }[];
  notes: string[];
  nextWeeklyPlanning: string | null;
}

const TYPE_ORDER: ReminderType[] = [
  'task_overdue',
  'task_due',
  'revision_due',
  'incomplete_goal',
  'weekly_planning',
];

const DEFAULT_DAILY_TIME = '08:00';

interface CandidateDraft extends Omit<PlannedReminder, 'scheduled_for' | 'channel'> {
  localDate: DateOnly;
  localTime: string;
  channel?: ReminderPreferences['channel'];
}

function localDateOf(instant: Date, timeZone: string): DateOnly {
  return getZonedParts(instant, timeZone).date;
}

/** Move a wall time out of the quiet window, rolling to the next day if needed. */
export function respectQuietHours(
  date: DateOnly,
  time: string,
  prefs: Pick<ReminderPreferences, 'quiet_hours_start' | 'quiet_hours_end'>,
): { date: DateOnly; time: string } {
  if (!isWithinQuietHours(time, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
    return { date, time };
  }
  const start = prefs.quiet_hours_start;
  const end = prefs.quiet_hours_end;
  const wrapped = start > end;
  const beforeQuietEnd = time < end;
  // A window like 22:00→07:00: times after 22:00 roll to tomorrow 07:00,
  // times before 07:00 stay today at 07:00.
  const nextDate = wrapped && beforeQuietEnd ? date : addDaysISO(date, 1);
  return { date: nextDate, time: end };
}

function nextWeeklyPlanningInstant(
  prefs: ReminderPreferences,
  now: Date,
): { localDate: DateOnly; localTime: string } {
  const today = todayInZone(prefs.timezone, now);
  const todayWeekday = getZonedParts(now, prefs.timezone).weekday;
  let delta = (prefs.weekly_planning_day - todayWeekday + 7) % 7;
  const proposed = zonedWallTimeToInstant(addDaysISO(today, delta), prefs.weekly_planning_time, prefs.timezone);
  if (proposed.getTime() <= now.getTime()) {
    delta += 7;
  }
  return { localDate: addDaysISO(today, delta), localTime: prefs.weekly_planning_time };
}

export function planReminders(input: ReminderPlanInput): ReminderPlan {
  const now = input.now ?? new Date();
  const prefs = input.prefs;
  const suppressed = new Map<string, number>();
  const notes: string[] = [];
  const bump = (reason: string) => suppressed.set(reason, (suppressed.get(reason) ?? 0) + 1);

  const nextPlanning = nextWeeklyPlanningInstant(prefs, now);
  const nextWeeklyPlanning = zonedWallTimeToInstant(
    nextPlanning.localDate,
    nextPlanning.localTime,
    prefs.timezone,
  ).toISOString();

  if (!prefs.reminders_enabled) {
    return {
      candidates: [],
      suppressed: [{ reason: 'Reminders are switched off in settings.', count: 1 }],
      notes,
      nextWeeklyPlanning,
    };
  }

  const today = todayInZone(prefs.timezone, now);
  const drafts: CandidateDraft[] = [];

  const pushTaskReminder = (task: StudyTask, type: 'task_due' | 'task_overdue', date: DateOnly) => {
    drafts.push({
      reminder_key: `${type}:${task.id}:${date}`,
      reminder_type: type,
      title: type === 'task_due' ? `Due today: ${task.title}` : `Still open: ${task.title}`,
      body:
        type === 'task_due'
          ? `${task.estimated_minutes} min planned. Open the app to start, reschedule, or mark it done.`
          : `This task passed its deadline. Reschedule it or mark it done — no guilt, just a next step.`,
      related_entity_type: 'study_task',
      related_entity_id: task.id,
      localDate: date,
      localTime: DEFAULT_DAILY_TIME,
    });
  };

  if (prefs.task_due_enabled) {
    for (const task of input.tasks.filter(isOpenTask)) {
      if (task.due_date === today) pushTaskReminder(task, 'task_due', today);
    }
  }
  if (prefs.task_overdue_enabled) {
    for (const task of input.tasks.filter((t) => isOverdue(t, today)).slice(0, 5)) {
      pushTaskReminder(task, 'task_overdue', today);
    }
  }

  if (prefs.revision_due_enabled) {
    for (const entry of input.revisionQueue) {
      if (entry.bucket !== 'overdue' && entry.bucket !== 'today' && entry.bucket !== 'this_week') continue;
      const date = entry.summary.nextDate;
      if (!date) continue;
      drafts.push({
        reminder_key: `revision_due:${entry.userChapterId}:${date}`,
        reminder_type: 'revision_due',
        title: `Revise: ${entry.chapterTitle}`,
        body: `${entry.subjectName} · last confidence ${
          entry.summary.lastConfidence ?? 'not recorded'
        }/5. A short recall session is enough to count.`,
        related_entity_type: 'user_chapter',
        related_entity_id: entry.userChapterId,
        localDate: date,
        localTime: DEFAULT_DAILY_TIME,
      });
    }
  }

  if (prefs.weekly_planning_enabled) {
    drafts.push({
      reminder_key: `weekly_planning:${nextPlanning.localDate}`,
      reminder_type: 'weekly_planning',
      title: 'Plan next week',
      body: 'Pick a few tasks that fit your real study time. You can always adjust later.',
      related_entity_type: null,
      related_entity_id: null,
      localDate: nextPlanning.localDate,
      localTime: nextPlanning.localTime,
    });
  }

  if (
    prefs.incomplete_goal_enabled &&
    input.weekHasIncompleteGoals &&
    getZonedParts(now, prefs.timezone).weekday === 6
  ) {
    drafts.push({
      reminder_key: `incomplete_goal:${today}`,
      reminder_type: 'incomplete_goal',
      title: 'This week’s unfinished goals',
      body: 'Some goals are still open. Carry the useful ones forward — finishing a smaller plan is fine.',
      related_entity_type: null,
      related_entity_id: null,
      localDate: today,
      localTime: '18:00',
    });
  }

  const existing = new Set(input.existingKeys);
  const perDay = new Map<DateOnly, number>();
  for (const event of input.existingEvents ?? []) {
    if (event.status === 'failed') continue;
    const date = localDateOf(new Date(event.scheduled_for), prefs.timezone);
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }

  const ordered = drafts.sort(
    (a, b) => TYPE_ORDER.indexOf(a.reminder_type) - TYPE_ORDER.indexOf(b.reminder_type),
  );

  const candidates: PlannedReminder[] = [];
  for (const draft of ordered) {
    if (existing.has(draft.reminder_key)) {
      bump('Already scheduled');
      continue;
    }
    const adjusted = respectQuietHours(draft.localDate, draft.localTime, prefs);
    const instant = zonedWallTimeToInstant(adjusted.date, adjusted.time, prefs.timezone);
    if (instant.getTime() <= now.getTime()) {
      bump('Would have been in the past');
      continue;
    }
    const localDay = getZonedParts(instant, prefs.timezone).date;
    const countForDay = perDay.get(localDay) ?? 0;
    if (countForDay >= prefs.max_per_day) {
      bump(`Daily cap reached (${prefs.max_per_day})`);
      continue;
    }
    perDay.set(localDay, countForDay + 1);
    candidates.push({
      reminder_key: draft.reminder_key,
      reminder_type: draft.reminder_type,
      scheduled_for: instant.toISOString(),
      title: draft.title,
      body: draft.body,
      related_entity_type: draft.related_entity_type,
      related_entity_id: draft.related_entity_id,
      channel: draft.channel ?? prefs.channel,
    });
  }

  if (candidates.length === 0 && suppressed.size === 0) {
    notes.push('Nothing to remind you about right now.');
  }
  notes.push(
    `Times use ${prefs.timezone.replace('_', ' ')}; quiet hours ${prefs.quiet_hours_start}–${prefs.quiet_hours_end}.`,
  );
  return {
    candidates,
    suppressed: [...suppressed.entries()].map(([reason, count]) => ({ reason, count })),
    notes,
    nextWeeklyPlanning,
  };
}

/** Used by tests/UI to show the quiet-hours window result without mutating state. */
export function quietHoursShiftPreview(
  date: DateOnly,
  time: string,
  prefs: Pick<ReminderPreferences, 'quiet_hours_start' | 'quiet_hours_end'>,
): string {
  const adjusted = respectQuietHours(date, time, prefs);
  return `${adjusted.date} ${adjusted.time}`;
}

export { addMinutesToTime };
