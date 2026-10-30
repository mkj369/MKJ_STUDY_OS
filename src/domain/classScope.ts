/**
 * One place that decides which records belong to the active class.
 *
 * Screens read `view.subjects`, which is already class-scoped, so subject lists
 * and pickers agree. Aggregates were the gap: a weekly report built from the raw
 * bundle counted a Class 9 session in a Class 11 week. Rather than invent a
 * second set of numbers, the bundle itself is narrowed once, here, and the same
 * report code runs on the narrowed view.
 *
 * The rule is deliberately conservative:
 *   * a record linked to a subject of another class is excluded;
 *   * a record with no subject at all (a walk, a sleep block, a general note) is
 *     kept, because it belongs to no class and hiding it would understate study
 *     time the student really did;
 *   * `activeClass === null` keeps everything.
 *
 * Nothing is deleted or rewritten — this is a read-time projection.
 */

import { isClassLevel, type ClassLevel } from '@/domain/classLevels';
import type { UserDataBundle } from '@/services/repository';
import type { UserSubject } from '@/types/domain';

function subjectIsVisible(subject: UserSubject | undefined, activeClass: ClassLevel | null): boolean {
  if (!subject) return true; // unknown subject id: not ours to hide
  if (activeClass === null) return true;
  return (subject.class_level ?? null) === activeClass;
}

export function scopeBundleToClass(bundle: UserDataBundle, activeClass: ClassLevel | null): UserDataBundle {
  const level = isClassLevel(activeClass) ? activeClass : null;
  if (level === null) return bundle;

  const subjects = bundle.subjects.filter((subject) => subject.status === 'active' && subjectIsVisible(subject, level));
  const visibleSubjectIds = new Set(subjects.map((subject) => subject.id));
  const visibleChapterIds = new Set(
    bundle.chapters.filter((chapter) => visibleSubjectIds.has(chapter.user_subject_id)).map((chapter) => chapter.id),
  );
  const visibleItemIds = new Set(
    bundle.checklistItems.filter((item) => visibleChapterIds.has(item.user_chapter_id)).map((item) => item.id),
  );

  const keepBySubject = <T extends { user_subject_id: string | null }>(rows: T[]): T[] =>
    rows.filter((row) => row.user_subject_id === null || visibleSubjectIds.has(row.user_subject_id));
  const keepByChapter = <T extends { user_chapter_id: string | null }>(rows: T[]): T[] =>
    rows.filter((row) => row.user_chapter_id === null || visibleChapterIds.has(row.user_chapter_id));

  const visibleQuestions = keepByChapter(keepBySubject(bundle.practiceQuestions));
  const visibleQuestionIds = new Set(visibleQuestions.map((question) => question.id));

  return {
    ...bundle,
    practiceQuestions: visibleQuestions,
    practiceAttempts: bundle.practiceAttempts.filter((attempt) => visibleQuestionIds.has(attempt.practice_question_id)),
    subjects,
    chapters: bundle.chapters.filter((chapter) => visibleChapterIds.has(chapter.id)),
    checklistItems: bundle.checklistItems.filter((item) => visibleItemIds.has(item.id)),
    checklistProgress: bundle.checklistProgress.filter((progress) => visibleItemIds.has(progress.checklist_item_id)),
    lectures: keepByChapter(keepBySubject(bundle.lectures)),
    sessions: keepByChapter(keepBySubject(bundle.sessions)),
    revisions: keepByChapter(keepBySubject(bundle.revisions)),
    difficulties: keepByChapter(keepBySubject(bundle.difficulties)),
    mistakes: keepByChapter(keepBySubject(bundle.mistakes)),
    tasks: keepByChapter(keepBySubject(bundle.tasks)),
    exams: keepBySubject(bundle.exams),
    resources: keepByChapter(keepBySubject(bundle.resources)),
    notes: keepByChapter(keepBySubject(bundle.notes)),
    topics: bundle.topics.filter((topic) => visibleChapterIds.has(topic.user_chapter_id)),
  };
}
