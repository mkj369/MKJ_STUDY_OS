/**
 * Deterministic progress engine.
 *
 * Pure functions only: no database, no AI, no clock reads. Everything is
 * derived from records the student actually entered plus an explicit `today`.
 * Every number carries its denominator so the UI can explain itself, and
 * "not recorded" is always distinct from "not studied".
 *
 * Rules are documented in docs/PROGRESS_RULES.md and covered by tests.
 */
import { addDaysISO, diffDaysISO, todayISO } from '@/domain/dates';
import type {
  ChapterChecklistItem,
  ChapterChecklistProgress,
  ChapterStatus,
  ChecklistKind,
  DateOnly,
  DifficultySeverity,
  ExamResult,
  LectureRecord,
  MistakeLog,
  RevisionSession,
  StudySession,
  StudyTask,
  TopicDifficulty,
  UserChapter,
} from '@/types/domain';

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                               */
/* -------------------------------------------------------------------------- */

export interface Counted {
  done: number;
  total: number;
  /** `null` when there is no denominator — never silently 0%. */
  percent: number | null;
}

export interface GapFlag {
  code: GapCode;
  /** Whether this is missing information or an evidenced concern. */
  kind: 'missing_data' | 'evidence';
  label: string;
  reason: string;
  severity: 'info' | 'attention' | 'high';
}

export type GapCode =
  | 'checklist_incomplete'
  | 'practice_unchecked'
  | 'difficulty_open'
  | 'mistakes_unresolved'
  | 'revision_overdue'
  | 'revision_stale'
  | 'lecture_target_unmet'
  | 'low_exam_result'
  | 'overdue_task'
  | 'stale_activity'
  | 'checklist_without_evidence'
  | 'no_records';

export const DEFAULT_RECENT_DAYS = 14;
export const DEFAULT_STALE_DAYS = 21;
export const REVISION_STALE_DAYS = 21;
export const LOW_EXAM_PERCENT = 50;
export const STRONG_EXAM_PERCENT = 80;

const STATUS_LABELS: Record<ChapterStatus, string> = {
  not_recorded: 'Not recorded',
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_practice: 'Needs practice',
  needs_revision: 'Needs revision',
  blocked: 'Blocked',
  complete: 'Complete',
};

export function chapterStatusLabel(status: ChapterStatus): string {
  return STATUS_LABELS[status];
}

export function safePercent(numerator: number, denominator: number, decimals = 0): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const raw = (numerator / denominator) * 100;
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/* -------------------------------------------------------------------------- */
/* Individual calculators                                                      */
/* -------------------------------------------------------------------------- */

export interface ChecklistEntry {
  item: ChapterChecklistItem;
  progress: ChapterChecklistProgress | null;
}

/** Checklist completion. Denominator = number of active checklist items. */
export function computeChecklistSummary(entries: ChecklistEntry[]): Counted & {
  doneKinds: ChecklistKind[];
  pendingKinds: ChecklistKind[];
  customLabels: string[];
} {
  const active = entries.filter((e) => !e.item.is_archived);
  const done = active.filter((e) => e.progress?.is_done === true);
  const pending = active.filter((e) => e.progress?.is_done !== true);
  return {
    done: done.length,
    total: active.length,
    percent: safePercent(done.length, active.length),
    doneKinds: done.map((e) => e.item.kind),
    pendingKinds: pending.map((e) => e.item.kind),
    customLabels: active.filter((e) => e.item.kind === 'custom').map((e) => e.item.label),
  };
}

export interface LectureProgress {
  logged: number;
  completed: number;
  target: number | null;
  /** Only computed when a target exists (both parts of the fraction known). */
  percent: number | null;
  remaining: number | null;
  label: string;
}

