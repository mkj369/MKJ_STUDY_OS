import { describe, expect, it } from 'vitest';
import { planReminders, quietHoursShiftPreview, respectQuietHours } from '@/domain/reminders';
import { buildRevisionQueue } from '@/domain/revisions';
import { day, makePreferences, makeRevision, makeTask, TODAY } from '../fixtures/factories';

// 2026-10-27T01:00:00Z = 07:00 in Asia/Dhaka (UTC+6) — a Tuesday, just after
// quiet hours end, so the 08:00 daily reminder slot is still in the future.
const NOW = new Date('2026-10-27T01:00:00Z');

function prefs(overrides: Record<string, unknown> = {}) {
  return makePreferences({ timezone: 'Asia/Dhaka', ...overrides });
}

function queueWithNextDate(nextDate: string, count = 1) {
  return buildRevisionQueue(
    Array.from({ length: count }, (_, index) => ({
      userChapterId: `chapter-${index + 1}`,
      userSubjectId: 'subject-1',
      chapterTitle: index === 0 ? 'Motion' : `Chapter ${index + 1}`,
      subjectName: 'Physics',
      revisions: [makeRevision({ revised_at: day(-2), next_review_date: nextDate, confidence_rating: 3 })],
    })),
    TODAY,
  );
}

describe('quiet hours', () => {
  it('leaves a safe time alone', () => {
    expect(respectQuietHours(TODAY, '08:00', prefs())).toEqual({ date: TODAY, time: '08:00' });
  });

  it('rolls late-evening times to the next morning', () => {
    expect(respectQuietHours(TODAY, '23:00', prefs())).toEqual({ date: day(1), time: '07:00' });
  });

  it('keeps early-morning times on the same day', () => {
    expect(respectQuietHours(TODAY, '06:00', prefs())).toEqual({ date: TODAY, time: '07:00' });
  });

  it('handles non-wrapping quiet windows', () => {
    const narrow = prefs({ quiet_hours_start: '13:00', quiet_hours_end: '15:00' });
    expect(respectQuietHours(TODAY, '14:00', narrow)).toEqual({ date: day(1), time: '15:00' });
    expect(quietHoursShiftPreview(TODAY, '12:00', narrow)).toBe(`${TODAY} 12:00`);
  });
});

