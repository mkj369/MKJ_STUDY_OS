/**
 * Daily time tracking.
 *
 * One rule drives the whole module: a minute is counted exactly once.
 * Study time lives in `study_sessions` (the existing source of truth); the rest
 * of the day lives in `daily_blocks`. The timeline merges both views without
 * copying data, so subject totals and day totals can never disagree.
 *
 * Everything is pure and takes an explicit `today`/`now`.
 */
import { diffDaysISO } from '@/domain/dates';
import type {
  DailyBlock,
  DateOnly,
  DayBlockCategory,
  StudySession,
  Timestamp,
  UserSubject,
} from '@/types/domain';

export const DAY_CATEGORY_LABELS: Record<DayBlockCategory, string> = {
  college: 'College',
  class: 'Class / coaching',
  exam: 'Exam',
  homework: 'Homework',
  sleep: 'Sleep',
  break: 'Break',
  personal: 'Personal',
  commute: 'Commute',
  prayer: 'Prayer',
  custom: 'Custom',
};

export const ACTIVITY_LABELS: Record<string, string> = {
  reading: 'Book reading',
  notes: 'Notes',
  concept_review: 'Concept review',
  practice: 'Practice',
  board_questions: 'Board questions',
  admission_questions: 'Admission questions',
  mcq: 'MCQ practice',
  written: 'Written practice',
  test: 'Test',
  other: 'Other study',
};

export type TimelineKind = 'study' | 'block';

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  date: DateOnly;
  /** Minutes counted for this entry. */
  minutes: number;
  /** Stable label used by the UI and the day summary. */
  label: string;
  category: string;
  subjectId: string | null;
  subjectName: string | null;
  chapterId: string | null;
  taskId: string | null;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  source: string;
  notes: string | null;
}

export interface TimelineInput {
  sessions: StudySession[];
  blocks: DailyBlock[];
  subjects?: Pick<UserSubject, 'id' | 'custom_name' | 'custom_paper_label'>[];
  subjectLabels?: Record<string, string>;
}

function subjectNameFor(
  subjectId: string | null,
  input: Pick<TimelineInput, 'subjects' | 'subjectLabels'>,
): string | null {
  if (!subjectId) return null;
  if (input.subjectLabels?.[subjectId]) return input.subjectLabels[subjectId] as string;
  const subject = input.subjects?.find((s) => s.id === subjectId);
  if (!subject) return null;
  if (subject.custom_name) {
    return subject.custom_paper_label ? `${subject.custom_name} (${subject.custom_paper_label})` : subject.custom_name;
  }
  return 'Subject';
}

export function sessionToEntry(session: StudySession, input: Pick<TimelineInput, 'subjects' | 'subjectLabels'> = {}): TimelineEntry {
  return {
    kind: 'study',
    id: session.id,
    date: session.session_date,
    minutes: session.duration_minutes,
    label: ACTIVITY_LABELS[session.activity_type] ?? session.activity_type,
    category: session.activity_type,
    subjectId: session.user_subject_id,
    subjectName: subjectNameFor(session.user_subject_id, input),
    chapterId: session.user_chapter_id,
    taskId: session.user_task_id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    source: session.source ?? 'manual',
    notes: session.notes,
  };
}

export function blockToEntry(block: DailyBlock, input: Pick<TimelineInput, 'subjects' | 'subjectLabels'> = {}): TimelineEntry {
  const label = block.category === 'custom'
    ? block.custom_label ?? 'Custom block'
    : DAY_CATEGORY_LABELS[block.category];
  return {
    kind: 'block',
    id: block.id,
    date: block.entry_date,
    minutes: block.duration_minutes,
    label,
    category: block.category,
    subjectId: block.user_subject_id,
    subjectName: subjectNameFor(block.user_subject_id, input),
    chapterId: block.user_chapter_id,
    taskId: null,
    startedAt: block.started_at,
    endedAt: block.ended_at,
    source: block.source,
    notes: block.notes,
  };
}

/** All entries for one calendar date, timed entries first in clock order. */
export function buildTimeline(input: TimelineInput, date: DateOnly): TimelineEntry[] {
  const entries = [
    ...input.sessions.filter((s) => s.session_date === date).map((s) => sessionToEntry(s, input)),
    ...input.blocks.filter((b) => b.entry_date === date).map((b) => blockToEntry(b, input)),
  ];
  return entries.sort((a, b) => {
    if (a.startedAt && b.startedAt) {
      if (a.startedAt === b.startedAt) return a.id.localeCompare(b.id);
      return a.startedAt < b.startedAt ? -1 : 1;
    }
    if (a.startedAt) return -1;
    if (b.startedAt) return 1;
    if (a.minutes !== b.minutes) return b.minutes - a.minutes;
    return a.id.localeCompare(b.id);
  });
}

