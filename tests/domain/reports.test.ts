import { describe, expect, it } from 'vitest';
import { buildWeeklyReport, reportWeekLabel } from '@/domain/reports';
import { weekRange } from '@/domain/dates';
import {
  day,
  makeChapter,
  makeChecklistItem,
  makeDifficulty,
  makeExam,
  makeLecture,
  makeMistake,
  makeProgress,
  makeRevision,
  makeSession,
  makeSubject,
  makeTask,
  TODAY,
  USER_ID,
} from '../fixtures/factories';
import type { WeeklyReportInput } from '@/domain/reports';

const { start, end } = weekRange(TODAY);

function emptyInput(overrides: Partial<WeeklyReportInput> = {}): WeeklyReportInput {
  return {
    weekStart: start,
    today: TODAY,
    subjects: [],
    chapters: [],
    checklistItems: [],
    checklistProgress: [],
    lectures: [],
    sessions: [],
    revisions: [],
    difficulties: [],
    mistakes: [],
    tasks: [],
    exams: [],
    generatedAt: `${TODAY}T12:00:00.000Z`,
    ...overrides,
  };
}

function populatedInput(): WeeklyReportInput {
  const subject = makeSubject({ id: 'subject-1' });
  const chapter = makeChapter({ id: 'chapter-1', user_subject_id: 'subject-1', custom_title: 'Motion' });
  const item = makeChecklistItem({ id: 'item-1', user_chapter_id: 'chapter-1', label: 'Main book reading' });
  return emptyInput({
    subjects: [subject],
    chapters: [chapter],
    checklistItems: [item],
    checklistProgress: [
      makeProgress({ checklist_item_id: 'item-1', completed_at: `${start}T08:00:00.000Z`, is_done: true }),
    ],
    lectures: [
      makeLecture({ user_subject_id: 'subject-1', user_chapter_id: 'chapter-1', lecture_date: start, is_completed: true }),
    ],
    sessions: [
      makeSession({ user_subject_id: 'subject-1', user_chapter_id: 'chapter-1', session_date: start, duration_minutes: 45 }),
      makeSession({ user_subject_id: 'subject-1', user_chapter_id: 'chapter-1', session_date: day(1), duration_minutes: 30 }),
      // Previous week — used only for the comparison metric.
      makeSession({ user_subject_id: 'subject-1', user_chapter_id: 'chapter-1', session_date: day(-7), duration_minutes: 60 }),
    ],
    revisions: [
      makeRevision({
        user_subject_id: 'subject-1',
        user_chapter_id: 'chapter-1',
        revised_at: start,
        next_review_date: day(-1),
        confidence_rating: 3,
      }),
    ],
    difficulties: [
      makeDifficulty({
        user_subject_id: 'subject-1',
        user_chapter_id: 'chapter-1',
        topic_name: 'Projectile range',
        severity: 'high',
        created_at: `${start}T09:00:00.000Z`,
      }),
    ],
    mistakes: [makeMistake({ user_subject_id: 'subject-1', user_chapter_id: 'chapter-1', occurred_at: start })],
    tasks: [
      makeTask({
        title: 'Practise numericals',
        status: 'done',
        completed_at: `${start}T10:00:00.000Z`,
        created_at: `${start}T07:00:00.000Z`,
      }),
      makeTask({ title: 'Read chapter 3', due_date: day(-2), created_at: `${start}T07:30:00.000Z` }),
    ],
    exams: [makeExam({ user_subject_id: 'subject-1', exam_date: start, marks_obtained: 40, total_marks: 50 })],
  });
}

