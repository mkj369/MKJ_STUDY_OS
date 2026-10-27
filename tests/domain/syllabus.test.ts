import { describe, expect, it } from 'vitest';
import {
  buildActivityMatrix,
  buildChapterCoverage,
  computeSubjectCoverage,
  computeTopicProgress,
  estimateCompletion,
  matchesVersionFilter,
  remainingChapterTitles,
  weeksUntil,
} from '@/domain/syllabus';
import {
  day,
  makeChapter,
  makeChecklistItem,
  makeLecture,
  makeProgress,
  makeRevision,
  makeSession,
  makeTopic,
  TODAY,
} from '../fixtures/factories';

describe('topic progress', () => {
  it('counts statuses and reports a null percentage for an empty chapter', () => {
    expect(computeTopicProgress([]).percent).toBeNull();
    const progress = computeTopicProgress([
      makeTopic({ status: 'complete' }),
      makeTopic({ status: 'complete' }),
      makeTopic({ status: 'in_progress' }),
      makeTopic({ status: 'needs_revision' }),
      makeTopic({ status: 'not_recorded' }),
    ]);
    expect(progress).toMatchObject({ total: 5, complete: 2, inProgress: 1, needsRevision: 1, notRecorded: 1, percent: 40 });
  });
});

describe('activity matrix', () => {
  const checklist = [
    { item: makeChecklistItem({ kind: 'reading' }), progress: makeProgress({ is_done: true }) },
    { item: makeChecklistItem({ kind: 'reading' }), progress: makeProgress({ is_done: false }) },
    { item: makeChecklistItem({ kind: 'mcq' }), progress: null },
    { item: makeChecklistItem({ kind: 'reading', is_archived: true }), progress: makeProgress({ is_done: true }) },
  ];

  it('tracks each activity separately and ignores archived items', () => {
    const rows = buildActivityMatrix({ checklist, lectures: [], revisions: [], sessions: [] });
    const reading = rows.find((row) => row.key === 'reading');
    expect(reading).toMatchObject({ done: 1, total: 2, percent: 50, hasRecord: true });
    const mcq = rows.find((row) => row.key === 'mcq');
    expect(mcq).toMatchObject({ done: 0, total: 1, percent: 0 });
    const written = rows.find((row) => row.key === 'written');
    expect(written?.percent).toBeNull();
    expect(written?.hasRecord).toBe(false);
  });

  it('uses a lecture target when set, and no denominator when not', () => {
    const lectures = [makeLecture({ is_completed: true }), makeLecture({ is_completed: true }), makeLecture({ is_completed: false })];
    const withTarget = buildActivityMatrix({ checklist: [], lectures, revisions: [], sessions: [], lectureTarget: 4 });
    const lectureRow = withTarget.find((row) => row.key === 'lectures');
    expect(lectureRow).toMatchObject({ done: 2, total: 4, percent: 50 });
    const withoutTarget = buildActivityMatrix({ checklist: [], lectures, revisions: [], sessions: [] });
    expect(withoutTarget.find((row) => row.key === 'lectures')?.percent).toBeNull();
  });

  it('never invents a denominator for revision counts', () => {
    const rows = buildActivityMatrix({
      checklist: [],
      lectures: [],
      revisions: [makeRevision(), makeRevision()],
      sessions: [],
    });
    const revision = rows.find((row) => row.key === 'revision');
    expect(revision).toMatchObject({ done: 2, total: null, percent: null, hasRecord: true });
  });

  it('counts a recorded practice session as practice evidence', () => {
    const rows = buildActivityMatrix({
      checklist: [],
      lectures: [],
      revisions: [],
      sessions: [makeSession({ activity_type: 'practice', duration_minutes: 30 })],
    });
    expect(rows.find((row) => row.key === 'practice')).toMatchObject({ done: 1, hasRecord: true });
  });

  it('produces all eleven activities in a stable order', () => {
    const rows = buildActivityMatrix({ checklist: [], lectures: [], revisions: [], sessions: [] });
    expect(rows).toHaveLength(11);
    expect(rows[0]?.key).toBe('reading');
    expect(rows.at(-1)?.key).toBe('self_test');
  });
});

