/**
 * Smart study suggestions.
 *
 * Suggestions are *proposals*. Nothing is written until the student accepts one,
 * so a suggested plan can never be confused with an accepted plan. Each
 * suggestion names the records that produced it, and the list is capped so the
 * app never dumps twenty "you should" items on someone.
 */
import { diffDaysISO } from '@/domain/dates';
import type { TaskPriority, StudyTask, UserChapter } from '@/types/domain';
import type { RevisionQueueEntry } from '@/domain/revisions';
import type { MistakeAnalysis } from '@/domain/mistakes';

export type SuggestionKind = 'revision' | 'syllabus' | 'exam' | 'weak_area' | 'practice' | 'recovery';

export interface StudySuggestion {
  key: string;
  kind: SuggestionKind;
  title: string;
  reason: string;
  evidence: string[];
  minutes: number;
  priority: TaskPriority;
  chapterId: string | null;
  subjectId: string | null;
  /** True when an open task already exists for this chapter/goal. */
  alreadyPlanned: boolean;
  /** Stable, transparent ordering score. */
  score: number;
}

export interface SuggestionInput {
  today: string;
  chapters: {
    chapter: UserChapter;
    title: string;
    subjectId: string;
    status: string;
    topicsRemaining: number;
    overdueRevision: boolean;
    openDifficulties: number;
    practiceRecorded: boolean;
  }[];
  revisionQueue: RevisionQueueEntry[];
  mistakes: MistakeAnalysis;
  tasks: StudyTask[];
  examTargets: { id: string; title: string; exam_date: string; user_subject_id: string | null }[];
  practiceQueue: { questionId: string; reason: string }[];
  availability: Record<string, number> | null;
  limit?: number;
}

export function buildStudySuggestions(input: SuggestionInput): StudySuggestion[] {
  const suggestions: StudySuggestion[] = [];
  const openTasks = input.tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress');
  const plannedForChapter = (chapterId: string | null) =>
    chapterId !== null && openTasks.some((task) => task.user_chapter_id === chapterId);

  for (const entry of input.revisionQueue.slice(0, 4)) {
    if (entry.bucket !== 'overdue' && entry.bucket !== 'today' && entry.bucket !== 'this_week') continue;
    suggestions.push({
      key: `revision:${entry.userChapterId}:${entry.summary.nextDate}`,
      kind: 'revision',
      title: `Revise ${entry.chapterTitle}`,
      reason:
        entry.bucket === 'overdue'
          ? `The next review date passed ${Math.abs(entry.daysUntilDue)} day(s) ago.`
          : entry.bucket === 'today'
            ? 'A revision is due today.'
            : `A revision is due in ${entry.daysUntilDue} day(s).`,
      evidence: [
        `Subject: ${entry.subjectName}`,
        `Next review: ${entry.summary.nextDate} (${entry.summary.nextDateSource})`,
        `Last confidence: ${entry.summary.lastConfidence ?? 'not recorded'}/5`,
      ],
      minutes: 30,
      priority: entry.bucket === 'overdue' ? 'high' : 'medium',
      chapterId: entry.userChapterId,
      subjectId: entry.userSubjectId,
      alreadyPlanned: plannedForChapter(entry.userChapterId),
      score: entry.bucket === 'overdue' ? 100 : entry.bucket === 'today' ? 90 : 70,
    });
  }

  for (const exam of input.examTargets) {
    const days = diffDaysISO(input.today, exam.exam_date);
    if (days < 0 || days > 45) continue;
    const scoped = input.chapters.filter(
      (chapter) => !exam.user_subject_id || chapter.subjectId === exam.user_subject_id,
    );
    const outstanding = scoped.filter((chapter) => chapter.status !== 'complete');
    if (scoped.length === 0 || outstanding.length === 0) continue;
    suggestions.push({
      key: `exam:${exam.id}`,
      kind: 'exam',
      title: `Prepare for ${exam.title}: ${outstanding.length} chapter${outstanding.length === 1 ? '' : 's'} open`,
      reason: `${days} day(s) until the recorded exam date, with recorded chapters still open.`,
      evidence: [
        `Exam date: ${exam.exam_date}`,
        `Open chapters: ${outstanding.slice(0, 3).map((chapter) => chapter.title).join(', ')}${outstanding.length > 3 ? '…' : ''}`,
      ],
      minutes: 45,
      priority: days <= 7 ? 'high' : 'medium',
      chapterId: outstanding[0]?.chapter.id ?? null,
      subjectId: exam.user_subject_id,
      alreadyPlanned: false,
      score: days <= 7 ? 95 : 60,
    });
  }

  for (const entry of input.chapters) {
    if (entry.status === 'not_recorded') {
      suggestions.push({
        key: `start:${entry.chapter.id}`,
        kind: 'syllabus',
        title: `Start ${entry.title}`,
        reason: 'No records for this chapter yet. A short first session starts the trail.',
        evidence: ['Chapter status: not recorded', 'No lectures, sessions or checklist items completed'],
        minutes: 30,
        priority: 'low',
        chapterId: entry.chapter.id,
        subjectId: entry.subjectId,
        alreadyPlanned: plannedForChapter(entry.chapter.id),
        score: 30,
      });
      continue;
    }
    if (entry.status === 'needs_practice' || entry.openDifficulties > 0) {
      suggestions.push({
        key: `practice:${entry.chapter.id}`,
        kind: 'weak_area',
        title: `Practice ${entry.title}`,
        reason:
          entry.openDifficulties > 0
            ? `${entry.openDifficulties} difficult topic(s) are still open.`
            : 'A practice item is pending or practice evidence is missing.',
        evidence: [
          `Chapter status: ${entry.status.replace(/_/g, ' ')}`,
          ...(entry.openDifficulties > 0 ? [`${entry.openDifficulties} open difficult topic(s) reported by you`] : []),
          entry.practiceRecorded ? 'Some practice is recorded' : 'No practice session recorded',
        ],
        minutes: 40,
        priority: 'high',
        chapterId: entry.chapter.id,
        subjectId: entry.subjectId,
        alreadyPlanned: plannedForChapter(entry.chapter.id),
        score: 80,
      });
    }
    if (entry.topicsRemaining > 0) {
      suggestions.push({
        key: `topics:${entry.chapter.id}`,
        kind: 'syllabus',
        title: `Cover ${entry.topicsRemaining} remaining topic(s) in ${entry.title}`,
        reason: 'Topics in this chapter are not marked complete yet.',
        evidence: [`${entry.topicsRemaining} topic(s) not complete`],
        minutes: 25,
        priority: 'medium',
        chapterId: entry.chapter.id,
        subjectId: entry.subjectId,
        alreadyPlanned: plannedForChapter(entry.chapter.id),
        score: 50,
      });
    }
  }

  for (const recurring of input.mistakes.recurring.filter((group) => group.unresolved > 0).slice(0, 2)) {
    suggestions.push({
      key: `mistake:${recurring.key}`,
      kind: 'weak_area',
      title: `Review recurring ${recurring.categoryLabel.toLowerCase()} mistakes`,
      reason: `${recurring.count} recorded mistakes across ${recurring.distinctDates} days.`,
      evidence: recurring.evidence.slice(0, 2),
      minutes: 25,
      priority: 'medium',
      chapterId: recurring.chapterId,
      subjectId: null,
      alreadyPlanned: plannedForChapter(recurring.chapterId),
      score: 65,
    });
  }

  if (input.practiceQueue.length > 0) {
    suggestions.push({
      key: 'practice_queue',
      kind: 'practice',
      title: `Review ${input.practiceQueue.length} practice question(s)`,
      reason: 'Questions are flagged, answered incorrectly, or have not been attempted yet.',
      evidence: [`${input.practiceQueue.length} question(s) in the practice queue`],
      minutes: 20,
      priority: 'medium',
      chapterId: null,
      subjectId: null,
      alreadyPlanned: false,
      score: 55,
    });
  }

  const hasAvailability = Boolean(
    input.availability && Object.values(input.availability).some((value) => value > 0),
  );
  if (!hasAvailability) {
    return dedupe(suggestions).slice(0, input.limit ?? 8);
  }

  return dedupe(suggestions)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, input.limit ?? 8);
}