export interface TimeSummary {
  studyMinutes: number;
  otherMinutes: number;
  totalLoggedMinutes: number;
  studyEntries: number;
  otherEntries: number;
  byCategory: { category: string; label: string; minutes: number }[];
  bySubject: { subjectId: string; subjectName: string; minutes: number }[];
  /** Minutes recorded with an explicit clock time, for overlap checks. */
  timedMinutes: number;
}

export function summarizeTime(entries: TimelineEntry[]): TimeSummary {
  const study = entries.filter((e) => e.kind === 'study');
  const other = entries.filter((e) => e.kind === 'block');
  const categories = new Map<string, { label: string; minutes: number }>();
  for (const entry of entries) {
    const current = categories.get(entry.category) ?? { label: entry.label, minutes: 0 };
    current.minutes += entry.minutes;
    categories.set(entry.category, current);
  }
  const subjects = new Map<string, { subjectName: string; minutes: number }>();
  for (const entry of study) {
    if (!entry.subjectId) continue;
    const current = subjects.get(entry.subjectId) ?? { subjectName: entry.subjectName ?? 'Subject', minutes: 0 };
    current.minutes += entry.minutes;
    subjects.set(entry.subjectId, current);
  }
  const studyMinutes = study.reduce((sum, e) => sum + e.minutes, 0);
  const otherMinutes = other.reduce((sum, e) => sum + e.minutes, 0);
  return {
    studyMinutes,
    otherMinutes,
    totalLoggedMinutes: studyMinutes + otherMinutes,
    studyEntries: study.length,
    otherEntries: other.length,
    byCategory: [...categories.entries()]
      .map(([category, value]) => ({ category, label: value.label, minutes: value.minutes }))
      .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label)),
    bySubject: [...subjects.entries()]
      .map(([subjectId, value]) => ({ subjectId, subjectName: value.subjectName, minutes: value.minutes }))
      .sort((a, b) => b.minutes - a.minutes || a.subjectName.localeCompare(b.subjectName)),
    timedMinutes: entries.filter((e) => e.startedAt && e.endedAt).reduce((sum, e) => sum + e.minutes, 0),
  };
}

export interface OverlapPair {
  first: TimelineEntry;
  second: TimelineEntry;
  overlapMinutes: number;
}

/**
 * Detects timed entries that claim the same wall-clock minutes.
 * Manual entries without a start/end cannot overlap and are not guessed at.
 */
export function findOverlaps(entries: TimelineEntry[]): OverlapPair[] {
  const timed = entries
    .filter((e) => e.startedAt && e.endedAt)
    .map((e) => ({ entry: e, start: new Date(e.startedAt as string).getTime(), end: new Date(e.endedAt as string).getTime() }))
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start)
    .sort((a, b) => a.start - b.start || a.entry.id.localeCompare(b.entry.id));

  const pairs: OverlapPair[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (!a || !b) continue;
      if (b.start >= a.end) break;
      const overlapMs = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlapMs > 0) {
        pairs.push({
          first: a.entry,
          second: b.entry,
          overlapMinutes: Math.round(overlapMs / 60_000),
        });
      }
    }
  }
  return pairs;
}

/**
 * Likely duplicate: same day, same category, same duration and (when both have
 * times) the same start. Returned as a warning — the student decides.
 */
export function findDuplicateCandidates(candidate: TimelineEntry, existing: TimelineEntry[]): TimelineEntry[] {
  return existing.filter(
    (entry) =>
      entry.id !== candidate.id &&
      entry.date === candidate.date &&
      entry.category === candidate.category &&
      entry.minutes === candidate.minutes &&
      (candidate.startedAt === null || entry.startedAt === null || entry.startedAt === candidate.startedAt),
  );
}

export interface DayPlan {
  date: DateOnly;
  weekday: number;
  plannedMinutes: number;
  actualStudyMinutes: number;
  deltaMinutes: number;
  isRestDay: boolean;
}

/**
 * Planned versus actual for a week. Rest days (0 planned minutes) are labelled
 * as rest, never as a missed goal.
 */
export function plannedVsActual(
  studyWindows: Record<string, number> | null,
  weekDates: DateOnly[],
  entries: TimelineEntry[],
): DayPlan[] {
  return weekDates.map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const plannedMinutes = Math.max(0, Math.round(studyWindows?.[String(weekday)] ?? 0));
    const actualStudyMinutes = entries
      .filter((entry) => entry.kind === 'study' && entry.date === date)
      .reduce((sum, entry) => sum + entry.minutes, 0);
    return {
      date,
      weekday,
      plannedMinutes,
      actualStudyMinutes,
      deltaMinutes: actualStudyMinutes - plannedMinutes,
      isRestDay: plannedMinutes === 0,
    };
  });
}

