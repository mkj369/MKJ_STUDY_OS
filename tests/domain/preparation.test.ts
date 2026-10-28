import { describe, expect, it } from 'vitest';
import { buildPreparationPlan, countdownFor } from '@/domain/preparation';
import { day, makeChapter, makeDifficulty, makeExamTarget, makeMistake, makeRevision, makeSession, makeTopic, TODAY } from '../fixtures/factories';

const AVAILABILITY = { '0': 120, '1': 90, '2': 90, '3': 90, '4': 90, '5': 60, '6': 120 };

describe('countdown', () => {
  it('labels the days remaining without inventing urgency', () => {
    expect(countdownFor({ id: 't', title: 'Test', exam_date: day(3) }, TODAY)).toMatchObject({
      daysRemaining: 3,
      urgency: 'this_week',
      label: '3 days left',
      isPast: false,
    });
    expect(countdownFor({ id: 't', title: 'Test', exam_date: TODAY }, TODAY).label).toBe('Today');
    expect(countdownFor({ id: 't', title: 'Test', exam_date: day(1) }, TODAY).label).toBe('Tomorrow');
    expect(countdownFor({ id: 't', title: 'Test', exam_date: day(20) }, TODAY).urgency).toBe('soon');
    expect(countdownFor({ id: 't', title: 'Test', exam_date: day(90) }, TODAY).urgency).toBe('later');
  });

  it('marks a past exam honestly', () => {
    const countdown = countdownFor({ id: 't', title: 'Test', exam_date: day(-2) }, TODAY);
    expect(countdown.isPast).toBe(true);
    expect(countdown.label).toBe('2 days ago');
  });
});

describe('preparation plan', () => {
  const target = makeExamTarget({ exam_date: day(5), user_subject_id: 'subject-1' });

  const baseInput = {
    target,
    today: TODAY,
    chapters: [
      {
        chapter: makeChapter({ id: 'c1', custom_title: 'Dynamics', status: 'in_progress' }),
        title: 'Dynamics',
        status: 'in_progress',
        topics: [makeTopic({ status: 'complete' }), makeTopic({ status: 'in_progress' })],
      },
      {
        chapter: makeChapter({ id: 'c2', custom_title: 'Waves', status: 'complete' }),
        title: 'Waves',
        status: 'complete',
        topics: [makeTopic({ status: 'complete' })],
      },
      {
        chapter: makeChapter({ id: 'c3', custom_title: 'Optics', status: 'not_recorded' }),
        title: 'Optics',
        status: 'not_recorded',
        topics: [makeTopic({ status: 'needs_revision' })],
      },
    ],
    revisions: [
      makeRevision({ user_chapter_id: 'c1', next_review_date: day(0) }),
      makeRevision({ user_chapter_id: 'c2', next_review_date: day(30) }),
    ],
    difficulties: [makeDifficulty({ user_chapter_id: 'c1', status: 'open', severity: 'high' })],
    mistakes: [makeMistake({ user_chapter_id: 'c1', occurred_at: day(-2) })],
    sessions: [makeSession({ activity_type: 'mcq', duration_minutes: 45 })],
    availability: AVAILABILITY,
  };

  it('lists only chapters that still have open work', () => {
    const plan = buildPreparationPlan(baseInput);
    expect(plan.outstanding.map((chapter) => chapter.title)).toEqual(['Dynamics', 'Optics']);
    expect(plan.outstandingCount).toBe(2);
    expect(plan.topicsRemaining).toBe(2);
  });

  it('counts complete topics as done even when the chapter status lags', () => {
    const plan = buildPreparationPlan({
      ...baseInput,
      chapters: [
        {
          chapter: makeChapter({ status: 'not_recorded' }),
          title: 'Motion',
          status: 'not_recorded',
          topics: [makeTopic({ status: 'complete' })],
        },
      ],
    });
    expect(plan.outstanding).toHaveLength(1);
    expect(plan.outstanding[0]?.topicsRemaining).toBe(0);
  });

  it('surfaces upcoming revisions inside a fortnight only', () => {
    const plan = buildPreparationPlan(baseInput);
    expect(plan.upcomingRevisions).toHaveLength(1);
    expect(plan.upcomingRevisions[0]).toMatchObject({ chapterId: 'c1', daysUntilDue: 0 });
  });

  it('derives weak areas from records, with their source named', () => {
    const plan = buildPreparationPlan(baseInput);
    const kinds = plan.weakAreas.map((area) => area.kind);
    expect(kinds).toContain('difficulty');
    expect(kinds).toContain('mistake');
    expect(kinds).toContain('topic');
    expect(plan.weakAreas[0]?.severity).toBe('high');
  });

  it('never includes resolved difficulties or resolved mistakes', () => {
    const plan = buildPreparationPlan({
      ...baseInput,
      difficulties: [makeDifficulty({ status: 'resolved' })],
      mistakes: [makeMistake({ is_resolved: true })],
    });
    expect(plan.weakAreas.every((area) => area.kind === 'topic')).toBe(true);
  });

  it('sizes the draft to the stated availability', () => {
    const plan = buildPreparationPlan(baseInput);
    expect(plan.draft.length).toBeGreaterThan(0);
    expect(plan.draftMinutes).toBeLessThanOrEqual(plan.capacityMinutes);
    for (const task of plan.draft) {
      expect(task.date >= TODAY && task.date <= target.exam_date).toBe(true);
    }
  });

  it('does not silently drop work that does not fit', () => {
    const plan = buildPreparationPlan({ ...baseInput, availability: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } });
    expect(plan.draft).toHaveLength(0);
    expect(plan.warnings.join(' ')).toContain('Not enough availability');
  });

  it('warns when no availability was entered rather than pretending to plan', () => {
    const plan = buildPreparationPlan({ ...baseInput, availability: null });
    expect(plan.warnings.join(' ')).toContain('No study availability entered');
  });

  it('flags a past exam date instead of planning into the past', () => {
    const plan = buildPreparationPlan({ ...baseInput, target: makeExamTarget({ exam_date: day(-3) }) });
    expect(plan.draft).toEqual([]);
    expect(plan.warnings.join(' ')).toContain('already passed');
  });

  it('scopes to the exam subject when one is chosen', () => {
    const plan = buildPreparationPlan({
      ...baseInput,
      target: makeExamTarget({ exam_date: day(5), user_subject_id: 'subject-1' }),
      chapters: [
        ...baseInput.chapters,
        {
          chapter: makeChapter({ id: 'c9', user_subject_id: 'subject-2', custom_title: 'Chemistry' }),
          title: 'Chemistry',
          status: 'not_recorded',
          topics: [],
        },
      ],
    });
    expect(plan.outstanding.every((chapter) => chapter.chapterId !== 'c9')).toBe(true);
  });

  it('reports coverage as a count, never a predicted mark', () => {
    const plan = buildPreparationPlan(baseInput);
    expect(plan.coveragePercent).toBe(33);
    expect(plan.disclaimer).toContain('not a prediction of marks');
    expect(JSON.stringify(plan)).not.toMatch(/predicted (mark|grade|score)/i);
  });

  it('reports practice minutes from recorded sessions only', () => {
    const plan = buildPreparationPlan(baseInput);
    expect(plan.practiceMinutes).toBe(45);
  });

  it('says plainly when there are no chapters yet', () => {
    const plan = buildPreparationPlan({ ...baseInput, chapters: [] });
    expect(plan.coveragePercent).toBeNull();
    expect(plan.warnings.join(' ')).toContain('No chapters recorded');
  });
});