export function computeLectureProgress(lectures: LectureRecord[], target: number | null): LectureProgress {
  const logged = lectures.length;
  const completed = lectures.filter((l) => l.is_completed).length;
  if (target === null || target <= 0) {
    return {
      logged,
      completed,
      target: null,
      percent: null,
      remaining: null,
      label: `${completed} lecture${completed === 1 ? '' : 's'} completed · no target set`,
    };
  }
  const remaining = Math.max(0, target - completed);
  return {
    logged,
    completed,
    target,
    percent: safePercent(completed, target),
    remaining,
    label: `${completed} of ${target} lectures completed`,
  };
}

export type RevisionDueState = 'none' | 'not_due' | 'due_today' | 'overdue';

export interface RevisionSummary {
  count: number;
  lastDate: DateOnly | null;
  nextDate: DateOnly | null;
  nextDateSource: 'recorded' | 'suggested' | 'none';
  dueState: RevisionDueState;
  daysUntilNext: number | null;
  lastConfidence: number | null;
  /** Days since the last revision (null when never revised). */
  daysSinceLast: number | null;
}

/**
 * Transparent baseline spacing schedule. Confidence is the student's own recall
 * rating (1 = could not recall, 5 = effortless). No hidden model, no guessing:
 * a low confidence rating brings the next review sooner.
 */
export function suggestNextReviewDate(revisedAt: DateOnly, confidence: number): DateOnly {
  const clamped = Math.min(5, Math.max(1, Math.round(confidence)));
  const intervalDays = clamped <= 2 ? 1 : clamped === 3 ? 3 : clamped === 4 ? 7 : 14;
  return addDaysISO(revisedAt, intervalDays);
}

export function computeRevisionSummary(revisions: RevisionSession[], today: DateOnly = todayISO()): RevisionSummary {
  if (revisions.length === 0) {
    return {
      count: 0,
      lastDate: null,
      nextDate: null,
      nextDateSource: 'none',
      dueState: 'none',
      daysUntilNext: null,
      lastConfidence: null,
      daysSinceLast: null,
    };
  }
  const sorted = [...revisions].sort((a, b) => (a.revised_at < b.revised_at ? 1 : a.revised_at > b.revised_at ? -1 : 0));
  const latest = sorted[0] as RevisionSession;
  const recordedNext = sorted
    .map((r) => r.next_review_date)
    .filter((d): d is DateOnly => typeof d === 'string' && d.length === 10)
    .sort()[0];
  const nextDate = recordedNext ?? suggestNextReviewDate(latest.revised_at, latest.confidence_rating);
  const daysUntilNext = diffDaysISO(today, nextDate);
  const dueState: RevisionDueState = daysUntilNext < 0 ? 'overdue' : daysUntilNext === 0 ? 'due_today' : 'not_due';
  return {
    count: revisions.length,
    lastDate: latest.revised_at,
    nextDate,
    nextDateSource: recordedNext ? 'recorded' : 'suggested',
    dueState,
    daysUntilNext,
    lastConfidence: latest.confidence_rating,
    daysSinceLast: diffDaysISO(latest.revised_at, today),
  };
}

/** Exam percentage. Returns null when marks are invalid rather than dividing by 0. */
export function examPercent(exam: Pick<ExamResult, 'marks_obtained' | 'total_marks'>): number | null {
  return safePercent(exam.marks_obtained, exam.total_marks, 1);
}

export interface ExamSummary {
  count: number;
  averagePercent: number | null;
  latestPercent: number | null;
  latestDate: DateOnly | null;
  bestPercent: number | null;
  trend: 'improving' | 'declining' | 'flat' | 'unknown';
}

export function computeExamSummary(exams: ExamResult[]): ExamSummary {
  const scored = exams
    .map((e) => ({ exam: e, percent: examPercent(e) }))
    .filter((e): e is { exam: ExamResult; percent: number } => e.percent !== null)
    .sort((a, b) => (a.exam.exam_date < b.exam.exam_date ? 1 : a.exam.exam_date > b.exam.exam_date ? -1 : 0));
  if (scored.length === 0) {
    return { count: 0, averagePercent: null, latestPercent: null, latestDate: null, bestPercent: null, trend: 'unknown' };
  }
  const percents = scored.map((s) => s.percent);
  const average = Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10;
  const first = scored[0] as { exam: ExamResult; percent: number };
  const previous = scored[1];
  const delta = previous ? Math.round((first.percent - previous.percent) * 10) / 10 : 0;
  const trend: ExamSummary['trend'] =
    !previous ? 'unknown' : delta >= 5 ? 'improving' : delta <= -5 ? 'declining' : 'flat';
  return {
    count: scored.length,
    averagePercent: average,
    latestPercent: first.percent,
    latestDate: first.exam.exam_date,
    bestPercent: Math.max(...percents),
    trend,
  };
}

