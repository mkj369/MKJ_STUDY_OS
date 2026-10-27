import { describe, expect, it } from 'vitest';
import {
  blockToEntry,
  buildTimeline,
  endOfDaySummary,
  findDuplicateCandidates,
  findOverlaps,
  formatMinutes,
  plannedVsActual,
  sessionToEntry,
  summarizeTime,
  timerResult,
  weekTotals,
} from '@/domain/timeTracking';
import { day, makeBlock, makeSession, TODAY } from '../fixtures/factories';

describe('timeline merge', () => {
  it('keeps study sessions and day blocks as separate sources', () => {
    const sessions = [makeSession({ session_date: TODAY, duration_minutes: 45 })];
    const blocks = [makeBlock({ entry_date: TODAY, category: 'college', duration_minutes: 120 })];
    const timeline = buildTimeline({ sessions, blocks }, TODAY);
    expect(timeline).toHaveLength(2);
    expect(timeline.map((entry) => entry.kind).sort()).toEqual(['block', 'study']);
    const summary = summarizeTime(timeline);
    expect(summary.studyMinutes).toBe(45);
    expect(summary.otherMinutes).toBe(120);
    expect(summary.totalLoggedMinutes).toBe(165);
  });

  it('excludes other dates', () => {
    const timeline = buildTimeline(
      { sessions: [makeSession({ session_date: day(-1) })], blocks: [makeBlock({ entry_date: TODAY })] },
      TODAY,
    );
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.kind).toBe('block');
  });

  it('orders timed entries by clock and leaves untimed entries last', () => {
    const early = makeSession({
      session_date: TODAY,
      started_at: `${TODAY}T03:00:00.000Z`,
      ended_at: `${TODAY}T03:30:00.000Z`,
    });
    const late = makeBlock({
      entry_date: TODAY,
      started_at: `${TODAY}T12:00:00.000Z`,
      ended_at: `${TODAY}T13:00:00.000Z`,
    });
    const untimed = makeSession({ session_date: TODAY, duration_minutes: 99 });
    const timeline = buildTimeline({ sessions: [untimed, early], blocks: [late] }, TODAY);
    expect(timeline.map((entry) => entry.id)).toEqual([early.id, late.id, untimed.id]);
  });

  it('labels custom blocks by their custom label', () => {
    const entry = blockToEntry(makeBlock({ category: 'custom', custom_label: 'Family time' }));
    expect(entry.label).toBe('Family time');
  });

  it('labels study entries with the activity name', () => {
    expect(sessionToEntry(makeSession({ activity_type: 'mcq' })).label).toBe('MCQ practice');
  });
});

describe('totals', () => {
  it('groups study minutes by subject and excludes non-study blocks from that total', () => {
    const sessions = [
      makeSession({ user_subject_id: 's1', duration_minutes: 30 }),
      makeSession({ user_subject_id: 's1', duration_minutes: 15 }),
      makeSession({ user_subject_id: 's2', duration_minutes: 40 }),
    ];
    const blocks = [makeBlock({ user_subject_id: 's1', duration_minutes: 60, category: 'class' })];
    const summary = summarizeTime(buildTimeline({ sessions, blocks }, TODAY));
    expect(summary.bySubject).toEqual([
      { subjectId: 's1', subjectName: 'Subject', minutes: 45 },
      { subjectId: 's2', subjectName: 'Subject', minutes: 40 },
    ]);
    expect(summary.studyMinutes).toBe(85);
    expect(summary.otherMinutes).toBe(60);
  });

  it('uses provided subject labels when available', () => {
    const session = makeSession({ user_subject_id: 's1' });
    const entry = sessionToEntry(session, { subjectLabels: { s1: 'Physics — 1st Paper' } });
    expect(entry.subjectName).toBe('Physics — 1st Paper');
  });

  it('formats durations readably', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});

describe('overlap detection', () => {
  it('flags two timed entries that claim the same minutes', () => {
    const a = makeSession({
      started_at: `${TODAY}T03:00:00.000Z`,
      ended_at: `${TODAY}T04:00:00.000Z`,
    });
    const b = makeBlock({
      started_at: `${TODAY}T03:30:00.000Z`,
      ended_at: `${TODAY}T04:30:00.000Z`,
    });
    const overlaps = findOverlaps(buildTimeline({ sessions: [a], blocks: [b] }, TODAY));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.overlapMinutes).toBe(30);
  });

  it('accepts back-to-back entries', () => {
    const a = makeSession({ started_at: `${TODAY}T03:00:00.000Z`, ended_at: `${TODAY}T04:00:00.000Z` });
    const b = makeSession({ started_at: `${TODAY}T04:00:00.000Z`, ended_at: `${TODAY}T05:00:00.000Z` });
    expect(findOverlaps(buildTimeline({ sessions: [a, b], blocks: [] }, TODAY))).toHaveLength(0);
  });

  it('does not guess about manual entries without clock times', () => {
    const a = makeSession();
    const b = makeSession();
    expect(findOverlaps(buildTimeline({ sessions: [a, b], blocks: [] }, TODAY))).toHaveLength(0);
  });

  it('ignores impossible ranges instead of throwing', () => {
    const broken = makeSession({ started_at: `${TODAY}T05:00:00.000Z`, ended_at: `${TODAY}T04:00:00.000Z` });
    expect(() => findOverlaps(buildTimeline({ sessions: [broken], blocks: [] }, TODAY))).not.toThrow();
    expect(findOverlaps(buildTimeline({ sessions: [broken], blocks: [] }, TODAY))).toHaveLength(0);
  });
});

