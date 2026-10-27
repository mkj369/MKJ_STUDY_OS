import { describe, expect, it } from 'vitest';
import { buildInsights, type InsighsInput } from '@/domain/insights';
import { analyzeMistakes } from '@/domain/mistakes';
import { buildRevisionQueue } from '@/domain/revisions';
import { summarizePractice } from '@/domain/practice';
import { summarizeTasks } from '@/domain/tasks';
import { buildTimeline, summarizeTime } from '@/domain/timeTracking';
import { countdownFor } from '@/domain/preparation';
import { day, makeAttempt, makeExamTarget, makeMistake, makeQuestion, makeRevision, makeSession, makeTask, TODAY } from '../fixtures/factories';

function buildInput(overrides: Partial<InsighsInput> = {}): InsighsInput {
  const entries = buildTimeline(
    { sessions: [makeSession({ duration_minutes: 90 })], blocks: [] },
    TODAY,
  );
  return {
    today: TODAY,
    subjects: [
      {
        subjectId: 'subject-1',
        chapters: 4,
        chaptersComplete: 1,
        chaptersStarted: 2,
        chaptersNotRecorded: 2,
        chapterPercent: 25,
        topics: 10,
        topicsComplete: 3,
        topicPercent: 30,
        activityPercent: 20,
      },
    ],
    todayTime: summarizeTime(entries),
    weekTime: summarizeTime(entries),
    activeStudyDaysThisWeek: 1,
    taskCounts: summarizeTasks([makeTask()], TODAY),
    revisionQueue: buildRevisionQueue(
      [
        {
          userChapterId: 'c1',
          userSubjectId: 'subject-1',
          chapterTitle: 'Dynamics',
          subjectName: 'Physics',
          revisions: [makeRevision({ next_review_date: day(-2), confidence_rating: 2 })],
        },
      ],
      TODAY,
    ),
    mistakes: analyzeMistakes([makeMistake({ occurred_at: day(-3) })]),
    practice: summarizePractice([makeQuestion()], [makeAttempt({ is_correct: false })]),
    examCountdowns: [countdownFor(makeExamTarget({ exam_date: day(9) }), TODAY)],
    chaptersWithRecords: 2,
    chaptersTotal: 4,
    availabilityMinutesThisWeek: 300,
    ...overrides,
  };
}

describe('insights', () => {
  it('separates observed, calculated, interpreted and missing', () => {
    const insights = buildInsights(buildInput());
    expect(insights.observed.length).toBeGreaterThan(0);
    expect(insights.calculated.length).toBeGreaterThan(0);
    expect(insights.interpretations.length).toBeGreaterThan(0);
    expect(insights.missing.length).toBeGreaterThan(0);
  });

  it('states the evidence behind an interpretation', () => {
    const insights = buildInsights(buildInput());
    const overdue = insights.interpretations.find((item) => item.statement.includes('Dynamics'));
    expect(overdue?.evidence.join(' ')).toContain('Next review');
    expect(overdue?.caveat).toContain('not about your ability');
    expect(overdue?.confidence).toBe('medium');
  });

  it('never treats missing records as failure', () => {
    const insights = buildInsights(buildInput());
    const text = insights.missing.join(' ');
    expect(text).toContain('not proof of inactivity');
    expect(text).not.toMatch(/\byou (failed|didn't study|were lazy)\b/i);
  });

  it('works with an empty workspace', () => {
    const insights = buildInsights(
      buildInput({
        subjects: [],
        todayTime: summarizeTime([]),
        weekTime: summarizeTime([]),
        activeStudyDaysThisWeek: 0,
        taskCounts: summarizeTasks([], TODAY),
        revisionQueue: [],
        mistakes: analyzeMistakes([]),
        practice: summarizePractice([], []),
        examCountdowns: [],
        chaptersWithRecords: 0,
        chaptersTotal: 0,
        availabilityMinutesThisWeek: 0,
      }),
    );
    expect(insights.missing).toContain('No study sessions recorded this week.');
    expect(insights.missing).toContain('No graded practice attempts yet, so accuracy is not recorded.');
    expect(insights.nextSteps[0]?.title).toBe('Keep logging what you actually do');
    expect(insights.interpretations).toEqual([]);
  });

  it('reports chapters with records as a fraction, not a grade', () => {
    const insights = buildInsights(buildInput());
    const row = insights.calculated.find((item) => item.label === 'Chapters with any record');
    expect(row?.value).toBe('2/4 (50%)');
  });

  it('says availability is not recorded instead of inventing a target', () => {
    const insights = buildInsights(buildInput({ availabilityMinutesThisWeek: 0 }));
    const row = insights.calculated.find((item) => item.label.includes('availability'));
    expect(row?.value).toBe('No availability entered');
  });

  it('surfaces overdue revisions and overdue tasks as next steps', () => {
    const insights = buildInsights(
      buildInput({ taskCounts: summarizeTasks([makeTask({ due_date: day(-3), status: 'todo' })], TODAY) }),
    );
    const titles = insights.nextSteps.map((step) => step.title);
    expect(titles).toContain('Revise Dynamics');
    expect(titles).toContain('Reschedule or shrink the overdue tasks');
  });

  it('flags a crowded plan as an interpretation, not a verdict', () => {
    const tasks = Array.from({ length: 3 }, () => makeTask({ due_date: day(-1), status: 'todo' }));
    const insights = buildInsights(buildInput({ taskCounts: summarizeTasks(tasks, TODAY) }));
    const statement = insights.interpretations.find((item) => item.statement.includes('larger than the time'));
    expect(statement?.caveat).toContain('the week changed');
  });

  it('keeps AI recommendations out of the deterministic output', () => {
    const insights = buildInsights(buildInput());
    const serialised = JSON.stringify(insights);
    expect(serialised).not.toContain('ai_recommendation');
    expect(Object.keys(insights)).toEqual(['observed', 'calculated', 'interpretations', 'missing', 'nextSteps']);
  });
});
