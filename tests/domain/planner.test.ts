import { describe, expect, it } from 'vitest';
import { buildRecoverySuggestion, buildStudySuggestions, suggestionToTask } from '@/domain/planner';
import type { RevisionQueueEntry } from '@/domain/revisions';
import { analyzeMistakes } from '@/domain/mistakes';
import { day, makeChapter, makeMistake, makeTask, TODAY } from '../fixtures/factories';

const revisionEntry = (overrides: Partial<RevisionQueueEntry> = {}): RevisionQueueEntry => ({
  userChapterId: 'c1',
  userSubjectId: 'subject-1',
  chapterTitle: 'Dynamics',
  subjectName: 'Physics — 1st Paper',
  summary: {
    count: 2,
    lastDate: day(-8),
    nextDate: day(-1),
    nextDateSource: 'recorded',
    dueState: 'overdue',
    daysUntilNext: -1,
    lastConfidence: 2,
    daysSinceLast: 8,
  },
  daysUntilDue: -1,
  bucket: 'overdue',
  ...overrides,
});

const chapterRow = (overrides: Partial<Parameters<typeof buildStudySuggestions>[0]['chapters'][number]> = {}) => ({
  chapter: makeChapter({ id: 'c1', custom_title: 'Dynamics' }),
  title: 'Dynamics',
  subjectId: 'subject-1',
  status: 'in_progress',
  topicsRemaining: 2,
  overdueRevision: false,
  openDifficulties: 0,
  practiceRecorded: false,
  ...overrides,
});

const base = {
  today: TODAY,
  chapters: [chapterRow()],
  revisionQueue: [revisionEntry()],
  mistakes: analyzeMistakes([]),
  tasks: [],
  examTargets: [],
  practiceQueue: [],
  availability: { '0': 90 },
};

