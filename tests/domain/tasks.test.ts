import { describe, expect, it } from 'vitest';
import {
  buildRecoveryDraft,
  buildWeeklyPlanDraft,
  carryOverPatch,
  isDueToday,
  isOpenTask,
  isOverdue,
  sortTasksForPlanning,
  summarizeTasks,
  tasksForDay,
} from '@/domain/tasks';
import { weekRange } from '@/domain/dates';
import { day, makeTask, TODAY } from '../fixtures/factories';

describe('task classification', () => {
  it('treats only todo/in_progress as open', () => {
    expect(isOpenTask(makeTask({ status: 'todo' }))).toBe(true);
    expect(isOpenTask(makeTask({ status: 'in_progress' }))).toBe(true);
    expect(isOpenTask(makeTask({ status: 'done' }))).toBe(false);
    expect(isOpenTask(makeTask({ status: 'cancelled' }))).toBe(false);
  });

  it('never treats a task without a due date as overdue', () => {
    expect(isOverdue(makeTask({ due_date: null }), TODAY)).toBe(false);
    expect(isOverdue(makeTask({ due_date: day(-1) }), TODAY)).toBe(true);
    expect(isOverdue(makeTask({ due_date: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(makeTask({ due_date: day(1) }), TODAY)).toBe(false);
  });

  it('does not call a completed task overdue', () => {
    expect(isOverdue(makeTask({ due_date: day(-3), status: 'done' }), TODAY)).toBe(false);
    expect(isDueToday(makeTask({ due_date: TODAY, status: 'done' }), TODAY)).toBe(false);
  });

  it('summarises counts from the records only', () => {
    const counts = summarizeTasks(
      [
        makeTask({ due_date: day(-2) }),
        makeTask({ due_date: TODAY }),
        makeTask({ status: 'done', completed_at: `${TODAY}T09:00:00Z` }),
        makeTask({ status: 'blocked' }),
      ],
      TODAY,
    );
    expect(counts.open).toBe(2);
    expect(counts.overdue).toBe(1);
    expect(counts.dueToday).toBe(1);
    expect(counts.doneThisWeek).toBe(1);
    expect(counts.totalMinutesOpen).toBe(60);
  });
});

describe('planning order', () => {
  it('puts overdue first, then today, then priority and shorter work', () => {
    const overdueLow = makeTask({ title: 'overdue low', due_date: day(-3), priority: 'low' });
    const todayHigh = makeTask({ title: 'today high', due_date: TODAY, priority: 'high' });
    const futureHigh = makeTask({ title: 'future high', due_date: day(4), priority: 'high' });
    const noDueMedium = makeTask({ title: 'no due', due_date: null, priority: 'medium' });
    const sorted = sortTasksForPlanning([noDueMedium, futureHigh, todayHigh, overdueLow], TODAY);
    expect(sorted[0]?.title).toBe('overdue low');
    expect(sorted[1]?.title).toBe('today high');
    expect(sorted.map((task) => task.title)).toContain('no due');
  });

  it('filters by planned day only', () => {
    const planned = makeTask({ planned_date: TODAY });
    const tomorrow = makeTask({ planned_date: day(1) });
    const dueOnly = makeTask({ due_date: TODAY });
    expect(tasksForDay([planned, tomorrow, dueOnly], TODAY)).toEqual([planned]);
  });
});

describe('carry-over', () => {
  it('unplans a missed task and counts the carry, without deleting it', () => {
    const patch = carryOverPatch(makeTask({ due_date: day(-4), planned_date: day(-4) }), TODAY);
    expect(patch).toEqual({ planned_date: null, carried_over_count: 1 });
    // The deadline itself is never silently rewritten.
    expect(patch).not.toHaveProperty('due_date');
    expect(patch).not.toHaveProperty('status');
  });

  it('increments an existing carry count', () => {
    const patch = carryOverPatch(
      makeTask({ planned_date: day(-4), carried_over_count: 2 }),
      TODAY,
    );
    expect(patch?.carried_over_count).toBe(3);
  });

  it('leaves future, todays and closed tasks untouched', () => {
    expect(carryOverPatch(makeTask({ planned_date: day(3) }), TODAY)).toBeNull();
    expect(carryOverPatch(makeTask({ planned_date: TODAY }), TODAY)).toBeNull();
    expect(carryOverPatch(makeTask({ planned_date: day(-3), status: 'done' }), TODAY)).toBeNull();
    // A task that was never planned has nothing to carry.
    expect(carryOverPatch(makeTask({ due_date: day(-3) }), TODAY)).toBeNull();
  });
});

describe('weekly plan draft', () => {
  const weekStart = weekRange(TODAY).start;

  it('fills real availability and keeps locked days', () => {
    const availability = { '0': 60, '1': 60, '2': 0, '3': 60, '4': 60, '5': 0, '6': 0 };
    const locked = makeTask({ estimated_minutes: 30, planned_date: weekStart });
    const floating = makeTask({ estimated_minutes: 45 });
    const draft = buildWeeklyPlanDraft([locked, floating], availability, weekStart, TODAY);
    const lockedDay = draft.days.find((d) => d.date === weekStart);
    expect(lockedDay?.planned.map((t) => t.id)).toContain(locked.id);
    expect(draft.days.find((d) => d.weekday === 2)?.isRestDay).toBe(true);
    expect(draft.days.every((d) => d.date === weekStart ? d.planned.length >= 1 : true)).toBe(true);
    expect(draft.unscheduled).toHaveLength(0);
  });

  it('never schedules into a day that already passed', () => {
    const availability = { '0': 60, '1': 60, '2': 60, '3': 60, '4': 60, '5': 60, '6': 60 };
    const task = makeTask({ estimated_minutes: 30 });
    const draft = buildWeeklyPlanDraft([task], availability, weekStart, TODAY);
    for (const plannedDay of draft.days.filter((d) => d.planned.length > 0)) {
      expect(plannedDay.date >= TODAY).toBe(true);
    }
  });

  it('reports honestly when there is no capacity', () => {
    const availability = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
    const draft = buildWeeklyPlanDraft([makeTask()], availability, weekStart, TODAY);
    expect(draft.totalCapacityMinutes).toBe(0);
    expect(draft.unscheduled).toHaveLength(1);
    expect(draft.warnings.join(' ')).toContain('No study time is set');
  });

  it('warns about over-capacity instead of silently squeezing', () => {
    // 30 minutes every day: no 60-minute task fits, so each remaining day takes
    // exactly one fallback task and the plan exceeds the entered availability.
    const availability = { '0': 30, '1': 30, '2': 30, '3': 30, '4': 30, '5': 30, '6': 30 };
    const draft = buildWeeklyPlanDraft(
      Array.from({ length: 6 }, () => makeTask({ estimated_minutes: 60 })),
      availability,
      weekStart,
      TODAY,
    );
    expect(draft.warnings.some((w) => w.includes('more than the time you entered'))).toBe(true);
    expect(draft.unscheduled.length).toBeGreaterThan(0);
  });

  it('marks carried-forward tasks but keeps them', () => {
    const availability = { '0': 60, '1': 60, '2': 60, '3': 60, '4': 60, '5': 60, '6': 60 };
    const overdue = makeTask({ due_date: day(-5) });
    const draft = buildWeeklyPlanDraft([overdue], availability, weekStart, TODAY);
    expect(draft.carriedForward.map((t) => t.id)).toContain(overdue.id);
  });

  it('recovery keeps what fits and defers the rest', () => {
    const draft = buildWeeklyPlanDraft(
      [makeTask({ estimated_minutes: 60 }), makeTask({ estimated_minutes: 60 })],
      { '0': 60, '1': 60, '2': 60, '3': 60, '4': 60, '5': 60, '6': 60 },
      weekStart,
      TODAY,
    );
    const recovery = buildRecoveryDraft(draft);
    expect(recovery.keep.length + recovery.defer.length).toBe(2);
    expect(recovery.message).not.toContain('delete');
  });
});
