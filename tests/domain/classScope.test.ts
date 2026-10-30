import { describe, expect, it } from 'vitest';
import { scopeBundleToClass } from '@/domain/classScope';
import type { UserDataBundle } from '@/services/repository';

const EMPTY_CURRICULUM = {
  versions: [],
  subjects: [],
  chapters: [],
  topics: [],
  sources: [],
  requirements: [],
};

/**
 * A deliberately small bundle: two subjects in two classes, one chapter each,
 * and one record of every kind per subject. Only the fields the projection
 * touches are populated, which is what makes it a readable fixture.
 */
function bundleWithTwoClasses(): UserDataBundle {
  const base = {
    status: 'active' as const,
    color: '#38BDF8',
    sort_order: 1,
    is_demo: false,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    custom_name: 'Subject',
    custom_paper_label: null,
    curriculum_subject_id: null,
    curriculum_version_id: null,
    name_bn: null,
  };
  return {
    subjects: [
      { ...base, id: 'sub-9', class_level: 9 },
      { ...base, id: 'sub-11', class_level: 11 },
    ],
    chapters: [
      { id: 'ch-9', user_subject_id: 'sub-9', custom_title: 'Nine', status: 'in_progress', is_demo: false },
      { id: 'ch-11', user_subject_id: 'sub-11', custom_title: 'Eleven', status: 'in_progress', is_demo: false },
    ],
    checklistItems: [],
    checklistProgress: [],
    lectures: [],
    sessions: [
      { id: 's-9', user_subject_id: 'sub-9', user_chapter_id: 'ch-9', duration_minutes: 60, session_date: '2026-10-28' },
      { id: 's-11', user_subject_id: 'sub-11', user_chapter_id: 'ch-11', duration_minutes: 30, session_date: '2026-10-28' },
      // No subject: a walk or a sleep block belongs to no class and must survive.
      { id: 's-none', user_subject_id: null, user_chapter_id: null, duration_minutes: 45, session_date: '2026-10-28' },
    ],
    dailyBlocks: [],
    focusSessions: [],
    examTargets: [],
    practiceQuestions: [
      { id: 'q-9', user_subject_id: 'sub-9', user_chapter_id: 'ch-9' },
      { id: 'q-11', user_subject_id: 'sub-11', user_chapter_id: 'ch-11' },
    ],
    practiceAttempts: [
      { id: 'a-9', practice_question_id: 'q-9' },
      { id: 'a-11', practice_question_id: 'q-11' },
    ],
    topics: [],
    revisions: [],
    difficulties: [],
    mistakes: [],
    tasks: [
      { id: 't-9', user_subject_id: 'sub-9', user_chapter_id: null, title: 'Nine task', status: 'todo' },
      { id: 't-none', user_subject_id: null, user_chapter_id: null, title: 'General task', status: 'todo' },
    ],
    exams: [],
    resources: [],
    notes: [],
    summaries: [],
    curriculum: EMPTY_CURRICULUM,
    profile: { active_class: 11 },
    reminderPreferences: {},
    reminderEvents: [],
  } as unknown as UserDataBundle;
}

describe('scopeBundleToClass', () => {
  it('narrows every subject-linked record to the active class', () => {
    const scoped = scopeBundleToClass(bundleWithTwoClasses(), 11);
    expect(scoped.subjects.map((subject) => subject.id)).toEqual(['sub-11']);
    expect(scoped.chapters.map((chapter) => chapter.id)).toEqual(['ch-11']);
    expect(scoped.sessions.map((session) => session.id).sort()).toEqual(['s-11', 's-none']);
    // The Class 9 task is out; the task with no subject stays for every class.
    expect(scoped.tasks.map((task) => task.id)).toEqual(['t-none']);
  });

  it('narrows practice questions and the attempts that depend on them', () => {
    /*
     * Attempts have no subject column: they point at a question. Scoping the
     * questions without the attempts would leave a Class 9 accuracy rate on a
     * Class 11 practice screen.
     */
    const scoped = scopeBundleToClass(bundleWithTwoClasses(), 11);
    expect(scoped.practiceQuestions.map((question) => question.id)).toEqual(['q-11']);
    expect(scoped.practiceAttempts.map((attempt) => attempt.id)).toEqual(['a-11']);
  });

  it('keeps records that belong to no class', () => {
    const scoped = scopeBundleToClass(bundleWithTwoClasses(), 9);
    const general = scoped.sessions.find((session) => session.id === 's-none');
    expect(general?.duration_minutes).toBe(45);
    expect(scoped.tasks.some((task) => task.id === 't-none')).toBe(true);
    // …while the Class 11 task is gone from the Class 9 projection.
    expect(scoped.tasks.some((task) => task.id === 't-9')).toBe(true);
  });

  it('changes nothing when no class is chosen', () => {
    const bundle = bundleWithTwoClasses();
    const scoped = scopeBundleToClass(bundle, null);
    expect(scoped).toBe(bundle);
  });

  it('never mutates the bundle it was given', () => {
    const bundle = bundleWithTwoClasses();
    const before = bundle.sessions.length;
    scopeBundleToClass(bundle, 9);
    expect(bundle.sessions).toHaveLength(before);
  });
});
