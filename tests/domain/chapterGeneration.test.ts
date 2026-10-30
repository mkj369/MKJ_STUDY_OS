import { describe, expect, it } from 'vitest';
import {
  describeGeneration,
  findDuplicateSubject,
  isPlaceholderTitle,
  nextChapterNumber,
  normaliseSubjectKey,
  placeholderTitle,
  planChapterGeneration,
  planReorder,
  planSingleChapter,
  renamePatch,
  sortChapters,
  usedChapterNumbers,
  type ExistingChapter,
} from '@/domain/chapterGeneration';

const chapter = (
  id: string,
  chapterNumber: number | null,
  sortOrder: number,
  title = chapterNumber === null ? '' : `Chapter ${chapterNumber}`,
): ExistingChapter => ({ id, chapter_number: chapterNumber, title, sort_order: sortOrder });

describe('usedChapterNumbers / nextChapterNumber', () => {
  it('starts at 1 for a brand-new subject', () => {
    expect(usedChapterNumbers([])).toEqual([]);
    expect(nextChapterNumber([])).toBe(1);
  });

  it('ignores null and non-positive numbers', () => {
    expect(usedChapterNumbers([chapter('a', null, 1), chapter('b', 0, 2), chapter('c', 3, 3)])).toEqual([3]);
  });

  it('continues past the highest number, not the count', () => {
    // Chapter 2 was deleted: the next chapter must be 4, not 3, because Chapter 3
    // already exists and numbering must never collide.
    const chapters = [chapter('a', 1, 1), chapter('b', 3, 2)];
    expect(nextChapterNumber(chapters)).toBe(4);
  });

  it('sorts used numbers ascending', () => {
    expect(usedChapterNumbers([chapter('a', 7, 1), chapter('b', 2, 2), chapter('c', 5, 3)])).toEqual([2, 5, 7]);
  });
});