/* -------------------------------------------------------------------------- */
/* Chapter                                                                    */
/* -------------------------------------------------------------------------- */

export interface ChapterContext {
  chapter: UserChapter;
  checklist: ChecklistEntry[];
  lectures: LectureRecord[];
  sessions: StudySession[];
  revisions: RevisionSession[];
  difficulties: TopicDifficulty[];
  mistakes: MistakeLog[];
  tasks: StudyTask[];
  exams: ExamResult[];
}

export interface ChapterProgress {
  chapterId: string;
  checklist: ReturnType<typeof computeChecklistSummary>;
  lectures: LectureProgress;
  revisions: RevisionSummary;
  practiceSessions: number;
  lastPracticeDate: DateOnly | null;
  openDifficulties: number;
  resolvedDifficulties: number;
  highestOpenSeverity: DifficultySeverity | null;
  unresolvedMistakes: number;
  exams: ExamSummary;
  openTasks: number;
  overdueTasks: number;
  lastActivityDate: DateOnly | null;
  /** Status label the student explicitly chose, if any. */
  declaredStatus: ChapterStatus;
  /** Status the engine derives from the records. */
  derivedStatus: ChapterStatus;
  /** What the UI should present: the declared label wins, otherwise derived. */
  status: ChapterStatus;
  statusExplanation: string;
  flags: GapFlag[];
  isFullyChecklisted: boolean;
  hasAnyRecord: boolean;
}

const ACTIVITY_ACTIVITY_MINUTES = 1;

function maxDate(values: (DateOnly | null | undefined)[]): DateOnly | null {
  const present = values.filter((v): v is DateOnly => typeof v === 'string' && v.length === 10);
  if (present.length === 0) return null;
  return present.sort()[present.length - 1] as DateOnly;
}

export interface ChapterProgressOptions {
  today?: DateOnly;
  staleDays?: number;
}

