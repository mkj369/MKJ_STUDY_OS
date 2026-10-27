import { describe, expect, it } from 'vitest';
import { analyzeMistakes, buildMistakeFollowUps } from '@/domain/mistakes';
import { day, makeChapter, makeMistake, TODAY } from '../fixtures/factories';

describe('mistake analysis', () => {
  it('reports an empty book without judgement', () => {
    const analysis = analyzeMistakes([], []);
    expect(analysis).toMatchObject({ total: 0, unresolved: 0, resolvedPercent: null, recurring: [] });
  });

  it('splits resolved and unresolved', () => {
    const analysis = analyzeMistakes([
      makeMistake({ is_resolved: true }),
      makeMistake({ is_resolved: false }),
      makeMistake({ is_resolved: false }),
    ]);
    expect(analysis).toMatchObject({ total: 3, resolved: 1, unresolved: 2, resolvedPercent: 33 });
  });

  it('does not call a single mistake a pattern', () => {
    const analysis = analyzeMistakes([makeMistake({ occurred_at: TODAY })]);
    expect(analysis.recurring).toEqual([]);
  });

  it('does not call same-day repeats a pattern either', () => {
    const analysis = analyzeMistakes([
      makeMistake({ occurred_at: TODAY, category: 'calculation' }),
      makeMistake({ occurred_at: TODAY, category: 'calculation' }),
    ]);
    expect(analysis.recurring).toEqual([]);
  });

  it('groups a real pattern across different dates', () => {
    const analysis = analyzeMistakes([
      makeMistake({ occurred_at: day(-10), category: 'calculation', user_chapter_id: 'c1' }),
      makeMistake({ occurred_at: day(-3), category: 'calculation', user_chapter_id: 'c1', is_resolved: true }),
      makeMistake({ occurred_at: TODAY, category: 'calculation', user_chapter_id: 'c1' }),
    ], [makeChapter({ id: 'c1', custom_title: 'Electricity' })]);
    expect(analysis.recurring).toHaveLength(1);
    expect(analysis.recurring[0]).toMatchObject({
      category: 'calculation',
      chapterId: 'c1',
      chapterTitle: 'Electricity',
      count: 3,
      distinctDates: 3,
      unresolved: 2,
    });
    expect(analysis.recurring[0]?.evidence).toHaveLength(3);
  });

  it('keeps categories separate and chapterless mistakes separate', () => {
    const analysis = analyzeMistakes([
      makeMistake({ occurred_at: day(-5), category: 'calculation' }),
      makeMistake({ occurred_at: day(-4), category: 'concept_gap' }),
      makeMistake({ occurred_at: day(-3), category: 'calculation', user_chapter_id: 'c2' }),
    ]);
    expect(analysis.recurring).toEqual([]);
  });

  it('orders weak chapters by unresolved mistakes', () => {
    const chapters = [
      makeChapter({ id: 'c1', custom_title: 'Optics' }),
      makeChapter({ id: 'c2', custom_title: 'Waves' }),
    ];
    const analysis = analyzeMistakes(
      [
        makeMistake({ user_chapter_id: 'c1', occurred_at: day(-1) }),
        makeMistake({ user_chapter_id: 'c2', occurred_at: day(-2) }),
        makeMistake({ user_chapter_id: 'c2', occurred_at: day(-2) }),
      ],
      chapters,
    );
    expect(analysis.weakChapters[0]).toMatchObject({ chapterTitle: 'Waves', unresolved: 2 });
    expect(analysis.weakChapters[1]).toMatchObject({ chapterTitle: 'Optics', unresolved: 1 });
  });

  it('collects the latest lessons only', () => {
    const analysis = analyzeMistakes([
      makeMistake({ occurred_at: day(-9), lesson_learned: 'Old lesson' }),
      makeMistake({ occurred_at: TODAY, lesson_learned: 'Read the unit first' }),
      makeMistake({ occurred_at: day(-2), lesson_learned: null }),
    ]);
    expect(analysis.lessons).toEqual([
      { lesson: 'Read the unit first', date: TODAY },
      { lesson: 'Old lesson', date: day(-9) },
    ]);
  });
});

describe('follow-ups', () => {
  it('only suggests follow-ups for unresolved recurring patterns', () => {
    const resolvedPattern = analyzeMistakes([
      makeMistake({ occurred_at: day(-5), category: 'calculation', is_resolved: true }),
      makeMistake({ occurred_at: day(-4), category: 'calculation', is_resolved: true }),
    ]);
    expect(buildMistakeFollowUps(resolvedPattern)).toEqual([]);

    const openPattern = analyzeMistakes([
      makeMistake({ occurred_at: day(-5), category: 'calculation' }),
      makeMistake({ occurred_at: day(-4), category: 'calculation' }),
      makeMistake({ occurred_at: day(-3), category: 'calculation' }),
    ]);
    const followUps = buildMistakeFollowUps(openPattern);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.priority).toBe('high');
    expect(followUps[0]?.why).toContain('records support a pattern');
    expect(followUps[0]?.evidence).toHaveLength(3);
  });

  it('caps the list so the student is not flooded', () => {
    const mistakes = [];
    for (let index = 0; index < 6; index += 1) {
      mistakes.push(
        makeMistake({ occurred_at: day(-10 - index), category: 'concept_gap', user_chapter_id: `c${index}` }),
        makeMistake({ occurred_at: day(-5 - index), category: 'concept_gap', user_chapter_id: `c${index}` }),
      );
    }
    expect(buildMistakeFollowUps(analyzeMistakes(mistakes), 3)).toHaveLength(3);
  });
});
