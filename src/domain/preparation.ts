/**
 * Exam countdown and preparation planning.
 *
 * The module reports:
 *  - days remaining (from an explicit `today`),
 *  - outstanding syllabus work, upcoming revisions, unresolved weak areas,
 *  - a realistic draft plan that fits the student's stated availability.
 *
 * It never predicts marks, grades, ranks or "chances". Any number it prints is a
 * count of records or a capacity calculation, and the payload says so.
 */
import { addDaysISO, diffDaysISO } from '@/domain/dates';
import { safePercent } from '@/domain/progress';
import type {
  ExamTarget,
  MistakeLog,
  RevisionSession,
  StudySession,
  TopicDifficulty,
  UserChapter,
  UserTopic,
} from '@/types/domain';

export type CountdownUrgency = 'past' | 'today' | 'this_week' | 'soon' | 'later';

export interface ExamCountdown {
  targetId: string;
  title: string;
  examDate: string;
  daysRemaining: number;
  urgency: CountdownUrgency;
  label: string;
  isPast: boolean;
}

export function countdownFor(target: Pick<ExamTarget, 'id' | 'title' | 'exam_date'>, today: string): ExamCountdown {
  const daysRemaining = diffDaysISO(today, target.exam_date);
  const urgency: CountdownUrgency =
    daysRemaining < 0 ? 'past' : daysRemaining === 0 ? 'today' : daysRemaining <= 7 ? 'this_week' : daysRemaining <= 30 ? 'soon' : 'later';
  const label =
    daysRemaining < 0
      ? `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago`
      : daysRemaining === 0
        ? 'Today'
        : daysRemaining === 1
          ? 'Tomorrow'
          : `${daysRemaining} days left`;
  return {
    targetId: target.id,
    title: target.title,
    examDate: target.exam_date,
    daysRemaining,
    urgency,
    label,
    isPast: daysRemaining < 0,
  };
}

export interface OutstandingChapter {
  chapterId: string;
  title: string;
  status: string;
  topicsRemaining: number;
  reasons: string[];
}

export interface WeakArea {
  key: string;
  title: string;
  kind: 'difficulty' | 'mistake' | 'topic';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface PreparationInput {
  target: ExamTarget;
  today: string;
  chapters: { chapter: UserChapter; title: string; status: string; topics: UserTopic[] }[];
  revisions: RevisionSession[];
  difficulties: TopicDifficulty[];
  mistakes: MistakeLog[];
  sessions: StudySession[];
  availability: Record<string, number> | null;
  chapterMinutes?: Record<string, number>;
}

export interface SuggestedPreparationTask {
  date: string;
  title: string;
  minutes: number;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  chapterId: string | null;
  kind: 'syllabus' | 'revision' | 'weak_area';
}

export interface PreparationPlan {
  countdown: ExamCountdown;
  subjectId: string | null;
  outstanding: OutstandingChapter[];
  outstandingCount: number;
  topicsRemaining: number;
  upcomingRevisions: { chapterId: string; title: string; dueDate: string; daysUntilDue: number }[];
  weakAreas: WeakArea[];
  practiceMinutes: number;
  draft: SuggestedPreparationTask[];
  draftMinutes: number;
  capacityMinutes: number;
  coveragePercent: number | null;
  warnings: string[];
  disclaimer: string;
}

/**
 * Build a preparation view and a draft plan.
 *
 * The draft only fills days between today and the exam (or the next 7 days when
 * the exam is further away), capped by the student's daily availability. Nothing
 * is persisted here: the UI shows the draft and the student accepts it.
 */
export function buildPreparationPlan(input: PreparationInput): PreparationPlan {
  const { target, today } = input;
  const countdown = countdownFor(target, today);
  const scopedChapters = input.chapters.filter(
    (entry) => !target.user_subject_id || entry.chapter.user_subject_id === target.user_subject_id,
  );

  const outstanding: OutstandingChapter[] = [];
  for (const entry of scopedChapters) {
    if (entry.status === 'complete' && entry.topics.every((topic) => topic.status === 'complete')) continue;
    const topicsRemaining = entry.topics.filter((topic) => topic.status !== 'complete').length;
    const reasons: string[] = [];
    if (entry.status !== 'complete') reasons.push(`Chapter status: ${entry.status.replace(/_/g, ' ')}`);
    if (topicsRemaining > 0) reasons.push(`${topicsRemaining} topic${topicsRemaining === 1 ? '' : 's'} not complete`);
    outstanding.push({
      chapterId: entry.chapter.id,
      title: entry.title,
      status: entry.status,
      topicsRemaining,
      reasons,
    });
  }

  const chapterIds = new Set(scopedChapters.map((entry) => entry.chapter.id));
  const chapterTitle = new Map(scopedChapters.map((entry) => [entry.chapter.id, entry.title]));

  const upcomingRevisions = input.revisions
    .filter((revision) => revision.user_chapter_id && chapterIds.has(revision.user_chapter_id) && revision.next_review_date)
    .map((revision) => ({
      chapterId: revision.user_chapter_id as string,
      title: chapterTitle.get(revision.user_chapter_id as string) ?? 'Chapter',
      dueDate: revision.next_review_date as string,
      daysUntilDue: diffDaysISO(today, revision.next_review_date as string),
    }))
    .filter((item) => item.daysUntilDue <= 14)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 8);