export function computeChapterProgress(ctx: ChapterContext, options: ChapterProgressOptions = {}): ChapterProgress {
  const today = options.today ?? todayISO();
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const { chapter } = ctx;

  const checklist = computeChecklistSummary(ctx.checklist);
  const lectures = computeLectureProgress(ctx.lectures, chapter.lecture_target_count);
  const revisions = computeRevisionSummary(ctx.revisions, today);
  const exams = computeExamSummary(ctx.exams);

  const practiceKinds: ChecklistKind[] = ['practice', 'board_questions', 'admission_questions', 'mcq', 'written'];
  const practiceChecklistDone = checklist.doneKinds.some((k) => practiceKinds.includes(k));
  const practiceSessions = ctx.sessions.filter(
    (s) => ['practice', 'board_questions', 'admission_questions', 'mcq', 'written', 'test'].includes(s.activity_type) && s.duration_minutes > 0,
  ).length;
  const lastPracticeDate = maxDate(ctx.sessions.map((s) => s.session_date));
  const hasPracticeEvidence = practiceSessions >= ACTIVITY_ACTIVITY_MINUTES || practiceChecklistDone;

  const openDifficulties = ctx.difficulties.filter((d) => d.status !== 'resolved');
  const highestOpenSeverity = rankSeverity(openDifficulties.map((d) => d.severity));
  const resolvedDifficulties = ctx.difficulties.length - openDifficulties.length;
  const unresolvedMistakes = ctx.mistakes.filter((m) => !m.is_resolved).length;
  const openTasks = ctx.tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress').length;
  const overdueTasks = ctx.tasks.filter(
    (t) => (t.status === 'todo' || t.status === 'in_progress') && t.due_date !== null && t.due_date < today,
  ).length;

  const lastActivityDate = maxDate([
    ...ctx.lectures.map((l) => l.lecture_date),
    ...ctx.sessions.map((s) => s.session_date),
    ...ctx.revisions.map((r) => r.revised_at),
    ...ctx.difficulties.map((d) => d.created_at.slice(0, 10)),
    ...ctx.mistakes.map((m) => m.occurred_at),
    ...ctx.exams.map((e) => e.exam_date),
  ]);

  const hasAnyRecord =
    ctx.lectures.length > 0 ||
    ctx.sessions.length > 0 ||
    ctx.revisions.length > 0 ||
    ctx.difficulties.length > 0 ||
    ctx.mistakes.length > 0 ||
    ctx.exams.length > 0 ||
    checklist.done > 0;

  const declaredStatus = chapter.status;
  const derivedStatus = deriveChapterStatus({
    today,
    staleDays,
    declaredStatus,
    checklist,
    lecturesTarget: chapter.lecture_target_count,
    hasAnyRecord,
    openDifficulties: openDifficulties.length,
    highestOpenSeverity,
    unresolvedMistakes,
    practiceCheckedButNoEvidence: practiceChecklistDone && practiceSessions === 0,
    revisions,
    exams,
    lastActivityDate,
  });

  const flags = buildChapterFlags({
    today,
    staleDays,
    checklist,
    lectureTarget: chapter.lecture_target_count,
    lecturesCompleted: lectures.completed,
    practiceChecklistDone,
    practiceSessions,
    openDifficulties,
    highestOpenSeverity,
    unresolvedMistakes,
    revisions,
    exams,
    overdueTasks,
    lastActivityDate,
    hasAnyRecord,
  });

  const status = declaredStatus !== 'not_recorded' ? declaredStatus : derivedStatus;
  return {
    chapterId: chapter.id,
    checklist,
    lectures,
    revisions,
    practiceSessions,
    lastPracticeDate,
    openDifficulties: openDifficulties.length,
    resolvedDifficulties,
    highestOpenSeverity,
    unresolvedMistakes,
    exams,
    openTasks,
    overdueTasks,
    lastActivityDate,
    declaredStatus,
    derivedStatus,
    status,
    statusExplanation: explainStatus(status, declaredStatus, derivedStatus),
    flags,
    isFullyChecklisted: checklist.total > 0 && checklist.done === checklist.total,
    hasAnyRecord: hasAnyRecord || hasPracticeEvidence,
  };
}

function rankSeverity(values: DifficultySeverity[]): DifficultySeverity | null {
  const order: DifficultySeverity[] = ['high', 'medium', 'low'];
  for (const candidate of order) if (values.includes(candidate)) return candidate;
  return null;
}

interface DeriveStatusInput {
  today: DateOnly;
  staleDays: number;
  declaredStatus: ChapterStatus;
  checklist: ReturnType<typeof computeChecklistSummary>;
  lecturesTarget: number | null;
  hasAnyRecord: boolean;
  openDifficulties: number;
  highestOpenSeverity: DifficultySeverity | null;
  unresolvedMistakes: number;
  practiceCheckedButNoEvidence: boolean;
  revisions: RevisionSummary;
  exams: ExamSummary;
  lastActivityDate: DateOnly | null;
}

/**
 * Derivation order (documented, deterministic):
 * 1. A student's explicit "blocked" or "complete" label is respected first —
 *    the app never overrides a deliberate human statement.
 * 2. Evidenced mastery: 100% checklist AND a recent exam ≥ 80% AND no open
 *    difficulty/mistake. Checklist ticks alone are NOT enough.
 * 3. No records at all → "not recorded" (never "not studied").
 * 4. Explicit "not started" with no records → "not started".
 * 5. Open difficulty / unresolved mistakes / practice ticked with no practice
 *    on record → "needs practice".
 * 6. Revision overdue or revision history older than the stale window →
 *    "needs revision".
 * 7. Otherwise "in progress".
 */
