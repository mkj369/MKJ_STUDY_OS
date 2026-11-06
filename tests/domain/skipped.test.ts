import { describe, expect, it } from 'vitest';
import { computeChapterProgress, computeSubjectProgress } from '@/domain/progress';
import { buildWorkspaceView, subjectChapterStats } from '@/features/shared/selectors';
import type { UserDataBundle } from '@/services/repository';
import type { UserChapter } from '@/types/domain';
import {
  makeChapter,
  makeChecklistItem,
  makeDifficulty,
  makePreferences,
  makeProfile,
  makeProgress,
  makeSubject,
  TODAY,
  USER_ID,
} from '../fixtures/factories';

/**
 * "Skipped" means deliberately out of the student's plan. The rule under test
 * everywhere: a skipped chapter never lowers a completion percentage, never
 * raises an attention alert, and keeps every underlying record intact so
 * un-skipping restores the previous state exactly.
 */

function ctx(chapter = makeChapter(), extra: Record<string, unknown> = {}) {
  return {
    chapter,
    checklist: [],
    lectures: [],
    sessions: [],
    revisions: [],
    difficulties: [],
    mistakes: [],
    tasks: [],
    exams: [],
    ...extra,
  } as Parameters<typeof computeChapterProgress>[0];
}

function makeBundle(chapters: UserChapter[]): UserDataBundle {
  const subject = makeSubject({ id: 'subject-1' });
  return {
    subjects: [subject],
    chapters,
    checklistItems: [],
    checklistProgress: [],
    lectures: [],
    lectureChecklist: [],
    studyTargets: [],
    userPreferences: { user_id: USER_ID, theme: 'system', community_opt_in_seen: false, updated_at: `${TODAY}T00:00:00.000Z` },
    communityProfile: null,
    sessions: [],
    dailyBlocks: [],
    focusSessions: [],
    examTargets: [],
    practiceQuestions: [],
    practiceAttempts: [],
    topics: [],
    revisions: [],
    difficulties: [],
    mistakes: [],
    tasks: [],
    exams: [],
    resources: [],
    notes: [],
    summaries: [],
    curriculum: { versions: [], subjects: [], chapters: [], topics: [] },
    profile: makeProfile(),
    reminderPreferences: makePreferences(),
    reminderEvents: [],
  };
}

describe('skipped chapters: status derivation', () => {
  it('respects an explicit skip even when records exist, and keeps the records', () => {
    const item = makeChecklistItem();
    const skipped = computeChapterProgress(
      ctx(makeChapter({ status: 'skipped' }), {
        checklist: [{ item, progress: makeProgress({ checklist_item_id: item.id, is_done: true }) }],
      }),
      { today: TODAY },
    );
    expect(skipped.status).toBe('skipped');
    expect(skipped.checklist.done).toBe(1); // records preserved, not erased
    expect(skipped.statusExplanation).toMatch(/skipped/i);

    // Un-skipping restores the evidence-derived status.
    const restored = computeChapterProgress(
      ctx(makeChapter({ status: 'in_progress' }), {
        checklist: [{ item, progress: makeProgress({ checklist_item_id: item.id, is_done: true }) }],
      }),
      { today: TODAY },
    );
    expect(restored.status).not.toBe('skipped');
    expect(restored.checklist.done).toBe(1);
  });

  it('never derives skipped without the explicit label', () => {
    const progress = computeChapterProgress(ctx(makeChapter({ status: 'not_recorded' })), { today: TODAY });
    expect(progress.status).not.toBe('skipped');
  });
});

describe('skipped chapters: subject aggregation', () => {
  it('excludes skipped chapters from the average checklist percent', () => {
    const doneItem = makeChecklistItem({ user_chapter_id: 'c1' });
    const emptyItem = makeChecklistItem({ user_chapter_id: 'c2' });
    const progress = computeSubjectProgress({
      userSubjectId: 'subject-1',
      chapters: [
        ctx(makeChapter({ id: 'c1' }), {
          checklist: [{ item: doneItem, progress: makeProgress({ checklist_item_id: doneItem.id, is_done: true }) }],
        }),
        // Skipped chapter with a 0%-ticked checklist would drag the mean to 50.
        ctx(makeChapter({ id: 'c2', status: 'skipped' }), {
          checklist: [{ item: emptyItem, progress: null }],
        }),
      ],
      tasks: [],
      today: TODAY,
    });
    expect(progress.chapterCount).toBe(2); // still visible in totals
    expect(progress.checklistPercent).toBe(100); // skipped one excluded
  });

  it('does not raise attention alerts for skipped chapters', () => {
    const noisy = computeSubjectProgress({
      userSubjectId: 'subject-1',
      chapters: [ctx(makeChapter(), { difficulties: [makeDifficulty({ severity: 'high' })] })],
      tasks: [],
      today: TODAY,
    });
    expect(noisy.attentionScore).toBeGreaterThan(0);

    const skipped = computeSubjectProgress({
      userSubjectId: 'subject-1',
      chapters: [ctx(makeChapter({ status: 'skipped' }), { difficulties: [makeDifficulty({ severity: 'high' })] })],
      tasks: [],
      today: TODAY,
    });
    expect(skipped.attentionScore).toBe(0);
    // The difficulty record itself is still counted for honest reporting.
    expect(skipped.openDifficulties).toBe(1);
  });
});

describe('skipped chapters: dashboard math', () => {
  function bundleWith(statuses: Array<'complete' | 'in_progress' | 'skipped' | 'not_recorded'>) {
    return makeBundle(
      statuses.map((status, i) => makeChapter({ id: `ch-${i}`, user_subject_id: 'subject-1', status })),
    );
  }

  it('computes overall percent over counted chapters only', () => {
    const view = buildWorkspaceView(
      bundleWith(['complete', 'complete', 'in_progress', 'skipped', 'skipped', 'not_recorded']),
      TODAY,
    );
    const overview = view.syllabusOverview;
    expect(overview.chaptersTotal).toBe(6);
    expect(overview.chaptersSkipped).toBe(2);
    expect(overview.chaptersCounted).toBe(4);
    expect(overview.chaptersComplete).toBe(2);
    expect(overview.chaptersRemaining).toBe(2);
    // 2 of 4 counted → 50%, not 2 of 6 → 33%.
    expect(overview.overallPercent).toBe(50);
  });

  it('handles an all-skipped subject without dividing by zero', () => {
    const view = buildWorkspaceView(bundleWith(['skipped', 'skipped']), TODAY);
    expect(view.syllabusOverview.chaptersCounted).toBe(0);
    expect(view.syllabusOverview.overallPercent).toBe(0);
    const stats = subjectChapterStats(view.subjects[0]!.chapters);
    expect(stats).toEqual({ complete: 0, counted: 0, skipped: 2, percent: 0 });
  });

  it('subject card stats exclude skipped from the denominator', () => {
    const view = buildWorkspaceView(bundleWith(['complete', 'skipped', 'in_progress']), TODAY);
    const stats = subjectChapterStats(view.subjects[0]!.chapters);
    // 1 of 2 counted → 50%.
    expect(stats).toEqual({ complete: 1, counted: 2, skipped: 1, percent: 50 });
  });
});