  const weakAreas: WeakArea[] = [];
  for (const difficulty of input.difficulties) {
    if (difficulty.status === 'resolved') continue;
    if (difficulty.user_chapter_id && !chapterIds.has(difficulty.user_chapter_id)) continue;
    weakAreas.push({
      key: `difficulty:${difficulty.id}`,
      title: difficulty.topic_name,
      kind: 'difficulty',
      severity: difficulty.severity,
      detail: difficulty.reason ?? 'Logged as a difficult topic.',
    });
  }
  for (const mistake of input.mistakes) {
    if (mistake.is_resolved) continue;
    if (mistake.user_chapter_id && !chapterIds.has(mistake.user_chapter_id)) continue;
    weakAreas.push({
      key: `mistake:${mistake.id}`,
      title: mistake.lesson_learned ?? mistake.what_went_wrong,
      kind: 'mistake',
      severity: 'medium',
      detail: `${mistake.category.replace(/_/g, ' ')} on ${mistake.occurred_at}`,
    });
  }
  for (const entry of scopedChapters) {
    for (const topic of entry.topics) {
      if (topic.status === 'needs_revision') {
        weakAreas.push({
          key: `topic:${topic.id}`,
          title: topic.custom_title ?? 'Topic',
          kind: 'topic',
          severity: 'medium',
          detail: `Marked “needs revision” in ${entry.title}.`,
        });
      }
    }
  }
  weakAreas.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

  const practiceMinutes = input.sessions
    .filter((session) => ['practice', 'mcq', 'written', 'board_questions', 'admission_questions', 'test'].includes(session.activity_type))
    .filter((session) => !target.user_subject_id || session.user_subject_id === target.user_subject_id)
    .reduce((sum, session) => sum + session.duration_minutes, 0);

  const coveragePercent =
    scopedChapters.length > 0
      ? safePercent(
          scopedChapters.filter((entry) => entry.status === 'complete').length,
          scopedChapters.length,
        )
      : null;

  const warnings: string[] = [];
  if (countdown.isPast) warnings.push('This exam date has already passed. Update the date to plan for the next one.');
  if (!target.user_subject_id) warnings.push('No subject selected: the plan covers every subject you track.');
  if (scopedChapters.length === 0) warnings.push('No chapters recorded for this exam yet.');
  if (!input.availability || Object.values(input.availability).every((minutes) => minutes <= 0)) {
    warnings.push('No study availability entered, so the draft cannot be sized to your week.');
  }

  const days = Math.max(0, Math.min(countdown.daysRemaining, 7));
  const dates: string[] = [];
  for (let i = 0; i < days; i += 1) dates.push(addDaysISO(today, i));
  const capacityForDate = (date: string) =>
    Math.max(0, Math.round(input.availability?.[String(new Date(`${date}T00:00:00Z`).getUTCDay())] ?? 0));

  const candidates: Omit<SuggestedPreparationTask, 'date' | 'minutes'>[] = [];
  for (const revision of upcomingRevisions.slice(0, 3)) {
    candidates.push({
      title: `Revise ${revision.title}`,
      priority: revision.daysUntilDue <= 0 ? 'high' : 'medium',
      reason: revision.daysUntilDue <= 0 ? 'Revision date reached.' : `Revision due in ${revision.daysUntilDue} day(s).`,
      chapterId: revision.chapterId,
      kind: 'revision',
    });
  }
  for (const area of weakAreas.slice(0, 3)) {
    candidates.push({
      title: `Work on ${area.title.slice(0, 80)}`,
      priority: area.severity === 'high' ? 'high' : 'medium',
      reason: area.detail.slice(0, 160),
      chapterId: null,
      kind: 'weak_area',
    });
  }
  for (const chapter of outstanding.slice(0, 5)) {
    candidates.push({
      title: `Continue ${chapter.title}`,
      priority: chapter.status === 'not_recorded' ? 'medium' : 'high',
      reason: chapter.reasons.join('; ') || 'Chapter is not complete.',
      chapterId: chapter.chapterId,
      kind: 'syllabus',
    });
  }

  const draft: SuggestedPreparationTask[] = [];
  let index = 0;
  for (const date of dates) {
    let remaining = capacityForDate(date);
    while (remaining >= 15 && index < candidates.length) {
      const candidate = candidates[index] as Omit<SuggestedPreparationTask, 'date' | 'minutes'>;
      const minutes = Math.min(remaining, candidate.kind === 'revision' ? 30 : 45);
      draft.push({ ...candidate, date, minutes });
      remaining -= minutes;
      index += 1;
    }
    if (index >= candidates.length) break;
  }

  if (draft.length === 0 && candidates.length > 0) {
    warnings.push('Not enough availability before this exam to schedule the remaining work. Reduce scope or add study time.');
  }
  if (index < candidates.length) {
    warnings.push(
      `${candidates.length - index} suggested step${candidates.length - index === 1 ? '' : 's'} do not fit before the exam; the plan keeps them visible instead of silently dropping them.`,
    );
  }

  return {
    countdown,
    subjectId: target.user_subject_id,
    outstanding,
    outstandingCount: outstanding.length,
    topicsRemaining: outstanding.reduce((sum, chapter) => sum + chapter.topicsRemaining, 0),
    upcomingRevisions,
    weakAreas,
    practiceMinutes,
    draft,
    draftMinutes: draft.reduce((sum, task) => sum + task.minutes, 0),
    capacityMinutes: dates.reduce((sum, date) => sum + capacityForDate(date), 0),
    coveragePercent,
    warnings,
    disclaimer:
      'A plan built from your records and stated availability. It is not a prediction of marks, rank or outcome.',
  };
}

function severityWeight(severity: WeakArea['severity']): number {
  return severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
}