describe('study suggestions', () => {
  it('puts an overdue revision first and names the evidence', () => {
    const suggestions = buildStudySuggestions(base);
    const revision = suggestions.find((suggestion) => suggestion.kind === 'revision');
    expect(revision?.priority).toBe('high');
    expect(revision?.evidence.join(' ')).toContain('Next review');
    expect(suggestions[0]?.kind).toBe('revision');
  });

  it('marks a suggestion already covered by an open task', () => {
    const suggestions = buildStudySuggestions({
      ...base,
      tasks: [makeTask({ user_chapter_id: 'c1', status: 'todo' })],
    });
    expect(suggestions.find((suggestion) => suggestion.kind === 'revision')?.alreadyPlanned).toBe(true);
  });

  it('does not suggest a chapter that has no records for a revision', () => {
    const suggestions = buildStudySuggestions({ ...base, revisionQueue: [] });
    expect(suggestions.every((suggestion) => suggestion.kind !== 'revision')).toBe(true);
  });

  it('suggests starting a chapter with no records, at low priority', () => {
    const suggestions = buildStudySuggestions({
      ...base,
      revisionQueue: [],
      chapters: [chapterRow({ status: 'not_recorded', topicsRemaining: 0 })],
    });
    const start = suggestions.find((suggestion) => suggestion.key.startsWith('start:'));
    expect(start?.priority).toBe('low');
    expect(start?.reason).toContain('No records');
  });

  it('raises practice priority when difficulties stay open', () => {
    const suggestions = buildStudySuggestions({
      ...base,
      revisionQueue: [],
      chapters: [chapterRow({ status: 'needs_practice', openDifficulties: 2 })],
    });
    const practice = suggestions.find((suggestion) => suggestion.key.startsWith('practice:'));
    expect(practice?.priority).toBe('high');
    expect(practice?.evidence.join(' ')).toContain('2 open difficult topic');
  });

  it('adds an exam suggestion only when the date is near', () => {
    const near = buildStudySuggestions({
      ...base,
      examTargets: [{ id: 'e1', title: 'Half-yearly', exam_date: day(10), user_subject_id: 'subject-1' }],
    });
    expect(near.some((suggestion) => suggestion.kind === 'exam')).toBe(true);

    const far = buildStudySuggestions({
      ...base,
      examTargets: [{ id: 'e2', title: 'Final', exam_date: day(200), user_subject_id: 'subject-1' }],
    });
    expect(far.some((suggestion) => suggestion.kind === 'exam')).toBe(false);
  });

  it('ignores exam targets whose chapters are all complete', () => {
    const suggestions = buildStudySuggestions({
      ...base,
      chapters: [chapterRow({ status: 'complete', topicsRemaining: 0 })],
      examTargets: [{ id: 'e1', title: 'Half-yearly', exam_date: day(5), user_subject_id: 'subject-1' }],
    });
    expect(suggestions.some((suggestion) => suggestion.kind === 'exam')).toBe(false);
  });

  it('surfaces error patterns only when the record supports them', () => {
    const mistakes = analyzeMistakes([
      makeMistake({ occurred_at: day(-6), category: 'calculation' }),
      makeMistake({ occurred_at: day(-2), category: 'calculation' }),
    ]);
    const suggestions = buildStudySuggestions({ ...base, revisionQueue: [], mistakes });
    expect(suggestions.some((suggestion) => suggestion.kind === 'weak_area')).toBe(true);

    const single = analyzeMistakes([makeMistake({ occurred_at: day(-2) })]);
    const quiet = buildStudySuggestions({ ...base, revisionQueue: [], mistakes: single });
    expect(quiet.some((suggestion) => suggestion.key.startsWith('mistake:'))).toBe(false);
  });

  it('caps the list and keeps the ordering deterministic', () => {
    const chapters = Array.from({ length: 12 }, (_, index) =>
      chapterRow({
        chapter: makeChapter({ id: `c${index}`, custom_title: `Chapter ${index}` }),
        title: `Chapter ${index}`,
        topicsRemaining: 3,
      }),
    );
    const first = buildStudySuggestions({ ...base, chapters, revisionQueue: [] });
    const second = buildStudySuggestions({ ...base, chapters, revisionQueue: [] });
    expect(first).toHaveLength(8);
    expect(first.map((suggestion) => suggestion.key)).toEqual(second.map((suggestion) => suggestion.key));
  });

  it('deduplicates suggestions with the same key', () => {
    const suggestions = buildStudySuggestions({
      ...base,
      revisionQueue: [revisionEntry(), revisionEntry()],
      chapters: [],
    });
    const keys = suggestions.map((suggestion) => suggestion.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('still works with no availability entered', () => {
    const suggestions = buildStudySuggestions({ ...base, availability: null });
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

describe('suggestion → task', () => {
  it('creates a task payload that names the source instead of pretending to be manual', () => {
    const suggestion = buildStudySuggestions(base)[0];
    expect(suggestion).toBeDefined();
    const payload = suggestionToTask(suggestion!, TODAY);
    expect(payload).toMatchObject({ status: 'todo', origin: 'rule', due_date: TODAY, planned_date: TODAY });
    expect(payload.description).toContain('Suggested because');
    expect(payload.estimated_minutes).toBeGreaterThanOrEqual(5);
    expect(payload.estimated_minutes).toBeLessThanOrEqual(720);
  });

  it('clamps absurd minutes', () => {
    const suggestion = buildStudySuggestions(base)[0]!;
    const payload = suggestionToTask({ ...suggestion, minutes: 5000 }, TODAY);
    expect(payload.estimated_minutes).toBe(720);
  });
});

describe('recovery', () => {
  it('keeps a realistic subset and carries the rest forward', () => {
    const tasks = [
      makeTask({ id: 'a', estimated_minutes: 60, due_date: day(-2), priority: 'high' }),
      makeTask({ id: 'b', estimated_minutes: 60, due_date: TODAY }),
      makeTask({ id: 'c', estimated_minutes: 120, due_date: day(2) }),
    ];
    const recovery = buildRecoverySuggestion(tasks, TODAY, 120);
    expect(recovery.keepCount + recovery.deferCount).toBe(3);
    expect(recovery.keepCount).toBe(2);
    expect(recovery.hasOverdue).toBe(true);
    expect(recovery.message).toContain('Nothing is deleted');
  });

  it('never shames a missed day', () => {
    const recovery = buildRecoverySuggestion(
      [makeTask({ due_date: day(-4), priority: 'high' })],
      TODAY,
      0,
    );
    expect(recovery.message).not.toMatch(/fail|lazy|guilt|streak/i);
    expect(recovery.keepCount).toBe(0);
    expect(recovery.deferCount).toBe(1);
  });

  it('offers rest when nothing is open', () => {
    const recovery = buildRecoverySuggestion([makeTask({ status: 'done' })], TODAY, 120);
    expect(recovery.message).toContain('Rest is part of the plan');
  });

  it('ignores completed tasks in the keep/defer split', () => {
    const recovery = buildRecoverySuggestion(
      [makeTask({ status: 'done' }), makeTask({ status: 'blocked' }), makeTask({ status: 'todo' })],
      TODAY,
      120,
    );
    expect(recovery.keepCount + recovery.deferCount).toBe(1);
  });
});
