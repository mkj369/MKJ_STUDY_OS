import { describe, expect, it } from 'vitest';
import {
  computeTargetProgress,
  currentPeriodStart,
  summariseTargets,
  targetWindow,
  type TargetProgressInput,
} from '@/domain/targets';
import { makeChapter, makeLecture, makeProgress, makeSession, makeTarget, TODAY } from '../fixtures/factories';

const TODAY_WEEK = '2026-11-04'; // Wednesday; week = Sun 2026-11-01 … Sat 2026-11-07

function emptyInput(): TargetProgressInput {
  return {
    chapters: [],
    chapterStatusById: new Map(),
    checklistProgress: [],
    chapterIdByItemId: new Map(),
    subjectIdByChapterId: new Map(),
    lectures: [],
    sessions: [],
  };
}

describe('target windows', () => {
  it('derives the app-wide Sunday-based week from any date inside it', () => {
    const window = targetWindow({ period_type: 'weekly', period_start: '2026-11-06' });
    expect(window).toEqual({ start: '2026-11-01', end: '2026-11-07' });
  });

  it('derives the calendar month including December rollover', () => {
    expect(targetWindow({ period_type: 'monthly', period_start: '2026-11-15' })).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(targetWindow({ period_type: 'monthly', period_start: '2026-12-25' })).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    });
    expect(targetWindow({ period_type: 'monthly', period_start: '2028-02-10' })).toEqual({
      start: '2028-02-01',
      end: '2028-02-29', // leap year
    });
  });

  it('anchors new targets to the current period', () => {
    expect(currentPeriodStart('weekly', TODAY_WEEK)).toBe('2026-11-01');
    expect(currentPeriodStart('monthly', TODAY_WEEK)).toBe('2026-11-01');
  });
});

describe('chapters metric', () => {
  it('counts complete chapters in the explicit chapter scope only', () => {
    const c1 = makeChapter({ id: 'c1', user_subject_id: 's1' });
    const c2 = makeChapter({ id: 'c2', user_subject_id: 's1' });
    const c3 = makeChapter({ id: 'c3', user_subject_id: 's2' });
    const input = emptyInput();
    input.chapters = [c1, c2, c3];
    input.chapterStatusById = new Map([
      ['c1', 'complete'],
      ['c2', 'in_progress'],
      ['c3', 'complete'],
    ]);
    const target = makeTarget({ metric: 'chapters', target_value: 2, chapter_ids: ['c1', 'c2'], period_start: TODAY_WEEK });
    const progress = computeTargetProgress(target, input, TODAY_WEEK);
    expect(progress.current).toBe(1);
    expect(progress.goal).toBe(2);
    expect(progress.percent).toBe(50);
    expect(progress.remaining).toBe(1);
    expect(progress.state).toBe('active');
  });

  it('scopes to a subject when no explicit chapters are chosen', () => {
    const input = emptyInput();
    input.chapters = [
      makeChapter({ id: 'c1', user_subject_id: 's1' }),
      makeChapter({ id: 'c2', user_subject_id: 's2' }),
    ];
    input.chapterStatusById = new Map([['c1', 'complete'], ['c2', 'complete']]);
    const target = makeTarget({ metric: 'chapters', target_value: 1, user_subject_id: 's1', chapter_ids: [] });
    expect(computeTargetProgress(target, input, TODAY_WEEK).current).toBe(1);
  });

  it('marks a missed window overdue and a future window upcoming', () => {
    const target = makeTarget({ metric: 'chapters', target_value: 5, period_start: '2026-10-05' });
    expect(computeTargetProgress(target, emptyInput(), TODAY_WEEK).state).toBe('overdue');
    const future = makeTarget({ metric: 'chapters', target_value: 5, period_start: '2026-12-01' });
    expect(computeTargetProgress(future, emptyInput(), TODAY_WEEK).state).toBe('upcoming');
  });

  it('reaches completed even after the window ends', () => {
    const input = emptyInput();
    input.chapters = [makeChapter({ id: 'c1' })];
    input.chapterStatusById = new Map([['c1', 'complete']]);
    const target = makeTarget({ metric: 'chapters', target_value: 1, chapter_ids: ['c1'], period_start: '2026-10-05' });
    expect(computeTargetProgress(target, input, TODAY_WEEK).state).toBe('completed');
  });
});

