/**
 * Weekly & monthly study targets (pure).
 *
 * A target is a goal for a time window. Progress is ALWAYS computed from the
 * student's real records — never stored as a percentage — so editing history
 * or ticking a checklist immediately updates every target that depends on it.
 *
 * Metrics:
 *  - chapters:        selected chapters (or the whole subject) currently
 *                     complete. The window is the review/deadline period.
 *  - checklist_items: checklist ticks whose completed_at falls in the window.
 *  - lectures:        completed lectures whose lecture_date falls in the window.
 *  - minutes:         study-session minutes whose session_date falls in the window.
 */
import { addDaysISO, weekRange } from '@/domain/dates';
import type {
  ChapterChecklistProgress,
  DateOnly,
  ID,
  LectureRecord,
  StudySession,
  StudyTarget,
  UserChapter,
} from '@/types/domain';

export const TARGET_METRICS = ['chapters', 'checklist_items', 'lectures', 'minutes'] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_METRIC_LABELS: Record<TargetMetric, string> = {
  chapters: 'Chapters complete',
  checklist_items: 'Checklist items done',
  lectures: 'Lectures completed',
  minutes: 'Study minutes',
};

export const TARGET_PERIODS = ['weekly', 'monthly'] as const;
export type TargetPeriod = (typeof TARGET_PERIODS)[number];

export interface TargetWindow {
  start: DateOnly;
  end: DateOnly;
}

/** Sunday–Saturday week (the app-wide convention), or the calendar month. */
export function targetWindow(target: Pick<StudyTarget, 'period_type' | 'period_start'>): TargetWindow {
  if (target.period_type === 'weekly') return weekRange(target.period_start);
  const start = `${target.period_start.slice(0, 7)}-01`;
  const [year, month] = start.split('-').map(Number) as [number, number];
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, end: addDaysISO(nextMonth, -1) };
}

export function currentPeriodStart(period: TargetPeriod, today: DateOnly): DateOnly {
  return period === 'weekly' ? weekRange(today).start : `${today.slice(0, 7)}-01`;
}

export interface TargetProgressInput {
  chapters: UserChapter[];
  /** Derived/effective chapter status by chapter id (from the workspace view). */
  chapterStatusById: Map<ID, string>;
  checklistProgress: ChapterChecklistProgress[];
  /** chapter id per checklist item id, for subject/chapter scoping. */
  chapterIdByItemId: Map<ID, ID>;
  /** subject id per chapter id. */
  subjectIdByChapterId: Map<ID, ID>;
  lectures: LectureRecord[];
  sessions: StudySession[];
}

export type TargetState = 'upcoming' | 'active' | 'completed' | 'overdue';

export interface TargetProgress {
  current: number;
  goal: number;
  percent: number;
  remaining: number;
  state: TargetState;
  window: TargetWindow;
}

function inWindow(date: DateOnly | null | undefined, window: TargetWindow): boolean {
  return Boolean(date && date >= window.start && date <= window.end);
}

export function computeTargetProgress(target: StudyTarget, input: TargetProgressInput, today: DateOnly): TargetProgress {
  const window = targetWindow(target);
  const scopedChapter = (chapterId: ID | null | undefined): boolean => {
    if (!chapterId) return !target.user_subject_id && target.chapter_ids.length === 0;
    if (target.chapter_ids.length > 0) return target.chapter_ids.includes(chapterId);
    if (target.user_subject_id) return input.subjectIdByChapterId.get(chapterId) === target.user_subject_id;
    return true;
  };

  let current = 0;
  switch (target.metric) {
    case 'chapters': {
      const scope = target.chapter_ids.length > 0
        ? input.chapters.filter((c) => target.chapter_ids.includes(c.id))
        : input.chapters.filter((c) => !target.user_subject_id || c.user_subject_id === target.user_subject_id);
      current = scope.filter((c) => input.chapterStatusById.get(c.id) === 'complete').length;
      break;
    }
    case 'checklist_items': {
      current = input.checklistProgress.filter(
        (p) =>
          p.is_done &&
          inWindow(p.completed_at ? p.completed_at.slice(0, 10) : null, window) &&
          scopedChapter(input.chapterIdByItemId.get(p.checklist_item_id)),
      ).length;
      break;
    }
    case 'lectures': {
      current = input.lectures.filter(
        (l) =>
          l.is_completed &&
          inWindow(l.lecture_date, window) &&
          (!target.user_subject_id || l.user_subject_id === target.user_subject_id) &&
          (target.chapter_ids.length === 0 || (l.user_chapter_id !== null && target.chapter_ids.includes(l.user_chapter_id))),
      ).length;
      break;
    }
    case 'minutes': {
      current = input.sessions
        .filter(
          (s) =>
            inWindow(s.session_date, window) &&
            (!target.user_subject_id || s.user_subject_id === target.user_subject_id) &&
            (target.chapter_ids.length === 0 || (s.user_chapter_id !== null && target.chapter_ids.includes(s.user_chapter_id))),
        )
        .reduce((sum, s) => sum + s.duration_minutes, 0);
      break;
    }
  }

  const goal = Math.max(1, target.target_value);
  const percent = Math.min(100, Math.round((current / goal) * 100));
  const state: TargetState =
    current >= goal ? 'completed' : today > window.end ? 'overdue' : today < window.start ? 'upcoming' : 'active';
  return { current, goal, percent, remaining: Math.max(0, goal - current), state, window };
}

export interface TargetSummary {
  total: number;
  completed: number;
  active: number;
  overdue: number;
  upcoming: number;
  averagePercent: number;
}

export function summariseTargets(progresses: TargetProgress[]): TargetSummary {
  const summary: TargetSummary = { total: progresses.length, completed: 0, active: 0, overdue: 0, upcoming: 0, averagePercent: 0 };
  for (const progress of progresses) {
    summary[progress.state] += 1;
  }
  summary.averagePercent =
    progresses.length === 0 ? 0 : Math.round(progresses.reduce((sum, p) => sum + p.percent, 0) / progresses.length);
  return summary;
}