export function deriveChapterStatus(input: DeriveStatusInput): ChapterStatus {
  if (input.declaredStatus === 'blocked') return 'blocked';
  if (input.declaredStatus === 'complete') return 'complete';
  const evidencedMastery =
    input.checklist.total > 0 &&
    input.checklist.done === input.checklist.total &&
    (input.exams.latestPercent ?? 0) >= STRONG_EXAM_PERCENT &&
    input.openDifficulties === 0 &&
    input.unresolvedMistakes === 0;
  if (evidencedMastery) return 'complete';
  if (!input.hasAnyRecord && input.checklist.done === 0) {
    return input.declaredStatus === 'not_started' ? 'not_started' : 'not_recorded';
  }
  if (
    input.openDifficulties > 0 ||
    input.unresolvedMistakes > 0 ||
    input.practiceCheckedButNoEvidence
  ) {
    return 'needs_practice';
  }
  if (input.revisions.dueState === 'overdue') return 'needs_revision';
  if (
    input.revisions.lastDate !== null &&
    input.revisions.daysSinceLast !== null &&
    input.revisions.daysSinceLast > REVISION_STALE_DAYS
  ) {
    return 'needs_revision';
  }
  return 'in_progress';
}

function explainStatus(status: ChapterStatus, declared: ChapterStatus, derived: ChapterStatus): string {
  if (declared !== 'not_recorded' && declared !== derived) {
    return `You set this chapter to “${STATUS_LABELS[declared]}”. Recorded evidence would suggest “${STATUS_LABELS[derived]}”.`;
  }
  switch (status) {
    case 'not_recorded':
      return 'No study records for this chapter yet. That does not mean it is unstudied — add a lecture, session or revision to start tracking.';
    case 'not_started':
      return 'You marked this chapter as not started.';
    case 'in_progress':
      return 'Work is recorded and no blocking gap is flagged.';
    case 'needs_practice':
      return 'Practice evidence is missing or a difficulty/mistake is still open.';
    case 'needs_revision':
      return 'The next revision date has passed or the last revision is getting old.';
    case 'blocked':
      return 'You marked this chapter as blocked.';
    case 'complete':
      return declared === 'complete'
        ? 'You marked this chapter complete.'
        : 'Checklist complete plus a strong recorded test result, with no open difficulties.';
  }
}

interface FlagInput {
  today: DateOnly;
  staleDays: number;
  checklist: ReturnType<typeof computeChecklistSummary>;
  lectureTarget: number | null;
  lecturesCompleted: number;
  practiceChecklistDone: boolean;
  practiceSessions: number;
  openDifficulties: TopicDifficulty[];
  highestOpenSeverity: DifficultySeverity | null;
  unresolvedMistakes: number;
  revisions: RevisionSummary;
  exams: ExamSummary;
  overdueTasks: number;
  lastActivityDate: DateOnly | null;
  hasAnyRecord: boolean;
}