export type TimerWarning = 'clock_skew' | 'clamped_to_max' | 'no_elapsed_time';

export interface TimerResult {
  minutes: number;
  seconds: number;
  warnings: TimerWarning[];
}

/**
 * Convert a timer's start/stop wall-clock times into minutes.
 *
 * Wall-clock timestamps are used instead of counting ticks, so a backgrounded
 * tab or a sleeping phone does not lose time. That also means a device clock
 * change can produce nonsense, which is clamped and reported rather than
 * silently accepted.
 */
export function timerResult(startedAt: Timestamp, now: Timestamp, maxMinutes = 180): TimerResult {
  const start = new Date(startedAt).getTime();
  const end = new Date(now).getTime();
  const warnings: TimerWarning[] = [];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { minutes: 0, seconds: 0, warnings: ['clock_skew'] };
  }
  const rawSeconds = Math.floor((end - start) / 1000);
  let seconds = rawSeconds;
  if (rawSeconds < 60) {
    return { minutes: 1, seconds: rawSeconds, warnings: ['no_elapsed_time'] };
  }
  if (rawSeconds > maxMinutes * 60) {
    seconds = maxMinutes * 60;
    warnings.push('clamped_to_max');
  }
  return { minutes: Math.max(1, Math.round(seconds / 60)), seconds, warnings };
}

export interface DaySummary {
  date: DateOnly;
  headline: string;
  details: string[];
  studyMinutes: number;
  otherMinutes: number;
  hasAnyRecord: boolean;
}

/** Plain-language end-of-day summary. Never shames a day with no records. */
export function endOfDaySummary(date: DateOnly, entries: TimelineEntry[]): DaySummary {
  const summary = summarizeTime(entries);
  if (entries.length === 0) {
    return {
      date,
      headline: 'Nothing recorded for this day.',
      details: ['No records is missing information, not proof that nothing happened.'],
      studyMinutes: 0,
      otherMinutes: 0,
      hasAnyRecord: false,
    };
  }
  const details: string[] = [];
  if (summary.bySubject.length > 0) {
    details.push(
      `Study by subject: ${summary.bySubject
        .map((s) => `${s.subjectName} ${formatMinutes(s.minutes)}`)
        .join(', ')}.`,
    );
  }
  const blocks = summary.byCategory.filter((c) => !['reading', 'notes', 'practice', 'test'].includes(c.category));
  if (blocks.length > 0) {
    details.push(
      `Other time: ${blocks
        .slice(0, 4)
        .map((c) => `${c.label} ${formatMinutes(c.minutes)}`)
        .join(', ')}.`,
    );
  }
  const overlaps = findOverlaps(entries);
  if (overlaps.length > 0) {
    details.push(`${overlaps.length} overlapping timed entries — totals may count the same minutes twice.`);
  }
  return {
    date,
    headline: `${formatMinutes(summary.studyMinutes)} study · ${formatMinutes(summary.otherMinutes)} other recorded`,
    details,
    studyMinutes: summary.studyMinutes,
    otherMinutes: summary.otherMinutes,
    hasAnyRecord: true,
  };
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export interface WeekTimeTotals {
  studyMinutes: number;
  otherMinutes: number;
  activeDays: number;
  averageStudyMinutesPerActiveDay: number | null;
  previousStudyMinutes: number | null;
  changeMinutes: number | null;
}

/** Weekly totals with an honest comparison (null when there is no baseline). */
export function weekTotals(
  entries: TimelineEntry[],
  weekStart: DateOnly,
  weekEnd: DateOnly,
  previousEntries: TimelineEntry[] = [],
): WeekTimeTotals {
  const inRange = (date: DateOnly) => date >= weekStart && date <= weekEnd;
  const current = entries.filter((e) => inRange(e.date));
  const summary = summarizeTime(current);
  const activeDays = new Set(current.filter((e) => e.kind === 'study').map((e) => e.date)).size;
  const previousStudy = previousEntries
    .filter((e) => e.kind === 'study' && diffDaysISO(e.date, weekStart) > 0)
    .reduce((sum, e) => sum + e.minutes, 0);
  const hasPrevious = previousEntries.some((e) => e.kind === 'study');
  return {
    studyMinutes: summary.studyMinutes,
    otherMinutes: summary.otherMinutes,
    activeDays,
    averageStudyMinutesPerActiveDay:
      activeDays > 0 ? Math.round(summary.studyMinutes / activeDays) : null,
    previousStudyMinutes: hasPrevious ? previousStudy : null,
    changeMinutes: hasPrevious ? summary.studyMinutes - previousStudy : null,
  };
}
