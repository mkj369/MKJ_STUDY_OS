import { describe, expect, it } from 'vitest';
import { buildWeeklyReport, type WeeklyReportInput } from '@/domain/reports';
import { weekRange } from '@/domain/dates';
import {
  makeChapter,
  makeChecklistItem,
  makeProgress,
  makeSession,
  makeSubject,
  TODAY,
} from '../fixtures/factories';
import type { CurriculumChapter, CurriculumSubject } from '@/types/domain';

/**
 * Regression: the weekly report used to print the literal word "Chapter" for
 * every chapter imported from the curriculum.
 *
 * Imported chapters store their name on `curriculum_chapters.title`, not on
 * `user_chapters.custom_title`, and the report only looked at the latter. Two
 * chapters then produced identical gap labels, which also produced duplicate
 * React keys ("Encountered two children with the same key").
 */

const { start } = weekRange(TODAY);

function curriculumChapter(id: string, title: string, subjectId = 'cs-1'): CurriculumChapter {
  return {
    id,
    curriculum_subject_id: subjectId,
    chapter_number: '1',
    title,
    sort_order: 1,
    verification_status: 'needs_verification',
    is_demo: true,
    created_at: `${TODAY}T00:00:00.000Z`,
  } as CurriculumChapter;
}

function curriculumSubject(id: string, name: string): CurriculumSubject {
  return {
    id,
    curriculum_version_id: 'cv-1',
    name,
    name_bn: null,
    code: null,
    paper_label: null,
    is_compulsory: true,
    sort_order: 1,
    created_at: `${TODAY}T00:00:00.000Z`,
  } as CurriculumSubject;
}

/**
 * Two imported chapters under one subject, both with an unticked practice item,
 * which is exactly the condition that emitted "Practice not ticked — Chapter"
 * twice in the browser.
 */
function inputWithTwoImportedChapters(overrides: Partial<WeeklyReportInput> = {}): WeeklyReportInput {
  const subject = makeSubject({ id: 'sub-1', custom_name: null, curriculum_subject_id: 'cs-1' });
  const chapterA = makeChapter({
    id: 'ch-a',
    user_subject_id: 'sub-1',
    custom_title: null,
    curriculum_chapter_id: 'cc-a',
  });
  const chapterB = makeChapter({
    id: 'ch-b',
    user_subject_id: 'sub-1',
    custom_title: null,
    curriculum_chapter_id: 'cc-b',
  });
  const itemA = makeChecklistItem({ id: 'item-a', user_chapter_id: 'ch-a', kind: 'practice', label: 'Practice' });
  const itemB = makeChecklistItem({ id: 'item-b', user_chapter_id: 'ch-b', kind: 'practice', label: 'Practice' });

  return {
    weekStart: start,
    today: TODAY,
    subjects: [subject],
    chapters: [chapterA, chapterB],
    curriculumChapters: [
      curriculumChapter('cc-a', 'Mechanics'),
      curriculumChapter('cc-b', 'Atomic Structure'),
    ],
    curriculumSubjects: [curriculumSubject('cs-1', 'Physics')],
    checklistItems: [itemA, itemB],
    // Unticked on purpose: that is what triggers both the gap and the
    // suggested-practice recommendation.
    checklistProgress: [
      makeProgress({ checklist_item_id: 'item-a', is_done: false, completed_at: null }),
      makeProgress({ checklist_item_id: 'item-b', is_done: false, completed_at: null }),
    ],
    lectures: [],
    // A recorded session makes the chapter "has records", which is the
    // precondition for the practice-gap recommendation.
    sessions: [
      makeSession({
        id: 's-1',
        user_subject_id: 'sub-1',
        user_chapter_id: 'ch-a',
        activity_type: 'concept_review',
      }),
      makeSession({
        id: 's-2',
        user_subject_id: 'sub-1',
        user_chapter_id: 'ch-b',
        activity_type: 'reading',
      }),
    ],
    revisions: [],
    difficulties: [],
    mistakes: [],
    tasks: [],
    exams: [],
    generatedAt: `${TODAY}T12:00:00.000Z`,
    ...overrides,
  };
}

describe('weekly report chapter titles', () => {
  it('uses the curriculum chapter name instead of the word "Chapter"', () => {
    const { payload } = buildWeeklyReport(inputWithTwoImportedChapters());

    const labels = payload.possible_gaps.map((gap) => gap.label);
    expect(labels.some((label) => label.includes('Mechanics'))).toBe(true);
    expect(labels.some((label) => label.includes('Atomic Structure'))).toBe(true);
    // The old behaviour: "Practice not ticked — Chapter".
    expect(labels.filter((label) => /— Chapter$/.test(label))).toEqual([]);
  });

  it('resolves the subject name in suggested practice tasks', () => {
    const { payload } = buildWeeklyReport(inputWithTwoImportedChapters());
    const practiceTask = payload.suggested_tasks.find((task) => task.key.startsWith('practice:'));
    expect(practiceTask?.reason).toContain('Physics');
    expect(practiceTask?.reason).not.toContain('for Subject.');
  });

  it('gives every gap a unique key even when labels differ only by chapter', () => {
    const { payload } = buildWeeklyReport(inputWithTwoImportedChapters());
    const keys = payload.possible_gaps.map((gap) => gap.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('chapter:ch-a:practice_unchecked');
    expect(keys).toContain('chapter:ch-b:practice_unchecked');
  });

  it('keeps keys unique across recommendations and suggested tasks', () => {
    const { payload } = buildWeeklyReport(inputWithTwoImportedChapters());
    const recKeys = payload.recommendations.map((item) => item.key);
    const taskKeys = payload.suggested_tasks.map((item) => item.key);
    expect(new Set(recKeys).size).toBe(recKeys.length);
    expect(new Set(taskKeys).size).toBe(taskKeys.length);
    for (const key of [...recKeys, ...taskKeys]) expect(key).toBeTruthy();
  });

  it('still prefers a custom title the student typed themselves', () => {
    const input = inputWithTwoImportedChapters();
    input.chapters = input.chapters.map((chapter) =>
      chapter.id === 'ch-a' ? { ...chapter, custom_title: 'My own name' } : chapter,
    );

    const { payload } = buildWeeklyReport(input);
    expect(payload.possible_gaps.some((gap) => gap.label.includes('My own name'))).toBe(true);
    expect(payload.possible_gaps.some((gap) => gap.label.includes('Mechanics'))).toBe(false);
  });

  it('does not crash when the curriculum chapters are not supplied', () => {
    const input = inputWithTwoImportedChapters();
    delete (input as Partial<WeeklyReportInput>).curriculumChapters;
    delete (input as Partial<WeeklyReportInput>).curriculumSubjects;

    const { payload } = buildWeeklyReport(input);
    // Falls back to a neutral, honest label rather than inventing a name.
    expect(payload.possible_gaps.length).toBeGreaterThan(0);
    expect(new Set(payload.possible_gaps.map((gap) => gap.key)).size).toBe(
      payload.possible_gaps.map((gap) => gap.key).length,
    );
  });
});