function dedupe(suggestions: StudySuggestion[]): StudySuggestion[] {
  const seen = new Set<string>();
  const result: StudySuggestion[] = [];
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.key)) continue;
    seen.add(suggestion.key);
    result.push(suggestion);
  }
  return result;
}

/** Convert an accepted suggestion into the task payload. Only call on accept. */
export function suggestionToTask(
  suggestion: StudySuggestion,
  today: string,
): {
  title: string;
  description: string;
  user_subject_id: string | null;
  user_chapter_id: string | null;
  estimated_minutes: number;
  priority: TaskPriority;
  status: 'todo';
  due_date: string;
  planned_date: string;
  origin: 'rule';
  gap_reason: string;
  is_demo: false;
} {
  return {
    title: suggestion.title.slice(0, 140),
    description: `Suggested because: ${suggestion.reason}`,
    user_subject_id: suggestion.subjectId,
    user_chapter_id: suggestion.chapterId,
    estimated_minutes: Math.min(720, Math.max(5, suggestion.minutes)),
    priority: suggestion.priority,
    status: 'todo',
    due_date: today,
    planned_date: today,
    origin: 'rule',
    gap_reason: suggestion.evidence.join(' · ').slice(0, 500),
    is_demo: false,
  };
}

export interface RecoverySuggestion {
  message: string;
  keepCount: number;
  deferCount: number;
  keep: StudyTask[];
  defer: StudyTask[];
  hasOverdue: boolean;
}

/**
 * Recovery after missed goals: keep what is realistic, carry the rest forward,
 * and never use blame language. This never mutates tasks.
 */
export function buildRecoverySuggestion(
  tasks: StudyTask[],
  today: string,
  capacityMinutes: number,
): RecoverySuggestion {
  const open = tasks
    .filter((task) => task.status === 'todo' || task.status === 'in_progress')
    .sort((a, b) => {
      const overdueA = a.due_date !== null && a.due_date < today ? 0 : 1;
      const overdueB = b.due_date !== null && b.due_date < today ? 0 : 1;
      if (overdueA !== overdueB) return overdueA - overdueB;
      const weight = { high: 3, medium: 2, low: 1 } as const;
      return weight[b.priority] - weight[a.priority] || a.estimated_minutes - b.estimated_minutes;
    });
  const keep: StudyTask[] = [];
  const defer: StudyTask[] = [];
  let used = 0;
  for (const task of open) {
    if (keep.length < 3 && used + task.estimated_minutes <= capacityMinutes) {
      keep.push(task);
      used += task.estimated_minutes;
    } else {
      defer.push(task);
    }
  }
  const hasOverdue = open.some((task) => task.due_date !== null && task.due_date < today);
  return {
    keep,
    defer,
    keepCount: keep.length,
    deferCount: defer.length,
    hasOverdue,
    message:
      open.length === 0
        ? 'Nothing is open right now. Rest is part of the plan.'
        : `A smaller plan you finish beats a long one you abandon: keep ${keep.length}, carry ${defer.length} forward. Nothing is deleted.`,
  };
}