describe('deterministic weekly report', () => {
  it('builds a complete payload with no AI and no network', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    expect(payload.summary.length).toBeGreaterThan(0);
    expect(payload.observed_facts.length).toBe(7);
    expect(payload.disclaimer).toContain('not an official assessment');
    expect(payload.week).toEqual({ start, end });
    expect(payload.generated_at).toBe(`${TODAY}T12:00:00.000Z`);
  });

  it('separates observed facts from interpretations', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    expect(payload.observed_facts.map((f) => f.label)).toContain('Study sessions recorded');
    expect(payload.possible_gaps.every((gap) => gap.evidence.length > 0)).toBe(true);
    expect(payload.recommendations.every((rec) => rec.evidence.length > 0)).toBe(true);
  });

  it('states "no sessions recorded" rather than "you did not study"', () => {
    const { payload } = buildWeeklyReport(emptyInput());
    expect(payload.summary).toContain('No study sessions are recorded this week');
    expect(payload.missing_data).toContain('No study sessions recorded for this week.');
    expect(JSON.stringify(payload)).not.toContain('You did not study');
  });

  it('always includes the not-recorded disclaimer', () => {
    const { payload } = buildWeeklyReport(emptyInput());
    expect(payload.missing_data.at(-1)).toContain('not recorded');
  });

  it('computes metrics only from this week', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    expect(payload.metrics.studyMinutes).toBe(75);
    expect(payload.metrics.studyMinutesPrevious).toBe(60);
    expect(payload.metrics.sessionsLogged).toBe(2);
    expect(payload.metrics.activeDays).toBe(2);
    expect(payload.metrics.lecturesCompleted).toBe(1);
    expect(payload.metrics.tasksCompleted).toBe(1);
    expect(payload.metrics.averageExamPercent).toBe(80);
    expect(payload.metrics.chaptersWithRecords).toBe(1);
  });

  it('flags an overdue revision with the exact date as evidence', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    const recommendation = payload.recommendations.find((r) => r.title.includes('Revise Motion'));
    expect(recommendation).toBeTruthy();
    expect(recommendation?.evidence.join(' ')).toContain(day(-1));
    expect(recommendation?.priority).toBe('high');
  });

  it('turns a high-severity difficulty into a concrete suggested task', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    const task = payload.suggested_tasks.find((t) => t.title.includes('Projectile range'));
    expect(task?.estimated_minutes).toBeLessThanOrEqual(60);
    expect(task?.user_chapter_id).toBe('chapter-1');
    expect(task?.reason).toContain('high-severity');
  });

  it('flags an overdue task and offers rescheduling, not deletion', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    const gap = payload.possible_gaps.find((g) => g.code === 'overdue_task');
    expect(gap?.label).toContain('1 overdue task');
    expect(payload.recommendations.some((r) => r.title.includes('Reschedule'))).toBe(true);
  });

  it('never emits more than five recommendations or suggested tasks', () => {
    const input = populatedInput();
    input.difficulties = Array.from({ length: 12 }, (_, i) =>
      makeDifficulty({ topic_name: `Topic ${i}`, severity: 'high', created_at: `${start}T09:00:00.000Z` }),
    );
    input.tasks = Array.from({ length: 12 }, () => makeTask({ due_date: day(-5) }));
    const { payload } = buildWeeklyReport(input);
    expect(payload.recommendations.length).toBeLessThanOrEqual(5);
    expect(payload.suggested_tasks.length).toBeLessThanOrEqual(5);
    expect(payload.possible_gaps.length).toBeLessThanOrEqual(6);
  });

  it('does not invent marks or averages when none exist', () => {
    const { payload } = buildWeeklyReport(emptyInput());
    expect(payload.metrics.averageExamPercent).toBeNull();
    expect(payload.metrics.examsRecorded).toBe(0);
  });

  it('keeps every suggested task small and explained', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    expect(payload.suggested_tasks.length).toBeGreaterThan(0);
    expect(payload.suggested_tasks.length).toBeLessThanOrEqual(payload.recommendations.length);
    for (const task of payload.suggested_tasks) {
      expect(task.reason.trim().length).toBeGreaterThan(0);
      expect(task.estimated_minutes).toBeGreaterThanOrEqual(5);
      expect(task.estimated_minutes).toBeLessThanOrEqual(180);
    }
  });

  it('is deterministic for the same input', () => {
    const a = buildWeeklyReport(populatedInput()).payload;
    const b = buildWeeklyReport(populatedInput()).payload;
    // IDs are generated by the factory in a different order, so compare text.
    expect(a.summary).toBe(b.summary);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.recommendations.map((r) => r.title)).toEqual(b.recommendations.map((r) => r.title));
  });

  it('labels the week range for display', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    const label = reportWeekLabel(payload);
    expect(label).toContain(start);
    expect(label).toContain(end);
    expect(label).toContain('7 days');
  });

  it('gives a stable chapter count when chapters have no records', () => {
    const subject = makeSubject({ id: 'subject-1' });
    const { payload } = buildWeeklyReport(
      emptyInput({
        subjects: [subject],
        chapters: [
          makeChapter({ id: 'a', user_subject_id: 'subject-1' }),
          makeChapter({ id: 'b', user_subject_id: 'subject-1' }),
        ],
      }),
    );
    expect(payload.metrics.chaptersWithRecords).toBe(0);
    expect(payload.metrics.chaptersWithoutRecords).toBe(2);
  });

  it('does not use the user id in generated prose', () => {
    const { payload } = buildWeeklyReport(populatedInput());
    expect(JSON.stringify(payload)).not.toContain(USER_ID);
  });
});
