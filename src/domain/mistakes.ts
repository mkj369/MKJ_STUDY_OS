/**
 * Mistake book analysis.
 *
 * Recurring errors are only reported when the records support it: the same
 * category on the same chapter, on at least two different dates. One mistake is
 * never called a "pattern".
 */
import type { CurriculumChapter, DateOnly, MistakeCategory, MistakeLog, UserChapter } from '@/types/domain';
import { safePercent } from '@/domain/progress';
import { chapterDisplayTitle } from '@/features/shared/selectors';

export const MISTAKE_CATEGORY_LABELS: Record<MistakeCategory, string> = {
  concept_gap: 'Concept gap',
  formula_recall: 'Formula recall',
  calculation: 'Calculation',
  careless_error: 'Careless error',
  time_management: 'Time management',
  question_interpretation: 'Question interpretation',
  incomplete_answer: 'Incomplete answer',
  other: 'Other',
};

export interface MistakeCategoryCount {
  category: MistakeCategory;
  label: string;
  count: number;
  unresolved: number;
}

export interface RecurringMistake {
  key: string;
  category: MistakeCategory;
  categoryLabel: string;
  chapterId: string | null;
  chapterTitle: string | null;
  count: number;
  distinctDates: number;
  unresolved: number;
  latestDate: DateOnly;
  evidence: string[];
  lesson: string | null;
}

export interface MistakeAnalysis {
  total: number;
  unresolved: number;
  resolved: number;
  resolvedPercent: number | null;
  byCategory: MistakeCategoryCount[];
  recurring: RecurringMistake[];
  /** Chapters with unresolved mistakes, most recent first. */
  weakChapters: { chapterId: string | null; chapterTitle: string; unresolved: number }[];
  lessons: { lesson: string; date: DateOnly }[];
}

/**
 * `chapters` should be the user's chapters, and `curriculumChapters` the
 * curriculum rows they point at. Without the second argument every chapter that
 * came from the curriculum (which has `custom_title = null`) would resolve to
 * the literal word "Chapter" — the same bug that made the weekly report label
 * every row "— Chapter".
 */
export function analyzeMistakes(
  mistakes: MistakeLog[],
  chapters: Pick<UserChapter, 'id' | 'custom_title' | 'curriculum_chapter_id'>[] = [],
  curriculumChapters: Pick<CurriculumChapter, 'id' | 'title'>[] = [],
): MistakeAnalysis {
  const curriculumById = new Map(curriculumChapters.map((c) => [c.id, c]));
  const chapterTitles = new Map(
    chapters.map((c) => [
      c.id,
      chapterDisplayTitle(
        c as UserChapter,
        c.curriculum_chapter_id ? (curriculumById.get(c.curriculum_chapter_id) as CurriculumChapter) ?? null : null,
      ),
    ]),
  );
  const unresolved = mistakes.filter((m) => !m.is_resolved).length;
  const byCategory: MistakeCategoryCount[] = (Object.keys(MISTAKE_CATEGORY_LABELS) as MistakeCategory[])
    .map((category) => ({
      category,
      label: MISTAKE_CATEGORY_LABELS[category],
      count: mistakes.filter((m) => m.category === category).length,
      unresolved: mistakes.filter((m) => m.category === category && !m.is_resolved).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const groups = new Map<string, MistakeLog[]>();
  for (const mistake of mistakes) {
    const key = `${mistake.user_chapter_id ?? 'no-chapter'}::${mistake.category}`;
    const list = groups.get(key) ?? [];
    list.push(mistake);
    groups.set(key, list);
  }

  const recurring: RecurringMistake[] = [];
  for (const [key, group] of groups) {
    const dates = [...new Set(group.map((m) => m.occurred_at))];
    if (group.length < 2 || dates.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    const latest = sorted[0] as MistakeLog;
    const chapterId = latest.user_chapter_id;
    recurring.push({
      key,
      category: latest.category,
      categoryLabel: MISTAKE_CATEGORY_LABELS[latest.category],
      chapterId,
      chapterTitle: chapterId ? chapterTitles.get(chapterId) ?? 'Chapter' : null,
      count: group.length,
      distinctDates: dates.length,
      unresolved: group.filter((m) => !m.is_resolved).length,
      latestDate: latest.occurred_at,
      evidence: sorted.slice(0, 3).map((m) => `${m.occurred_at}: ${m.what_went_wrong}`),
      lesson: sorted.find((m) => m.lesson_learned)?.lesson_learned ?? null,
    });
  }
  recurring.sort((a, b) => b.unresolved - a.unresolved || b.count - a.count || a.categoryLabel.localeCompare(b.categoryLabel));

  const weakMap = new Map<string, { chapterId: string | null; chapterTitle: string; unresolved: number; latest: string }>();
  for (const mistake of mistakes.filter((m) => !m.is_resolved)) {
    const key = mistake.user_chapter_id ?? 'none';
    const entry = weakMap.get(key) ?? {
      chapterId: mistake.user_chapter_id,
      chapterTitle: mistake.user_chapter_id ? chapterTitles.get(mistake.user_chapter_id) ?? 'Chapter' : 'Unassigned chapter',
      unresolved: 0,
      latest: mistake.occurred_at,
    };
    entry.unresolved += 1;
    if (mistake.occurred_at > entry.latest) entry.latest = mistake.occurred_at;
    weakMap.set(key, entry);
  }
  const weakChapters = [...weakMap.values()]
    .sort((a, b) => b.unresolved - a.unresolved || (a.latest < b.latest ? 1 : -1))
    .map(({ chapterId, chapterTitle, unresolved: count }) => ({ chapterId, chapterTitle, unresolved: count }));

  const lessons = mistakes
    .filter((m) => m.lesson_learned)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    .slice(0, 5)
    .map((m) => ({ lesson: m.lesson_learned as string, date: m.occurred_at }));

  return {
    total: mistakes.length,
    unresolved,
    resolved: mistakes.length - unresolved,
    resolvedPercent: safePercent(mistakes.length - unresolved, mistakes.length),
    byCategory,
    recurring,
    weakChapters,
    lessons,
  };
}

/** Revision/practice suggestions derived from recurring errors only. */
export interface MistakeFollowUp {
  title: string;
  why: string;
  evidence: string[];
  chapterId: string | null;
  category: MistakeCategory;
  priority: 'medium' | 'high';
}

export function buildMistakeFollowUps(analysis: MistakeAnalysis, limit = 3): MistakeFollowUp[] {
  return analysis.recurring
    .filter((group) => group.unresolved > 0)
    .slice(0, limit)
    .map((group) => ({
      title: `Revisit ${group.chapterTitle ?? 'unassigned mistakes'}: ${group.categoryLabel.toLowerCase()}`,
      why: `${group.count} recorded mistakes with this category across ${group.distinctDates} different days — the records support a pattern here.`,
      evidence: group.evidence,
      chapterId: group.chapterId,
      category: group.category,
      priority: group.unresolved >= 2 ? 'high' : 'medium',
    }));
}