function buildChapterFlags(input: FlagInput): GapFlag[] {
  const flags: GapFlag[] = [];
  if (!input.hasAnyRecord) {
    flags.push({
      code: 'no_records',
      kind: 'missing_data',
      label: 'No records yet',
      reason: 'Nothing is recorded for this chapter. Missing data is not proof that nothing was studied.',
      severity: 'info',
    });
    return flags;
  }
  if (input.practiceChecklistDone && input.practiceSessions === 0) {
    flags.push({
      code: 'practice_unchecked',
      kind: 'evidence',
      label: 'Practice ticked, no practice logged',
      reason: 'The practice checklist item is marked done but no practice session is recorded. Log the session or untick the box.',
      severity: 'attention',
    });
  } else if (!input.practiceChecklistDone && input.checklist.total > 0) {
    flags.push({
      code: 'practice_unchecked',
      kind: 'missing_data',
      label: 'Practice not ticked',
      reason: `Practice is still unticked (${input.checklist.done}/${input.checklist.total} checklist items done).`,
      severity: 'attention',
    });
  }
  if (input.openDifficulties.length > 0) {
    flags.push({
      code: 'difficulty_open',
      kind: 'evidence',
      label: `${input.openDifficulties.length} open difficult topic${input.openDifficulties.length === 1 ? '' : 's'}`,
      reason: `You logged: ${input.openDifficulties
        .slice(0, 3)
        .map((d) => d.topic_name)
        .join(', ')}${input.openDifficulties.length > 3 ? '…' : ''}.`,
      severity: input.highestOpenSeverity === 'high' ? 'high' : 'attention',
    });
  }
  if (input.unresolvedMistakes > 0) {
    flags.push({
      code: 'mistakes_unresolved',
      kind: 'evidence',
      label: `${input.unresolvedMistakes} unresolved mistake${input.unresolvedMistakes === 1 ? '' : 's'}`,
      reason: 'Mistakes logged for this chapter have not been marked corrected yet.',
      severity: 'attention',
    });
  }
  if (input.revisions.dueState === 'overdue') {
    flags.push({
      code: 'revision_overdue',
      kind: 'evidence',
      label: 'Revision overdue',
      reason: `Next review was due ${input.revisions.nextDate}${
        input.revisions.nextDateSource === 'suggested' ? ' (suggested from your confidence rating)' : ''
      }.`,
      severity: 'high',
    });
  } else if (input.revisions.daysSinceLast !== null && input.revisions.daysSinceLast > REVISION_STALE_DAYS) {
    flags.push({
      code: 'revision_stale',
      kind: 'evidence',
      label: 'Not revised recently',
      reason: `Last recorded revision was ${input.revisions.daysSinceLast} days ago.`,
      severity: 'attention',
    });
  }
  if (input.lectureTarget !== null && input.lecturesCompleted < input.lectureTarget) {
    flags.push({
      code: 'lecture_target_unmet',
      kind: 'evidence',
      label: `Lecture target ${input.lecturesCompleted}/${input.lectureTarget}`,
      reason: 'The lecture target you set is not reached yet.',
      severity: 'info',
    });
  }
  if (input.exams.latestPercent !== null && input.exams.latestPercent < LOW_EXAM_PERCENT) {
    flags.push({
      code: 'low_exam_result',
      kind: 'evidence',
      label: `Latest result ${input.exams.latestPercent}%`,
      reason: 'The most recent recorded exam result is below 50%. This is a recorded result, not a prediction.',
      severity: 'high',
    });
  }
  if (input.overdueTasks > 0) {
    flags.push({
      code: 'overdue_task',
      kind: 'evidence',
      label: `${input.overdueTasks} overdue task${input.overdueTasks === 1 ? '' : 's'}`,
      reason: 'A task linked to this chapter passed its deadline.',
      severity: 'attention',
    });
  }
  if (
    input.lastActivityDate !== null &&
    diffDaysISO(input.lastActivityDate, input.today) > input.staleDays &&
    input.checklist.done < input.checklist.total
  ) {
    flags.push({
      code: 'stale_activity',
      kind: 'missing_data',
      label: 'No recent records',
      reason: `Last recorded activity was ${diffDaysISO(input.lastActivityDate, input.today)} days ago. Nothing recorded since then — not proof of inactivity.`,
      severity: 'info',
    });
  }
  return flags;
}

/* -------------------------------------------------------------------------- */
/* Subject + curriculum overview                                              */
/* -------------------------------------------------------------------------- */

export interface SubjectProgress {
  userSubjectId: string;
  chapterCount: number;
  /** Mean of chapter checklist percentages, ignoring chapters with no checklist. */
  checklistPercent: number | null;
  chaptersComplete: number;
  chaptersNeedingPractice: number;
  chaptersNeedingRevision: number;
  chaptersNotRecorded: number;
  lecturesCompleted: number;
  lectureTargetsKnown: number;
  revisionCount: number;
  nextRevisionDate: DateOnly | null;
  overdueRevisionCount: number;
  openDifficulties: number;
  openTasks: number;
  overdueTasks: number;
  lastActivityDate: DateOnly | null;
  attentionScore: number;
  attentionReasons: string[];
}

