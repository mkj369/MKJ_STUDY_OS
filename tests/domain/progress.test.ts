import { describe, expect, it } from 'vitest';
import {
  chapterStatusLabel,
  computeChapterProgress,
  computeChecklistSummary,
  computeExamSummary,
  computeLectureProgress,
  computeRevisionSummary,
  computeSubjectProgress,
  examPercent,
  safePercent,
  suggestNextReviewDate,
  type ChapterContext,
} from '@/domain/progress';
import {
  day,
  makeChapter,
  makeChecklistItem,
  makeDifficulty,
  makeExam,
  makeLecture,
  makeProgress,
  makeRevision,
  makeSession,
  makeTask,
  TODAY,
} from '../fixtures/factories';

function context(overrides: Partial<ChapterContext> = {}): ChapterContext {
  return {
    chapter: makeChapter(),
    checklist: [],
    lectures: [],
    sessions: [],
    revisions: [],
    difficulties: [],
    mistakes: [],
    tasks: [],
    exams: [],
    ...overrides,
  };
}

describe('checklist summary', () => {
  it('computes a percentage with the denominator exposed', () => {
    const items = [1, 2, 3, 4].map((n) => {
      const item = makeChecklistItem({ sort_order: n });
      return { item, progress: n <= 2 ? makeProgress({ checklist_item_id: item.id, is_done: true }) : null };
    });
    const summary = computeChecklistSummary(items);
    expect(summary.done).toBe(2);
    expect(summary.total).toBe(4);
    expect(summary.percent).toBe(50);
  });

  it('never shows 0% when there is no denominator', () => {
    const summary = computeChecklistSummary([]);
    expect(summary.percent).toBeNull();
    expect(summary.total).toBe(0);
  });

  it('ignores archived items', () => {
    const kept = makeChecklistItem();
    const archived = makeChecklistItem({ is_archived: true });
    const summary = computeChecklistSummary([
      { item: kept, progress: makeProgress({ checklist_item_id: kept.id }) },
      { item: archived, progress: null },
    ]);
    expect(summary.total).toBe(1);
    expect(summary.done).toBe(1);
  });

  it('treats a missing progress row as not done', () => {
    const item = makeChecklistItem();
    const summary = computeChecklistSummary([{ item, progress: null }]);
    expect(summary.done).toBe(0);
    expect(summary.pendingKinds).toEqual(['reading']);
  });
});

describe('lecture progress', () => {
  it('refuses to invent a target', () => {
    const result = computeLectureProgress([makeLecture(), makeLecture()], null);
    expect(result.completed).toBe(2);
    expect(result.percent).toBeNull();
    expect(result.label).toContain('no target set');
  });

  it('computes percentage only when a positive target exists', () => {
    const lectures = Array.from({ length: 7 }, () => makeLecture());
    const result = computeLectureProgress(lectures, 10);
    expect(result.percent).toBe(70);
    expect(result.remaining).toBe(3);
    expect(computeLectureProgress(lectures, 0).percent).toBeNull();
  });

  it('counts only completed lectures', () => {
    const result = computeLectureProgress([makeLecture({ is_completed: true }), makeLecture({ is_completed: false })], 4);
    expect(result.completed).toBe(1);
    expect(result.logged).toBe(2);
    expect(result.percent).toBe(25);
  });
});

describe('revision rules', () => {
  it('returns no due state without revisions', () => {
    const summary = computeRevisionSummary([], TODAY);
    expect(summary.dueState).toBe('none');
    expect(summary.nextDate).toBeNull();
  });

  it('flags an overdue recorded review date', () => {
    const summary = computeRevisionSummary(
      [makeRevision({ revised_at: day(-5), next_review_date: day(-2), confidence_rating: 4 })],
      TODAY,
    );
    expect(summary.dueState).toBe('overdue');
    expect(summary.nextDateSource).toBe('recorded');
    expect(summary.daysUntilNext).toBe(-2);
  });

  it('marks today as due_today', () => {
    const summary = computeRevisionSummary([makeRevision({ next_review_date: TODAY })], TODAY);
    expect(summary.dueState).toBe('due_today');
    expect(summary.daysUntilNext).toBe(0);
  });

  it('suggests from the latest confidence when no date is recorded', () => {
    const summary = computeRevisionSummary([makeRevision({ revised_at: day(-1), confidence_rating: 5 })], TODAY);
    expect(summary.nextDateSource).toBe('suggested');
    expect(summary.nextDate).toBe(day(13));
  });

  it('uses a transparent baseline schedule', () => {
    expect(suggestNextReviewDate(TODAY, 1)).toBe(day(1));
    expect(suggestNextReviewDate(TODAY, 2)).toBe(day(1));
    expect(suggestNextReviewDate(TODAY, 3)).toBe(day(3));
    expect(suggestNextReviewDate(TODAY, 4)).toBe(day(7));
    expect(suggestNextReviewDate(TODAY, 5)).toBe(day(14));
    // Out-of-range confidence is clamped rather than extrapolated.
    expect(suggestNextReviewDate(TODAY, 99)).toBe(day(14));
    expect(suggestNextReviewDate(TODAY, 0)).toBe(day(1));
  });

  it('takes the earliest recorded future review date', () => {
    const summary = computeRevisionSummary(
      [
        makeRevision({ revised_at: day(-1), next_review_date: day(10) }),
        makeRevision({ revised_at: day(-2), next_review_date: day(3) }),
      ],
      TODAY,
    );
    expect(summary.nextDate).toBe(day(3));
  });
});

