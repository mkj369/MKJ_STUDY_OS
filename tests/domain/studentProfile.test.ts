import { describe, expect, it } from 'vitest';
import {
  gradeSpan,
  normaliseStudentProfile,
  subjectBelongsToClass,
  versionBelongsToProfile,
} from '@/domain/studentProfile';
import { classLabel, isClassLevel } from '@/domain/classLevels';

/**
 * Class scoping is the rule that keeps one student's Class 9 years out of their
 * Class 11 dashboard. These cases pin the two ways it used to fail: a published
 * structure that covers a *range* of classes, and a group that only applies to
 * some of them.
 */
describe('gradeSpan', () => {
  it('reads a published range as every class it covers', () => {
    expect(gradeSpan('Class 9–10')).toEqual([9, 10]);
    expect(gradeSpan('Class 11–12')).toEqual([11, 12]);
    expect(gradeSpan('Classes 6-8')).toEqual([6, 8]);
    expect(gradeSpan('Class 11 to 12')).toEqual([11, 12]);
  });

  it('reads a single class, an exam name, and nothing at all', () => {
    expect(gradeSpan('Class 6')).toEqual([6, 6]);
    expect(gradeSpan('11')).toEqual([11, 11]);
    expect(gradeSpan('HSC 2026')).toEqual([11, 12]);
    expect(gradeSpan('SSC')).toEqual([9, 10]);
    expect(gradeSpan(null)).toBeNull();
    expect(gradeSpan('everyone')).toBeNull();
  });
});

describe('versionBelongsToProfile', () => {
  const ssc = { class_grade: 'Class 9–10', stream: 'Science' };
  const hsc = { class_grade: 'Class 11–12', stream: 'Science' };

  it('offers SSC to both Class 9 and Class 10', () => {
    expect(versionBelongsToProfile(ssc, 9, 'science')).toBe(true);
    expect(versionBelongsToProfile(ssc, 10, 'science')).toBe(true);
  });

  it('offers HSC to both Class 11 and Class 12', () => {
    expect(versionBelongsToProfile(hsc, 11, 'science')).toBe(true);
    expect(versionBelongsToProfile(hsc, 12, 'science')).toBe(true);
  });

  it('never offers one level to the other', () => {
    expect(versionBelongsToProfile(hsc, 10, null)).toBe(false);
    expect(versionBelongsToProfile(ssc, 11, null)).toBe(false);
    expect(versionBelongsToProfile(hsc, 5, null)).toBe(false);
  });

  it('filters by group only where the version names one', () => {
    expect(versionBelongsToProfile(ssc, 10, 'humanities')).toBe(false);
    expect(versionBelongsToProfile(ssc, 10, null)).toBe(true);
    expect(versionBelongsToProfile({ class_grade: 'Class 11–12', stream: null }, 11, 'business_studies')).toBe(true);
  });

  it('keeps an unreadable class visible instead of hiding data by guesswork', () => {
    expect(versionBelongsToProfile({ class_grade: null, stream: null }, 11, 'science')).toBe(true);
  });
});

describe('subjectBelongsToClass', () => {
  it('shows nothing hidden until a class is chosen', () => {
    expect(subjectBelongsToClass(null, null)).toBe(true);
    expect(subjectBelongsToClass(9, null)).toBe(true);
  });

  it('matches exactly, so Class 9 records stay out of Class 10', () => {
    expect(subjectBelongsToClass(9, 9)).toBe(true);
    expect(subjectBelongsToClass(9, 10)).toBe(false);
    expect(subjectBelongsToClass(null, 10)).toBe(false);
  });
});

describe('normaliseStudentProfile', () => {
  it('drops a group that cannot apply to the chosen class', () => {
    expect(normaliseStudentProfile({ activeClass: 5, activeGroup: 'science' })).toEqual({
      activeClass: 5,
      activeGroup: null,
    });
    expect(normaliseStudentProfile({ activeClass: 11, activeGroup: 'Science' })).toEqual({
      activeClass: 11,
      activeGroup: 'science',
    });
  });

  it('ignores an out-of-range class instead of coercing it', () => {
    expect(normaliseStudentProfile({ activeClass: 13, activeGroup: 'science' }).activeClass).toBeNull();
    expect(isClassLevel(13)).toBe(false);
    expect(classLabel(12)).toBe('Class 12');
  });
});
