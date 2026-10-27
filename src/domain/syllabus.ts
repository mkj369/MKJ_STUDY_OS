/**
 * Syllabus tracking: chapters → topics → independent activity evidence.
 *
 * The tracker answers "what is covered?" without pretending to answer "will I
 * pass?". Completion percentages always carry their denominator, and an
 * estimate of remaining effort is only produced when the student's own records
 * provide the inputs for it.
 */
import type {
  ChapterChecklistItem,
  ChapterChecklistProgress,
  ChecklistKind,
  DateOnly,
  LectureRecord,
  RevisionSession,
  StudySession,
  TopicStatus,
  UserChapter,
  UserTopic,
} from '@/types/domain';
import { safePercent } from '@/domain/progress';

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  not_recorded: 'Not recorded',
  in_progress: 'In progress',
  needs_revision: 'Needs revision',
  complete: 'Complete',
};

export interface TopicProgress {
  total: number;
  complete: number;
  inProgress: number;
  needsRevision: number;
  notRecorded: number;
  percent: number | null;
}

export function computeTopicProgress(topics: Pick<UserTopic, 'status'>[]): TopicProgress {
  const count = (status: TopicStatus) => topics.filter((t) => t.status === status).length;
  const complete = count('complete');
  return {
    total: topics.length,
    complete,
    inProgress: count('in_progress'),
    needsRevision: count('needs_revision'),
    notRecorded: count('not_recorded'),
    percent: safePercent(complete, topics.length),
  };
}

export interface ActivityEvidence {
  key: string;
  label: string;
  /** Where the number came from, shown to the student. */
  source: 'checklist' | 'lectures' | 'revisions' | 'sessions';
  done: number;
  total: number | null;
  percent: number | null;
  hasRecord: boolean;
}

/** The 11 activity types the specification asks to track independently. */
export const SYLLABUS_ACTIVITIES: { key: string; label: string; kind: ChecklistKind | null }[] = [
  { key: 'reading', label: 'Book reading', kind: 'reading' },
  { key: 'lectures', label: 'Lectures / classes', kind: 'lecture' },
  { key: 'notes', label: 'Notes', kind: 'notes_review' },
  { key: 'formula', label: 'Formula sheet / concept book', kind: 'concept_book' },
  { key: 'practice', label: 'Practice', kind: 'practice' },
  { key: 'board', label: 'Board questions', kind: 'board_questions' },
  { key: 'admission', label: 'Admission questions', kind: 'admission_questions' },
  { key: 'mcq', label: 'MCQs', kind: 'mcq' },
  { key: 'written', label: 'Written questions', kind: 'written' },
  { key: 'revision', label: 'Revision', kind: null },
  { key: 'self_test', label: 'Self test', kind: 'self_test' },
];

export interface ActivityMatrixInput {
  checklist: { item: ChapterChecklistItem; progress: ChapterChecklistProgress | null }[];
  lectures: LectureRecord[];
  revisions: RevisionSession[];
  sessions: StudySession[];
  /** Lecture target the student set, if any. */
  lectureTarget?: number | null;
}

/**
 * Build one row per activity. Each row states its own evidence:
 *  - checklist-backed activities: ticked / active items;
 *  - lectures: completed / target (or completed with no denominator);
 *  - revision: recorded revision count, with no denominator invented.
 */
export function buildActivityMatrix(input: ActivityMatrixInput): ActivityEvidence[] {
  return SYLLABUS_ACTIVITIES.map((activity) => {
    if (activity.key === 'lectures') {
      const completed = input.lectures.filter((l) => l.is_completed).length;
      const target = input.lectureTarget && input.lectureTarget > 0 ? input.lectureTarget : null;
      return {
        key: activity.key,
        label: activity.label,
        source: 'lectures',
        done: completed,
        total: target,
        percent: target ? safePercent(completed, target) : null,
        hasRecord: input.lectures.length > 0,
      };
    }
    if (activity.key === 'revision') {
      const count = input.revisions.length;
      return {
        key: activity.key,
        label: activity.label,
        source: 'revisions',
        done: count,
        total: null,
        percent: null,
        hasRecord: count > 0,
      };
    }
    const items = input.checklist.filter((entry) => !entry.item.is_archived && entry.item.kind === activity.kind);
    const done = items.filter((entry) => entry.progress?.is_done === true).length;
    const hasSessionEvidence =
      activity.key === 'practice' &&
      input.sessions.some((s) => s.activity_type === 'practice' && s.duration_minutes > 0);
    return {
      key: activity.key,
      label: activity.label,
      source: 'checklist',
      done: hasSessionEvidence ? Math.max(done, 1) : done,
      total: items.length,
      percent: items.length > 0 ? safePercent(done, items.length) : null,
      hasRecord: items.length > 0 || hasSessionEvidence,
    };
  });
}

