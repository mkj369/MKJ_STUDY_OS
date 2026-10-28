import { describe, expect, it } from 'vitest';
import { buildRevisionQueue, CONFIDENCE_LABELS, REVISION_METHOD_LABELS } from '@/domain/revisions';
import { computeRevisionSummary } from '@/domain/progress';
import { day, makeRevision, TODAY } from '../fixtures/factories';

function entry(title: string, revisions = [] as ReturnType<typeof makeRevision>[]) {
  return {
    userChapterId: `chapter-${title}`,
    userSubjectId: 'subject-1',
    chapterTitle: title,
    subjectName: 'Physics',
    revisions,
  };
}

describe('revision queue', () => {
  it('sorts by days until due, earliest first', () => {
    const queue = buildRevisionQueue(
      [
        entry('later', [makeRevision({ revised_at: day(-1), next_review_date: day(9) })]),
        entry('overdue', [makeRevision({ revised_at: day(-6), next_review_date: day(-2) })]),
        entry('today', [makeRevision({ revised_at: day(-1), next_review_date: TODAY })]),
        entry('week', [makeRevision({ revised_at: day(-1), next_review_date: day(3) })]),
      ],
      TODAY,
    );
    expect(queue.map((q) => q.chapterTitle)).toEqual(['overdue', 'today', 'week', 'later']);
    expect(queue.map((q) => q.bucket)).toEqual(['overdue', 'today', 'this_week', 'later']);
  });

  it('omits chapters with no revision records entirely', () => {
    const queue = buildRevisionQueue([entry('never revised'), entry('revised', [makeRevision()])], TODAY);
    expect(queue.map((q) => q.chapterTitle)).not.toContain('never revised');
    expect(queue).toHaveLength(1);
  });

  it('shows exactly which date drives the badge', () => {
    const queue = buildRevisionQueue([entry('chapter', [makeRevision({ revised_at: day(-2), confidence_rating: 3 })])], TODAY);
    expect(queue[0]?.summary.nextDateSource).toBe('suggested');
    expect(queue[0]?.summary.nextDate).toBe(day(1));
    expect(queue[0]?.daysUntilDue).toBe(1);
  });
});

describe('revision labels', () => {
  it('keeps every method label human readable', () => {
    expect(Object.keys(REVISION_METHOD_LABELS)).toEqual(['recall', 'notes_reread', 'practice', 'flashcards', 'mock']);
    expect(REVISION_METHOD_LABELS.recall).toBe('Active recall');
  });

  it('has a label for every confidence level 1-5', () => {
    for (let i = 1; i <= 5; i += 1) expect(CONFIDENCE_LABELS[i]).toBeTruthy();
  });

  it('keeps the summary consistent with the queue', () => {
    const revisions = [makeRevision({ revised_at: day(-3), next_review_date: day(-1) })];
    const summary = computeRevisionSummary(revisions, TODAY);
    expect(summary.dueState).toBe('overdue');
    expect(summary.daysSinceLast).toBe(3);
  });
});