describe('exam maths', () => {
  it('never divides by zero', () => {
    expect(examPercent({ marks_obtained: 10, total_marks: 0 })).toBeNull();
    expect(safePercent(1, 0)).toBeNull();
    expect(safePercent(0, 50)).toBe(0);
  });

  it('computes percentage with one decimal', () => {
    expect(examPercent({ marks_obtained: 35, total_marks: 50 })).toBe(70);
    expect(examPercent({ marks_obtained: 1, total_marks: 3 })).toBe(33.3);
  });

  it('summarises average, latest and trend from entered results only', () => {
    const summary = computeExamSummary([
      makeExam({ exam_date: day(-20), marks_obtained: 30, total_marks: 50 }),
      makeExam({ exam_date: day(-2), marks_obtained: 45, total_marks: 50 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.latestPercent).toBe(90);
    expect(summary.averagePercent).toBe(75);
    expect(summary.trend).toBe('improving');
  });

  it('reports unknown trend with a single result', () => {
    expect(computeExamSummary([makeExam()]).trend).toBe('unknown');
    expect(computeExamSummary([]).averagePercent).toBeNull();
  });
});

describe('chapter status derivation', () => {
  it('reports "not recorded" and never "not studied" for an empty chapter', () => {
    const progress = computeChapterProgress(context(), { today: TODAY });
    expect(progress.status).toBe('not_recorded');
    expect(progress.hasAnyRecord).toBe(false);
    expect(progress.flags.map((f) => f.code)).toContain('no_records');
    expect(progress.statusExplanation).toContain('does not mean it is unstudied');
  });

  it('respects an explicit "not started" label', () => {
    const progress = computeChapterProgress(context({ chapter: makeChapter({ status: 'not_started' }) }), { today: TODAY });
    expect(progress.status).toBe('not_started');
    expect(progress.derivedStatus).toBe('not_started');
  });

  it('respects a declared complete status but exposes the derived one', () => {
    const progress = computeChapterProgress(context({ chapter: makeChapter({ status: 'complete' }) }), { today: TODAY });
    expect(progress.status).toBe('complete');
    // The explicit label is respected, and the UI says so in plain language.
    expect(progress.statusExplanation).toContain('You marked this chapter complete');
    expect(progress.derivedStatus).toBe('complete');
  });

  it('does not treat a full checklist as mastery', () => {
    const items = ['reading', 'custom'].map((kind, index) => {
      const item = makeChecklistItem({ kind: kind as 'reading' | 'custom', sort_order: index });
      return { item, progress: makeProgress({ checklist_item_id: item.id, is_done: true }) };
    });
    const progress = computeChapterProgress(
      context({
        checklist: items,
        sessions: [makeSession({ activity_type: 'practice' })],
      }),
      { today: TODAY },
    );
    expect(progress.checklist.percent).toBe(100);
    expect(progress.status).toBe('in_progress');
  });

  it('becomes complete with a full checklist and a strong recorded result', () => {
    const items = ['reading', 'practice', 'mcq'].map((kind, index) => {
      const item = makeChecklistItem({ kind: kind as 'reading' | 'practice' | 'mcq', sort_order: index });
      return { item, progress: makeProgress({ checklist_item_id: item.id, is_done: true }) };
    });
    const progress = computeChapterProgress(
      context({
        checklist: items,
        sessions: [makeSession()],
        exams: [makeExam({ marks_obtained: 45, total_marks: 50 })],
      }),
      { today: TODAY },
    );
    expect(progress.status).toBe('complete');
    expect(progress.statusExplanation).toContain('strong recorded test result');
  });

  it('needs practice when a practice item is ticked without a session', () => {
    const practice = makeChecklistItem({ kind: 'practice' });
    const progress = computeChapterProgress(
      context({
        checklist: [{ item: practice, progress: makeProgress({ checklist_item_id: practice.id, is_done: true }) }],
        lectures: [makeLecture()],
      }),
      { today: TODAY },
    );
    expect(progress.status).toBe('needs_practice');
    const flag = progress.flags.find((f) => f.code === 'practice_unchecked');
    expect(flag?.kind).toBe('evidence');
    expect(flag?.reason).toContain('no practice session is recorded');
  });

  it('needs practice for an open difficulty and explains the evidence', () => {
    const progress = computeChapterProgress(
      context({ lectures: [makeLecture()], difficulties: [makeDifficulty({ severity: 'high' })] }),
      { today: TODAY },
    );
    expect(progress.status).toBe('needs_practice');
    expect(progress.highestOpenSeverity).toBe('high');
    const flag = progress.flags.find((f) => f.code === 'difficulty_open');
    expect(flag?.severity).toBe('high');
    expect(flag?.reason).toContain('Projectile range');
  });

  it('resolved difficulties do not block the status', () => {
    const progress = computeChapterProgress(
      context({
        lectures: [makeLecture()],
        sessions: [makeSession()],
        difficulties: [makeDifficulty({ status: 'resolved', resolved_at: `${TODAY}T09:00:00Z` })],
      }),
      { today: TODAY },
    );
    expect(progress.status).toBe('in_progress');
    expect(progress.resolvedDifficulties).toBe(1);
  });

  it('needs revision when the next review date passed', () => {
    const progress = computeChapterProgress(
      context({
        lectures: [makeLecture()],
        sessions: [makeSession()],
        revisions: [makeRevision({ revised_at: day(-4), next_review_date: day(-1) })],
      }),
      { today: TODAY },
    );
    expect(progress.status).toBe('needs_revision');
    expect(progress.flags.map((f) => f.code)).toContain('revision_overdue');
  });

  it('needs revision when the last revision is stale', () => {
    const progress = computeChapterProgress(
      context({
        lectures: [makeLecture()],
        sessions: [makeSession()],
        revisions: [makeRevision({ revised_at: day(-30), confidence_rating: 4 })],
      }),
      { today: TODAY },
    );
    // The suggested date (7 days after revision) is long overdue.
    expect(progress.status).toBe('needs_revision');
    expect(progress.flags.map((f) => f.code)).toContain('revision_overdue');
  });

  it('flags an unmet lecture target without inferring a total', () => {
    const progress = computeChapterProgress(
      context({ chapter: makeChapter({ lecture_target_count: 5 }), lectures: [makeLecture()] }),
      { today: TODAY },
    );
    const flag = progress.flags.find((f) => f.code === 'lecture_target_unmet');
    expect(flag?.label).toBe('Lecture target 1/5');
    expect(progress.lectures.percent).toBe(20);
  });

  it('flags a low recorded result as evidence, not a prediction', () => {
    const progress = computeChapterProgress(
      context({ lectures: [makeLecture()], exams: [makeExam({ marks_obtained: 10, total_marks: 50 })] }),
      { today: TODAY },
    );
    const flag = progress.flags.find((f) => f.code === 'low_exam_result');
    expect(flag?.reason).toContain('not a prediction');
  });

  it('flags stale activity as missing data, not inactivity', () => {
    const openItem = makeChecklistItem();
    const progress = computeChapterProgress(
      context({ lectures: [makeLecture({ lecture_date: day(-40) })], checklist: [{ item: openItem, progress: null }] }),
      { today: TODAY },
    );
    const flag = progress.flags.find((f) => f.code === 'stale_activity');
    expect(flag?.kind).toBe('missing_data');
    expect(flag?.reason).toContain('not proof of inactivity');
  });

  it('exposes a readable label for every status', () => {
    expect(chapterStatusLabel('needs_revision')).toBe('Needs revision');
    expect(chapterStatusLabel('not_recorded')).toBe('Not recorded');
  });
});

describe('subject aggregation', () => {
  it('averages checklist percentages only where denominators exist', () => {
    const withChecklist = makeChapter({ id: 'c1' });
    const withoutChecklist = makeChapter({ id: 'c2' });
    const item = makeChecklistItem({ user_chapter_id: 'c1' });
    const progress = computeSubjectProgress({
      userSubjectId: 'subject-1',
      chapters: [
        context({ chapter: withChecklist, checklist: [{ item, progress: makeProgress({ checklist_item_id: item.id }) }] }),
        context({ chapter: withoutChecklist }),
      ],
      tasks: [],
      today: TODAY,
    });
    expect(progress.chapterCount).toBe(2);
    expect(progress.checklistPercent).toBe(100);
    expect(progress.chaptersNotRecorded).toBe(1);
  });

  it('explains attention scores from records', () => {
    const progress = computeSubjectProgress({
      userSubjectId: 'subject-1',
      chapters: [
        context({
          lectures: [makeLecture()],
          sessions: [makeSession()],
          difficulties: [makeDifficulty({ severity: 'high' })],
        }),
      ],
      tasks: [makeTask({ due_date: day(-1) }), makeTask()],
      today: TODAY,
    });
    expect(progress.attentionScore).toBeGreaterThan(0);
    expect(progress.attentionReasons.join(' ')).toMatch(/high-severity|overdue/);
    expect(progress.overdueTasks).toBe(1);
  });

  it('does not imply activity without records', () => {
    const progress = computeSubjectProgress({ userSubjectId: 'subject-1', chapters: [context()], tasks: [], today: TODAY });
    expect(progress.lastActivityDate).toBeNull();
    expect(progress.attentionReasons).toEqual(['No evidence-based gaps flagged']);
  });
});