export interface ChapterCoverage {
  chapterId: string;
  title: string;
  topic: TopicProgress;
  activities: ActivityEvidence[];
  activitiesTracked: number;
  activitiesComplete: number;
  /** Percent of the 11 activity types that have any record at all. */
  activityPercent: number | null;
  checklistPercent: number | null;
}

export function buildChapterCoverage(input: {
  chapter: UserChapter;
  title: string;
  topics: UserTopic[];
  checklist: { item: ChapterChecklistItem; progress: ChapterChecklistProgress | null }[];
  lectures: LectureRecord[];
  revisions: RevisionSession[];
  sessions: StudySession[];
}): ChapterCoverage {
  const activities = buildActivityMatrix({
    checklist: input.checklist,
    lectures: input.lectures,
    revisions: input.revisions,
    sessions: input.sessions,
    lectureTarget: input.chapter.lecture_target_count,
  });
  // An activity with no checklist items is "not tracked", not "complete".
  const completedActivities = activities.filter((activity) =>
    activity.total !== null && activity.total > 0 ? activity.done >= activity.total : activity.done > 0,
  ).length;
  const tracked = activities.filter((activity) => activity.hasRecord || activity.done > 0).length;
  const checklistItems = input.checklist.filter((entry) => !entry.item.is_archived);
  const checklistDone = checklistItems.filter((entry) => entry.progress?.is_done === true).length;
  return {
    chapterId: input.chapter.id,
    title: input.title,
    topic: computeTopicProgress(input.topics),
    activities,
    activitiesTracked: tracked,
    activitiesComplete: completedActivities,
    activityPercent: safePercent(completedActivities, activities.length),
    checklistPercent: checklistItems.length > 0 ? safePercent(checklistDone, checklistItems.length) : null,
  };
}

export interface SubjectCoverage {
  subjectId: string;
  chapters: number;
  chaptersComplete: number;
  chaptersStarted: number;
  chaptersNotRecorded: number;
  chapterPercent: number | null;
  topics: number;
  topicsComplete: number;
  topicPercent: number | null;
  /** Average of chapter activity coverage, ignoring chapters with no records. */
  activityPercent: number | null;
}

export function computeSubjectCoverage(input: {
  subjectId: string;
  chapterCoverages: (ChapterCoverage & { status: string })[];
}): SubjectCoverage {
  const chapters = input.chapterCoverages;
  const complete = chapters.filter((c) => c.status === 'complete').length;
  const notRecorded = chapters.filter((c) => c.status === 'not_recorded').length;
  const started = chapters.length - notRecorded;
  const topics = chapters.reduce((sum, c) => sum + c.topic.total, 0);
  const topicsComplete = chapters.reduce((sum, c) => sum + c.topic.complete, 0);
  const activityValues = chapters
    .filter((c) => c.activitiesTracked > 0)
    .map((c) => c.activityPercent)
    .filter((value): value is number => value !== null);
  return {
    subjectId: input.subjectId,
    chapters: chapters.length,
    chaptersComplete: complete,
    chaptersStarted: started,
    chaptersNotRecorded: notRecorded,
    chapterPercent: safePercent(complete, chapters.length),
    topics,
    topicsComplete,
    topicPercent: topics > 0 ? safePercent(topicsComplete, topics) : null,
    activityPercent:
      activityValues.length > 0
        ? Math.round(activityValues.reduce((a, b) => a + b, 0) / activityValues.length)
        : null,
  };
}

export interface CompletionEstimate {
  /** Why an estimate could or could not be produced. */
  status: 'estimated' | 'insufficient_data' | 'no_remaining_work' | 'no_availability';
  weeks: number | null;
  rangeWeeks: { low: number; high: number } | null;
  remainingWorkMinutes: number | null;
  weeklyCapacityMinutes: number;
  assumptions: string[];
  message: string;
}