describe('planChapterGeneration', () => {
  it('adds one chapter for an empty subject', () => {
    expect(planSingleChapter([])).toEqual({ chapter_number: 1, title: 'Chapter 1', sort_order: 1 });
  });

  it('generates 1–12 in order in a single call', () => {
    const planned = planChapterGeneration([], 12);
    expect(planned).toHaveLength(12);
    expect(planned.map((entry) => entry.chapter_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(planned[0]?.title).toBe('Chapter 1');
    expect(planned[11]?.title).toBe('Chapter 12');
  });

  it('never duplicates a number that already exists', () => {
    const planned = planChapterGeneration([chapter('a', 1, 1), chapter('b', 3, 3)], 4);
    const numbers = planned.map((entry) => entry.chapter_number);
    expect(numbers).toEqual([4, 5, 6, 7]);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('appends sort_order after the highest existing row', () => {
    const planned = planChapterGeneration([chapter('a', 1, 10)], 2);
    expect(planned.map((entry) => entry.sort_order)).toEqual([11, 12]);
  });

  it('starts from an explicit number when asked', () => {
    const planned = planChapterGeneration([], 3, { startAt: 5 });
    expect(planned.map((entry) => entry.chapter_number)).toEqual([5, 6, 7]);
  });

  it('skips taken numbers even when starting below them', () => {
    const planned = planChapterGeneration([chapter('a', 6, 1)], 3, { startAt: 5 });
    expect(planned.map((entry) => entry.chapter_number)).toEqual([5, 7, 8]);
  });

  it('clamps nonsense counts instead of creating thousands of rows', () => {
    expect(planChapterGeneration([], 0)).toEqual([]);
    expect(planChapterGeneration([], -5)).toEqual([]);
    expect(planChapterGeneration([], Number.NaN)).toEqual([]);
    expect(planChapterGeneration([], 9999)).toHaveLength(200);
  });
});

describe('describeGeneration', () => {
  it('names the exact range', () => {
    expect(describeGeneration(planChapterGeneration([], 12))).toBe('Chapter 1 – Chapter 12 (12 chapters)');
  });

  it('uses singular wording for one chapter', () => {
    expect(describeGeneration(planChapterGeneration([], 1))).toBe('Chapter 1');
  });

  it('reports an empty plan', () => {
    expect(describeGeneration([])).toBe('No chapters to add.');
  });
});

describe('placeholderTitle / isPlaceholderTitle', () => {
  it('marks generated titles as placeholders', () => {
    expect(isPlaceholderTitle(placeholderTitle(3))).toBe(true);
    expect(isPlaceholderTitle('  chapter 12 ')).toBe(true);
  });

  it('treats a real title as real', () => {
    expect(isPlaceholderTitle('পদার্থের গতিবিধি')).toBe(false);
    expect(isPlaceholderTitle('Mechanics')).toBe(false);
    // "Chapter 1: vectors" is the student's own wording, not a placeholder.
    expect(isPlaceholderTitle('Chapter 1: vectors')).toBe(false);
  });
});

describe('renamePatch', () => {
  it('trims a new title and keeps the record id untouched', () => {
    expect(renamePatch({ title: '  Mechanics  ' })).toEqual({ custom_title: 'Mechanics' });
  });

  it('clears the custom title when the student restores the default', () => {
    expect(renamePatch({ title: '   ' })).toEqual({ custom_title: null });
  });

  it('stores a Bengali title as given', () => {
    expect(renamePatch({ titleBn: '  ভেক্টর  ' })).toEqual({ chapter_title_bn: 'ভেক্টর' });
  });

  it('clamps a renumber to a positive integer', () => {
    expect(renamePatch({ chapterNumber: 0 })).toEqual({ chapter_number: 1 });
    expect(renamePatch({ chapterNumber: 4.7 })).toEqual({ chapter_number: 4 });
    expect(renamePatch({ chapterNumber: null })).toEqual({ chapter_number: null });
  });

  it('returns an empty patch when nothing is supplied', () => {
    expect(renamePatch({})).toEqual({});
  });
});

describe('planReorder', () => {
  const chapters = [chapter('a', 1, 1), chapter('b', 2, 2), chapter('c', 3, 3)];

  it('rewrites sort_order and keeps every id', () => {
    const patches = planReorder(chapters, 0, 2);
    expect(patches.map((patch) => patch.id)).toEqual(['b', 'c', 'a']);
    expect(patches.map((patch) => patch.sort_order)).toEqual([1, 2, 3]);
    expect(new Set(patches.map((patch) => patch.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('moves a chapter upward', () => {
    expect(planReorder(chapters, 2, 0).map((patch) => patch.id)).toEqual(['c', 'a', 'b']);
  });

  it('does nothing when the index does not change', () => {
    expect(planReorder(chapters, 1, 1)).toEqual([]);
    expect(planReorder([], 0, 1)).toEqual([]);
  });

  it('clamps out-of-range indexes', () => {
    expect(planReorder(chapters, 99, -4).map((patch) => patch.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('sortChapters', () => {
  it('orders by sort_order, then number, then title', () => {
    const rows = [
      { sort_order: 2, chapter_number: 2, title: 'b' },
      { sort_order: 1, chapter_number: 3, title: 'c' },
      { sort_order: 2, chapter_number: 1, title: 'a' },
    ];
    expect(sortChapters(rows).map((row) => row.title)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input', () => {
    const rows = [
      { sort_order: 2, chapter_number: 2, title: 'b' },
      { sort_order: 1, chapter_number: 1, title: 'a' },
    ];
    sortChapters(rows);
    expect(rows.map((row) => row.title)).toEqual(['b', 'a']);
  });
});

describe('duplicate subject detection', () => {
  const existing = [
    { id: 's1', name: 'Physics', paperLabel: '1st Paper', classLevel: 11 },
    { id: 's2', name: 'Chemistry', paperLabel: null, classLevel: 9 },
  ];

  it('normalises punctuation and case', () => {
    expect(normaliseSubjectKey('Physics', '1st Paper')).toBe(normaliseSubjectKey('physics', '1st   paper'));
  });

  it('finds the same subject with a dash instead of a space', () => {
    expect(findDuplicateSubject(existing, { name: 'Physics — 1st Paper', classLevel: 11 })?.id).toBe('s1');
  });

  it('treats a different paper as a different subject', () => {
    expect(findDuplicateSubject(existing, { name: 'Physics', paperLabel: '2nd Paper', classLevel: 11 })).toBeNull();
  });

  it('keeps the same subject name separate across classes', () => {
    expect(findDuplicateSubject(existing, { name: 'Chemistry', classLevel: 10 })).toBeNull();
  });

  it('detects a subject without a paper label', () => {
    expect(findDuplicateSubject(existing, { name: 'chemistry', classLevel: 9 })?.id).toBe('s2');
  });

  it('ignores an empty name', () => {
    expect(findDuplicateSubject(existing, { name: '   ', classLevel: 9 })).toBeNull();
  });
});