describe('duplicate warnings', () => {
  it('warns about an identical manual entry on the same day', () => {
    const existing = makeSession({ duration_minutes: 30, activity_type: 'practice' });
    const candidate = makeSession({ duration_minutes: 30, activity_type: 'practice' });
    expect(findDuplicateCandidates(sessionToEntry(candidate), [sessionToEntry(existing)])).toHaveLength(1);
  });

  it('does not warn when the duration or category differs', () => {
    const existing = makeSession({ duration_minutes: 30, activity_type: 'practice' });
    expect(
      findDuplicateCandidates(sessionToEntry(makeSession({ duration_minutes: 45 })), [sessionToEntry(existing)]),
    ).toHaveLength(0);
    expect(
      findDuplicateCandidates(sessionToEntry(makeSession({ activity_type: 'mcq' })), [sessionToEntry(existing)]),
    ).toHaveLength(0);
  });
});

describe('planned versus actual', () => {
  const week = [day(-1), day(0), day(1)];

  it('marks rest days as rest rather than failure', () => {
    const plans = plannedVsActual({ '1': 60, '2': 0, '3': 90 }, week, []);
    expect(plans).toHaveLength(3);
    const rest = plans.find((plan) => plan.plannedMinutes === 0);
    expect(rest?.isRestDay).toBe(true);
    expect(rest?.deltaMinutes).toBe(0);
  });

  it('computes actual against planned per day', () => {
    const plans = plannedVsActual(
      { '1': 60, '2': 60, '3': 60 },
      [day(0)],
      buildTimeline({ sessions: [makeSession({ session_date: day(0), duration_minutes: 45 })], blocks: [] }, day(0)),
    );
    expect(plans[0]?.actualStudyMinutes).toBe(45);
    expect(plans[0]?.deltaMinutes).toBe(-15);
  });

  it('returns zero plans when no availability is entered', () => {
    const plans = plannedVsActual(null, week, []);
    expect(plans.every((plan) => plan.plannedMinutes === 0 && plan.isRestDay)).toBe(true);
  });
});

describe('timer maths', () => {
  it('uses wall-clock time, so a backgrounded tab does not lose minutes', () => {
    const result = timerResult(`${TODAY}T10:00:00.000Z`, `${TODAY}T10:25:00.000Z`);
    expect(result.minutes).toBe(25);
    expect(result.warnings).toEqual([]);
  });

  it('clamps absurd durations and reports why', () => {
    const result = timerResult(`${TODAY}T10:00:00.000Z`, `${TODAY}T18:00:00.000Z`, 120);
    expect(result.minutes).toBe(120);
    expect(result.warnings).toContain('clamped_to_max');
  });

  it('reports clock skew instead of inventing negative time', () => {
    const result = timerResult(`${TODAY}T10:00:00.000Z`, `${TODAY}T09:00:00.000Z`);
    expect(result.minutes).toBe(0);
    expect(result.warnings).toContain('clock_skew');
  });

  it('rounds a very short tap up to one minute with a flag', () => {
    const result = timerResult(`${TODAY}T10:00:00.000Z`, `${TODAY}T10:00:20.000Z`);
    expect(result.minutes).toBe(1);
    expect(result.warnings).toContain('no_elapsed_time');
  });
});

describe('weekly totals and summaries', () => {
  it('reports a comparison only when a previous week exists', () => {
    const entries = buildTimeline(
      { sessions: [makeSession({ session_date: day(0), duration_minutes: 60 })], blocks: [] },
      day(0),
    );
    const withoutBaseline = weekTotals(entries, day(0), day(6));
    expect(withoutBaseline.previousStudyMinutes).toBeNull();
    expect(withoutBaseline.changeMinutes).toBeNull();

    const previous = buildTimeline(
      { sessions: [makeSession({ session_date: day(-7), duration_minutes: 40 })], blocks: [] },
      day(-7),
    );
    const withBaseline = weekTotals(entries, day(0), day(6), previous);
    expect(withBaseline.previousStudyMinutes).toBe(40);
    expect(withBaseline.changeMinutes).toBe(20);
  });

  it('never reports a percentage-like average without active days', () => {
    expect(weekTotals([], day(0), day(6)).averageStudyMinutesPerActiveDay).toBeNull();
  });

  it('explains an empty day without judgement', () => {
    const summary = endOfDaySummary(TODAY, []);
    expect(summary.hasAnyRecord).toBe(false);
    expect(summary.headline).toContain('Nothing recorded');
    expect(summary.details.join(' ')).toContain('not proof');
  });

  it('summarises a populated day with subjects and overlap warnings', () => {
    const timeline = buildTimeline(
      {
        sessions: [
          makeSession({
            user_subject_id: 's1',
            duration_minutes: 30,
            started_at: `${TODAY}T03:00:00.000Z`,
            ended_at: `${TODAY}T03:30:00.000Z`,
          }),
          makeSession({
            user_subject_id: 's2',
            duration_minutes: 30,
            started_at: `${TODAY}T03:15:00.000Z`,
            ended_at: `${TODAY}T03:45:00.000Z`,
          }),
        ],
        blocks: [makeBlock({ category: 'sleep', duration_minutes: 420 })],
      },
      TODAY,
    );
    const summary = endOfDaySummary(TODAY, timeline);
    expect(summary.studyMinutes).toBe(60);
    expect(summary.otherMinutes).toBe(420);
    expect(summary.headline).toContain('study');
    expect(summary.details.join(' ')).toContain('overlapping');
  });
});