/**
 * Estimate remaining weeks from *the student's own pace*, never from an
 * invented syllabus size.
 *
 * Inputs: chapters still open, minutes recorded per completed chapter, and the
 * weekly availability the student entered. Requires at least two completed
 * chapters and a positive weekly capacity; otherwise it explains what is
 * missing instead of guessing.
 */
export function estimateCompletion(input: {
  chaptersRemaining: number;
  completedChapterMinutes: number[];
  weeklyCapacityMinutes: number;
  defaultChapterMinutes?: number;
}): CompletionEstimate {
  const assumptions: string[] = [];
  if (input.chaptersRemaining <= 0) {
    return {
      status: 'no_remaining_work',
      weeks: null,
      rangeWeeks: null,
      remainingWorkMinutes: 0,
      weeklyCapacityMinutes: input.weeklyCapacityMinutes,
      assumptions: [],
      message: 'Every chapter is marked complete. Keep revising to keep it that way.',
    };
  }
  const samples = input.completedChapterMinutes.filter((m) => m > 0);
  let perChapter = input.defaultChapterMinutes ?? null;
  if (samples.length >= 2) {
    perChapter = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    assumptions.push(
      `Based on your own recorded time for ${samples.length} completed chapters (about ${perChapter} minutes each).`,
    );
  } else if (perChapter !== null) {
    assumptions.push(`No reliable pace yet, so a ${perChapter}-minute-per-chapter planning figure is used.`);
  }
  if (perChapter === null) {
    return {
      status: 'insufficient_data',
      weeks: null,
      rangeWeeks: null,
      remainingWorkMinutes: null,
      weeklyCapacityMinutes: input.weeklyCapacityMinutes,
      assumptions,
      message:
        'Not enough recorded study time to estimate a finish date. Complete a couple of chapters and log the time; the estimate then uses your real pace.',
    };
  }
  if (input.weeklyCapacityMinutes <= 0) {
    return {
      status: 'no_availability',
      weeks: null,
      rangeWeeks: null,
      remainingWorkMinutes: input.chaptersRemaining * perChapter,
      weeklyCapacityMinutes: 0,
      assumptions,
      message: 'Add your weekly study availability to turn remaining work into a date estimate.',
    };
  }
  const remainingWorkMinutes = input.chaptersRemaining * perChapter;
  const weeks = Math.ceil(remainingWorkMinutes / input.weeklyCapacityMinutes);
  assumptions.push(`${input.chaptersRemaining} chapters remain; ${input.weeklyCapacityMinutes} minutes per week of availability.`);
  assumptions.push('Revision and practice are not included; this is a floor, not a promise.');
  return {
    status: 'estimated',
    weeks,
    rangeWeeks: { low: Math.max(1, Math.ceil(weeks * 0.75)), high: Math.max(1, Math.ceil(weeks * 1.5)) },
    remainingWorkMinutes,
    weeklyCapacityMinutes: input.weeklyCapacityMinutes,
    assumptions,
    message: `Roughly ${Math.max(1, Math.ceil(weeks * 0.75))}–${Math.max(1, Math.ceil(weeks * 1.5))} weeks at your current pace and availability.`,
  };
}

export interface SyllabusFilter {
  classGrade?: string;
  stream?: string;
  versionId?: string;
  subjectName?: string;
  onlyIncomplete?: boolean;
}

/** Filters are applied to the reference data, never to the student's records. */
export function matchesVersionFilter(
  version: { id: string; class_grade: string; stream: string | null; academic_year: string },
  filter: SyllabusFilter,
): boolean {
  if (filter.versionId && version.id !== filter.versionId) return false;
  if (filter.classGrade && version.class_grade !== filter.classGrade) return false;
  if (filter.stream && (version.stream ?? '') !== filter.stream) return false;
  return true;
}

export function remainingChapterTitles(
  coverages: { title: string; status: string }[],
  limit = 5,
): string[] {
  return coverages
    .filter((c) => c.status !== 'complete')
    .map((c) => c.title)
    .slice(0, limit);
}

/** Weeks remaining until an exam date, counted from an explicit `today`. */
export function weeksUntil(examDate: DateOnly, today: DateOnly): number | null {
  const exam = new Date(`${examDate}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(exam) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.ceil((exam - now) / (7 * 86_400_000)));
}