describe('chapter and subject coverage', () => {
  const chapter = makeChapter({ status: 'needs_practice' });
  const coverage = buildChapterCoverage({
    chapter,
    title: 'Dynamics',
    topics: [makeTopic({ status: 'complete' }), makeTopic({ status: 'in_progress' }), makeTopic()],
    checklist: [{ item: makeChecklistItem({ kind: 'reading' }), progress: makeProgress({ is_done: true }) }],
    lectures: [makeLecture({ is_completed: true })],
    revisions: [],
    sessions: [],
  });

  it('keeps the denominator visible', () => {
    expect(coverage.topic.total).toBe(3);
    expect(coverage.topic.complete).toBe(1);
    // 2 of 11: reading is fully ticked; one lecture is completed with no target set.
    expect(coverage.activityPercent).toBe(18);
    expect(coverage.activitiesTracked).toBe(2);
    expect(coverage.activitiesComplete).toBe(2);
  });

  it('summarises a subject without hiding unrecorded chapters', () => {
    const subject = computeSubjectCoverage({
      subjectId: 'subject-1',
      chapterCoverages: [
        { ...coverage, status: 'complete' },
        { ...coverage, status: 'not_recorded' },
        { ...coverage, status: 'in_progress' },
      ],
    });
    expect(subject).toMatchObject({
      chapters: 3,
      chaptersComplete: 1,
      chaptersStarted: 2,
      chaptersNotRecorded: 1,
      chapterPercent: 33,
    });
  });

  it('reports null percentages for a subject with no chapters', () => {
    const subject = computeSubjectCoverage({ subjectId: 's', chapterCoverages: [] });
    expect(subject.chapterPercent).toBeNull();
    expect(subject.topicPercent).toBeNull();
    expect(subject.activityPercent).toBeNull();
  });
});

describe('completion estimate', () => {
  it('needs real pace data rather than guessing', () => {
    const estimate = estimateCompletion({ chaptersRemaining: 12, completedChapterMinutes: [], weeklyCapacityMinutes: 600 });
    expect(estimate.status).toBe('insufficient_data');
    expect(estimate.weeks).toBeNull();
    expect(estimate.message).toContain('Not enough recorded study time');
  });

  it('uses an explicit planning assumption when the student provides one', () => {
    const estimate = estimateCompletion({
      chaptersRemaining: 10,
      completedChapterMinutes: [],
      weeklyCapacityMinutes: 300,
      defaultChapterMinutes: 120,
    });
    expect(estimate.status).toBe('estimated');
    expect(estimate.weeks).toBe(4);
    expect(estimate.assumptions.join(' ')).toContain('planning figure');
  });

  it('reflects the student’s own recorded pace', () => {
    const estimate = estimateCompletion({ chaptersRemaining: 8, completedChapterMinutes: [100, 140], weeklyCapacityMinutes: 600 });
    expect(estimate.weeks).toBe(2);
    expect(estimate.rangeWeeks).toEqual({ low: 2, high: 3 });
    expect(estimate.assumptions[0]).toContain('2 completed chapters');
  });

  it('asks for availability instead of dividing by zero', () => {
    const estimate = estimateCompletion({ chaptersRemaining: 4, completedChapterMinutes: [60, 60], weeklyCapacityMinutes: 0 });
    expect(estimate.status).toBe('no_availability');
    expect(estimate.weeks).toBeNull();
  });

  it('celebrates a finished syllabus without inventing work', () => {
    const estimate = estimateCompletion({ chaptersRemaining: 0, completedChapterMinutes: [60], weeklyCapacityMinutes: 300 });
    expect(estimate.status).toBe('no_remaining_work');
    expect(estimate.remainingWorkMinutes).toBe(0);
  });

  it('always labels the estimate as a floor', () => {
    const estimate = estimateCompletion({ chaptersRemaining: 8, completedChapterMinutes: [100, 140], weeklyCapacityMinutes: 600 });
    expect(estimate.assumptions.join(' ')).toContain('floor, not a promise');
  });
});

describe('version filters and helpers', () => {
  const version = { id: 'v1', class_grade: 'HSC', stream: 'science', academic_year: '2025-2026' };

  it('filters by class, stream and version', () => {
    expect(matchesVersionFilter(version, { classGrade: 'HSC' })).toBe(true);
    expect(matchesVersionFilter(version, { classGrade: 'SSC' })).toBe(false);
    expect(matchesVersionFilter(version, { stream: 'science' })).toBe(true);
    expect(matchesVersionFilter(version, { stream: 'arts' })).toBe(false);
    expect(matchesVersionFilter(version, { versionId: 'v2' })).toBe(false);
  });

  it('lists remaining chapters without pretending they are urgent', () => {
    expect(
      remainingChapterTitles([
        { title: 'One', status: 'complete' },
        { title: 'Two', status: 'in_progress' },
        { title: 'Three', status: 'not_recorded' },
      ]),
    ).toEqual(['Two', 'Three']);
  });

  it('counts weeks to an exam without negative results', () => {
    expect(weeksUntil(day(14), TODAY)).toBe(2);
    expect(weeksUntil(day(-14), TODAY)).toBe(0);
  });
});
