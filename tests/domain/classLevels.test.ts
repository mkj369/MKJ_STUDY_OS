import { describe, expect, it } from 'vitest';
import {
  CLASS_GROUPS,
  CLASS_LEVELS,
  DEFAULT_CLASS,
  classLabel,
  classStage,
  classWithStageLabel,
  isClassLevel,
  paperLabelBn,
  paperLabelRelevant,
  parseClassLevel,
} from '@/domain/classLevels';

describe('class levels 1–12', () => {
  it('covers every class exactly once', () => {
    expect(CLASS_LEVELS).toHaveLength(12);
    const grouped = CLASS_GROUPS.flatMap((group) => group.classes);
    expect(grouped).toEqual([...CLASS_LEVELS]);
  });

  it('groups School as 1–10 and College as 11–12', () => {
    expect(CLASS_GROUPS.map((group) => group.label)).toEqual(['Primary', 'High School', 'College']);
    expect(CLASS_GROUPS[0]?.classes).toEqual([1, 2, 3, 4, 5]);
    expect(CLASS_GROUPS[1]?.classes).toEqual([6, 7, 8, 9, 10]);
    expect(CLASS_GROUPS[2]?.classes).toEqual([11, 12]);
  });

  it('validates only integers inside the range', () => {
    for (const level of CLASS_LEVELS) expect(isClassLevel(level)).toBe(true);
    expect(isClassLevel(0)).toBe(false);
    expect(isClassLevel(13)).toBe(false);
    expect(isClassLevel(9.5)).toBe(false);
    expect(isClassLevel('9')).toBe(false);
    expect(isClassLevel(null)).toBe(false);
  });

  it('parses form strings, including whitespace', () => {
    expect(parseClassLevel('11')).toBe(11);
    expect(parseClassLevel(' 12 ')).toBe(12);
    expect(parseClassLevel(7)).toBe(7);
    expect(parseClassLevel('')).toBeNull();
    expect(parseClassLevel('13')).toBeNull();
    expect(parseClassLevel(null)).toBeNull();
    expect(parseClassLevel(undefined)).toBeNull();
  });

  it('labels classes for display', () => {
    expect(classLabel(11)).toBe('Class 11');
    expect(classLabel(null)).toBe('No class');
    expect(classWithStageLabel(11)).toBe('Class 11 · College');
    expect(classWithStageLabel(3)).toBe('Class 3 · Primary');
  });

  it('maps stages', () => {
    expect(classStage(1)).toBe('primary');
    expect(classStage(10)).toBe('secondary');
    expect(classStage(12)).toBe('higher_secondary');
    expect(DEFAULT_CLASS).toBe(9);
  });
});

describe('paper labels', () => {
  it('offers paper labels from Class 9 up', () => {
    expect(paperLabelRelevant(9)).toBe(true);
    expect(paperLabelRelevant(12)).toBe(true);
    expect(paperLabelRelevant(4)).toBe(false);
  });

  it('never hides an existing label, whatever the class', () => {
    expect(paperLabelRelevant(4, true)).toBe(true);
  });

  it('translates the standard Bengali paper names', () => {
    expect(paperLabelBn('1st Paper')).toBe('১ম পত্র');
    expect(paperLabelBn('2nd Paper')).toBe('২য় পত্র');
    expect(paperLabelBn('Custom')).toBeNull();
    expect(paperLabelBn(null)).toBeNull();
  });
});