describe('reminder planning', () => {
  it('returns nothing when reminders are off and says so', () => {
    const plan = planReminders({
      prefs: prefs({ reminders_enabled: false }),
      tasks: [makeTask({ due_date: TODAY })],
      revisionQueue: [],
      existingKeys: [],
      now: NOW,
    });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.suppressed[0]?.reason).toContain('switched off');
  });

  it('schedules a due-today task at a sane hour', () => {
    const task = makeTask({ due_date: TODAY, title: 'Practise numericals' });
    const plan = planReminders({ prefs: prefs(), tasks: [task], revisionQueue: [], existingKeys: [], now: NOW });
    const candidate = plan.candidates.find((c) => c.reminder_type === 'task_due');
    expect(candidate?.title).toContain('Practise numericals');
    expect(candidate?.reminder_key).toBe(`task_due:${task.id}:${TODAY}`);
    expect(candidate?.scheduled_for > NOW.toISOString()).toBe(true);
  });

  it('never schedules into the past', () => {
    // 23:30 Dhaka: an 08:00 reminder today already passed.
    const lateNow = new Date('2026-10-27T17:30:00Z');
    const plan = planReminders({
      prefs: prefs(),
      tasks: [makeTask({ due_date: TODAY })],
      revisionQueue: [],
      existingKeys: [],
      now: lateNow,
    });
    for (const candidate of plan.candidates) {
      expect(candidate.scheduled_for > lateNow.toISOString()).toBe(true);
    }
    expect(plan.suppressed.some((s) => s.reason.includes('past'))).toBe(true);
  });

  it('never duplicates an existing reminder key', () => {
    const task = makeTask({ due_date: TODAY });
    const key = `task_due:${task.id}:${TODAY}`;
    const plan = planReminders({
      prefs: prefs(),
      tasks: [task],
      revisionQueue: [],
      existingKeys: [key],
      now: NOW,
    });
    expect(plan.candidates.map((c) => c.reminder_key)).not.toContain(key);
    expect(plan.suppressed.some((s) => s.reason === 'Already scheduled')).toBe(true);
  });

  it('respects the daily cap', () => {
    const plan = planReminders({
      prefs: prefs({ max_per_day: 2 }),
      tasks: [],
      revisionQueue: queueWithNextDate(day(1), 3),
      existingKeys: [],
      now: NOW,
    });
    expect(plan.candidates).toHaveLength(2);
    expect(plan.suppressed.some((s) => s.reason.includes('Daily cap'))).toBe(true);
  });

  it('counts existing events towards the cap', () => {
    const plan = planReminders({
      prefs: prefs({ max_per_day: 1 }),
      tasks: [],
      revisionQueue: queueWithNextDate(day(1)),
      existingKeys: [],
      // A reminder already queued for tomorrow 08:00 Dhaka.
      existingEvents: [{ scheduled_for: `${day(1)}T02:00:00.000Z`, status: 'scheduled' }],
      now: NOW,
    });
    expect(plan.candidates).toHaveLength(0);
  });

  it('ignores failed events for the cap', () => {
    const plan = planReminders({
      prefs: prefs({ max_per_day: 1 }),
      tasks: [],
      revisionQueue: queueWithNextDate(day(1)),
      existingKeys: [],
      existingEvents: [{ scheduled_for: `${day(1)}T02:00:00.000Z`, status: 'failed' }],
      now: NOW,
    });
    expect(plan.candidates).toHaveLength(1);
  });

  it('adds an overdue reminder that does not shame the student', () => {
    const plan = planReminders({
      prefs: prefs(),
      tasks: [makeTask({ due_date: day(-3), title: 'Chem notes' })],
      revisionQueue: [],
      existingKeys: [],
      now: NOW,
    });
    const overdue = plan.candidates.find((c) => c.reminder_type === 'task_overdue');
    expect(overdue?.body).toContain('no guilt');
    expect(overdue?.body.toLowerCase()).not.toContain('failed');
  });

  it('plans revision reminders from the queue', () => {
    const plan = planReminders({
      prefs: prefs(),
      tasks: [],
      revisionQueue: queueWithNextDate(day(2)),
      existingKeys: [],
      now: NOW,
    });
    expect(plan.candidates[0]?.reminder_type).toBe('revision_due');
    expect(plan.candidates[0]?.title).toContain('Revise: Motion');
  });

  it('plans weekly planning only when enabled and in the future', () => {
    const disabled = planReminders({
      prefs: prefs(),
      tasks: [],
      revisionQueue: [],
      existingKeys: [],
      now: NOW,
    });
    expect(disabled.candidates.some((c) => c.reminder_type === 'weekly_planning')).toBe(false);

    const enabled = planReminders({
      prefs: prefs({ weekly_planning_enabled: true, weekly_planning_day: 5, weekly_planning_time: '18:00' }),
      tasks: [],
      revisionQueue: [],
      existingKeys: [],
      now: NOW,
    });
    expect(enabled.candidates.some((c) => c.reminder_type === 'weekly_planning')).toBe(true);
    expect(enabled.nextWeeklyPlanning).not.toBeNull();
  });

  it('keeps every planned instant outside quiet hours', () => {
    const plan = planReminders({
      prefs: prefs({ weekly_planning_enabled: true, weekly_planning_time: '23:30' }),
      tasks: [makeTask({ due_date: TODAY }), makeTask({ due_date: day(-1) })],
      revisionQueue: queueWithNextDate(TODAY),
      existingKeys: [],
      now: NOW,
    });
    expect(plan.candidates.length).toBeGreaterThan(0);
    for (const candidate of plan.candidates) {
      const hourly = new Date(candidate.scheduled_for).toLocaleString('en-GB', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      expect(hourly >= '07:00' && hourly < '22:00').toBe(true);
    }
  });

  it('exposes the timezone used in the notes', () => {
    const plan = planReminders({ prefs: prefs(), tasks: [], revisionQueue: [], existingKeys: [], now: NOW });
    expect(plan.notes.join(' ')).toContain('Asia/Dhaka');
  });
});