describe('checklist_items metric', () => {
  it('counts only ticks completed inside the window and scope', () => {
    const input = emptyInput();
    input.chapterIdByItemId = new Map([['i1', 'c1'], ['i2', 'c1'], ['i3', 'c2'], ['i4', 'c1']]);
    input.subjectIdByChapterId = new Map([['c1', 's1'], ['c2', 's2']]);
    input.checklistProgress = [
      makeProgress({ checklist_item_id: 'i1', is_done: true, completed_at: '2026-11-03T10:00:00.000Z' }),
      makeProgress({ checklist_item_id: 'i2', is_done: true, completed_at: '2026-10-28T10:00:00.000Z' }), // before window
      makeProgress({ checklist_item_id: 'i3', is_done: true, completed_at: '2026-11-04T10:00:00.000Z' }), // other subject
      makeProgress({ checklist_item_id: 'i4', is_done: false, completed_at: null }), // unticked
    ];
    const target = makeTarget({
      metric: 'checklist_items',
      target_value: 10,
      user_subject_id: 's1',
      chapter_ids: [],
      period_start: TODAY_WEEK,
    });
    const progress = computeTargetProgress(target, input, TODAY_WEEK);
    expect(progress.current).toBe(1);
    expect(progress.percent).toBe(10);
  });
});

describe('lectures metric', () => {
  it('counts completed lectures dated inside the window', () => {
    const input = emptyInput();
    input.lectures = [
      makeLecture({ user_subject_id: 's1', is_completed: true, lecture_date: '2026-11-03' }),
      makeLecture({ user_subject_id: 's1', is_completed: false, lecture_date: '2026-11-04' }),
      makeLecture({ user_subject_id: 's1', is_completed: true, lecture_date: '2026-11-08' }), // next week
      makeLecture({ user_subject_id: 's2', is_completed: true, lecture_date: '2026-11-03' }),
    ];
    const target = makeTarget({ metric: 'lectures', target_value: 4, user_subject_id: 's1', period_start: TODAY_WEEK });
    expect(computeTargetProgress(target, input, TODAY_WEEK).current).toBe(1);
  });
});

describe('minutes metric', () => {
  it('sums session minutes in the window and caps percent at 100', () => {
    const input = emptyInput();
    input.sessions = [
      makeSession({ user_subject_id: 's1', session_date: '2026-11-02', duration_minutes: 90 }),
      makeSession({ user_subject_id: 's1', session_date: '2026-11-05', duration_minutes: 60 }),
      makeSession({ user_subject_id: 's1', session_date: '2026-10-31', duration_minutes: 500 }),
    ];
    const target = makeTarget({ metric: 'minutes', target_value: 120, user_subject_id: 's1', period_start: TODAY_WEEK });
    const progress = computeTargetProgress(target, input, TODAY_WEEK);
    expect(progress.current).toBe(150);
    expect(progress.percent).toBe(100);
    expect(progress.state).toBe('completed');
  });

  it('an unscoped target counts everything in the window', () => {
    const input = emptyInput();
    input.sessions = [
      makeSession({ user_subject_id: 's1', session_date: '2026-11-02', duration_minutes: 30 }),
      makeSession({ user_subject_id: 's2', session_date: '2026-11-03', duration_minutes: 45 }),
    ];
    const target = makeTarget({ metric: 'minutes', target_value: 100, user_subject_id: null, period_start: TODAY_WEEK });
    expect(computeTargetProgress(target, input, TODAY_WEEK).current).toBe(75);
  });
});

describe('target summaries', () => {
  it('aggregates states and average percent', () => {
    const input = emptyInput();
    input.sessions = [makeSession({ session_date: TODAY, duration_minutes: 60 })];
    const targets = [
      makeTarget({ metric: 'minutes', target_value: 60, period_start: TODAY }), // completed
      makeTarget({ metric: 'minutes', target_value: 600, period_start: TODAY }), // active 10%
      makeTarget({ metric: 'chapters', target_value: 3, period_start: '2026-09-01' }), // overdue
    ];
    const progresses = targets.map((t) => computeTargetProgress(t, input, TODAY));
    const summary = summariseTargets(progresses);
    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.active).toBe(1);
    expect(summary.averagePercent).toBe(Math.round((100 + 10 + 0) / 3));
  });

  it('handles an empty list without dividing by zero', () => {
    expect(summariseTargets([])).toEqual({
      total: 0,
      completed: 0,
      active: 0,
      overdue: 0,
      upcoming: 0,
      averagePercent: 0,
    });
  });
});