export interface SubjectProgressInput {
  userSubjectId: string;
  chapters: ChapterContext[];
  tasks: StudyTask[];
  today?: DateOnly;
}

export function computeSubjectProgress(input: SubjectProgressInput): SubjectProgress {
  const today = input.today ?? todayISO();
  const progresses = input.chapters.map((c) => computeChapterProgress(c, { today }));
  const checklistPercents = progresses
    .map((p) => p.checklist.percent)
    .filter((p): p is number => p !== null);
  const checklistPercent =
    checklistPercents.length > 0
      ? Math.round(checklistPercents.reduce((a, b) => a + b, 0) / checklistPercents.length)
      : null;
  const nextDates = progresses
    .map((p) => p.revisions.nextDate)
    .filter((d): d is DateOnly => d !== null)
    .sort();
  const subjectTasks = input.tasks.filter((t) => t.user_subject_id === input.userSubjectId);
  const openSubjectTasks = subjectTasks.filter((t) => t.status === 'todo' || t.status === 'in_progress');
  const overdue = openSubjectTasks.filter((t) => t.due_date !== null && t.due_date < today);

  const attentionReasons: string[] = [];
  let score = 0;
  const highDifficulties = progresses.filter((p) => p.highestOpenSeverity === 'high').length;
  const openDifficulties = progresses.reduce((sum, p) => sum + p.openDifficulties, 0);
  const overdueRevisions = progresses.filter((p) => p.revisions.dueState === 'overdue').length;
  if (highDifficulties > 0) {
    score += highDifficulties * 4;
    attentionReasons.push(`${highDifficulties} chapter(s) with a high-severity difficulty`);
  }
  if (overdueRevisions > 0) {
    score += overdueRevisions * 3;
    attentionReasons.push(`${overdueRevisions} revision(s) overdue`);
  }
  if (overdue.length > 0) {
    score += overdue.length * 3;
    attentionReasons.push(`${overdue.length} overdue task(s)`);
  }
  const lowResults = progresses.filter((p) => p.exams.latestPercent !== null && p.exams.latestPercent < LOW_EXAM_PERCENT).length;
  if (lowResults > 0) {
    score += lowResults * 2;
    attentionReasons.push(`${lowResults} chapter(s) with a result below 50%`);
  }
  if (openSubjectTasks.length > 0 && overdue.length === 0) {
    score += 1;
    attentionReasons.push(`${openSubjectTasks.length} open task(s)`);
  }
  if (score === 0) attentionReasons.push('No evidence-based gaps flagged');

  const lastActivityDate = progresses
    .map((p) => p.lastActivityDate)
    .filter((d): d is DateOnly => d !== null)
    .sort()
    .at(-1) ?? null;

  return {
    userSubjectId: input.userSubjectId,
    chapterCount: progresses.length,
    checklistPercent,
    chaptersComplete: progresses.filter((p) => p.status === 'complete').length,
    chaptersNeedingPractice: progresses.filter((p) => p.status === 'needs_practice').length,
    chaptersNeedingRevision: progresses.filter((p) => p.status === 'needs_revision').length,
    chaptersNotRecorded: progresses.filter((p) => p.status === 'not_recorded').length,
    lecturesCompleted: progresses.reduce((sum, p) => sum + p.lectures.completed, 0),
    lectureTargetsKnown: progresses.filter((p) => p.lectures.target !== null).length,
    revisionCount: progresses.reduce((sum, p) => sum + p.revisions.count, 0),
    nextRevisionDate: nextDates[0] ?? null,
    overdueRevisionCount: overdueRevisions,
    openDifficulties,
    openTasks: openSubjectTasks.length,
    overdueTasks: overdue.length,
    lastActivityDate,
    attentionScore: score,
    attentionReasons,
  };
}
