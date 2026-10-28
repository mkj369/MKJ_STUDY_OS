import { describe, expect, it } from 'vitest';
import {
  COVERAGE_LABEL,
  EMPTY_FILTERS,
  chapterCoverage,
  filterCurriculum,
  groupOptions,
  levelOptions,
  matchesSubjectQuery,
  subjectDisplayName,
  summariseCurriculum,
  yearOptions,
} from '@/domain/curriculum';
import { OFFICIAL_CURRICULUM, OFFICIAL_SUBJECTS, OFFICIAL_VERSIONS } from '@/services/seed/officialCurriculum';
import type { CurriculumChapter, CurriculumSubject, CurriculumVersion } from '@/types/domain';

const version = (over: Partial<CurriculumVersion> = {}): CurriculumVersion => ({
  id: 'v1',
  authority: 'NCTB',
  country: 'Bangladesh',
  education_level: 'SSC',
  class_grade: 'Class 9–10',
  stream: 'Science',
  academic_year: '2025',
  version_label: 'x',
  title: 'SSC Science',
  source_url: null,
  scope: 'subject_structure',
  source_checked_at: null,
  source_note: null,
  verification_status: 'needs_verification',
  is_demo: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const subject = (over: Partial<CurriculumSubject> = {}): CurriculumSubject => ({
  id: 's1',
  curriculum_version_id: 'v1',
  name: 'Physics',
  name_bn: 'পদার্থবিজ্ঞান',
  code: null,
  paper_label: null,
  is_compulsory: false,
  sort_order: 1,
  verification_status: 'needs_verification',
  source_url: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const chapter = (over: Partial<CurriculumChapter> = {}): CurriculumChapter => ({
  id: 'c1',
  curriculum_subject_id: 's1',
  parent_id: null,
  title: 'Chapter one',
  title_bn: null,
  chapter_number: '1',
  sort_order: 1,
  source_url: null,
  verification_status: 'needs_verification',
  is_demo: false,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('curriculum filters', () => {
  const versions = [
    version({ id: 'ssc-sci', stream: 'Science' }),
    version({ id: 'ssc-hum', stream: 'Humanities' }),
    version({ id: 'hsc-sci', education_level: 'HSC', stream: 'Science', academic_year: '2026–2027' }),
  ];

  it('offers only levels and groups that actually exist', () => {
    expect(levelOptions(versions)).toEqual(['HSC', 'SSC']);
    expect(groupOptions(versions, 'SSC')).toEqual(['Humanities', 'Science']);
    expect(yearOptions(versions, 'SSC')).toEqual(['2025']);
    expect(yearOptions(versions, 'HSC')).toEqual(['2026–2027']);
  });

  it('narrows groups by level and year', () => {
    expect(groupOptions(versions, 'HSC', '2026–2027')).toEqual(['Science']);
    expect(groupOptions(versions, 'SSC', '2026–2027')).toEqual([]);
  });

  it('filters by level, year and group at once', () => {
    const subjects = [
      subject({ id: 'p1', curriculum_version_id: 'ssc-sci' }),
      subject({ id: 'p2', curriculum_version_id: 'hsc-sci' }),
    ];
    const result = filterCurriculum(versions, subjects, [], {
      ...EMPTY_FILTERS,
      level: 'HSC',
      year: '2026–2027',
      group: 'Science',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.version.id).toBe('hsc-sci');
  });

  it('drops versions whose subjects were all filtered out', () => {
    const subjects = [subject({ id: 'p1', curriculum_version_id: 'ssc-sci' })];
    const result = filterCurriculum(versions, subjects, [], { ...EMPTY_FILTERS, group: 'Humanities' });
    expect(result).toHaveLength(0);
  });

  it('matches subject text in English and Bangla', () => {
    const physics = subject();
    expect(matchesSubjectQuery(physics, 'phys')).toBe(true);
    expect(matchesSubjectQuery(physics, 'পদার্থ')).toBe(true);
    expect(matchesSubjectQuery(physics, 'chemistry')).toBe(false);
    expect(matchesSubjectQuery(physics, '   ')).toBe(true);
  });

  it('sorts subjects by their declared order, not by name', () => {
    const subjects = [
      subject({ id: 'b', name: 'Botany', sort_order: 2 }),
      subject({ id: 'a', name: 'Anatomy', sort_order: 1 }),
    ];
    const [entry] = filterCurriculum([version()], subjects, [], EMPTY_FILTERS);
    expect(entry?.subjects.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('chapter coverage honesty', () => {
  it('reports missing chapters rather than implying a complete syllabus', () => {
    expect(chapterCoverage(version(), [subject()], [])).toBe('missing');
    expect(COVERAGE_LABEL.missing).toBe('Chapter list not yet verified');
  });

  it('reports partial coverage when only some subjects have chapters', () => {
    const subjects = [subject({ id: 's1' }), subject({ id: 's2' })];
    expect(chapterCoverage(version(), subjects, [chapter({ curriculum_subject_id: 's1' })])).toBe('partial');
  });

  it('never reports complete for an unverified version, even with every chapter present', () => {
    const subjects = [subject({ id: 's1' }), subject({ id: 's2' })];
    const chapters = [chapter({ curriculum_subject_id: 's1' }), chapter({ id: 'c2', curriculum_subject_id: 's2' })];
    expect(chapterCoverage(version(), subjects, chapters)).toBe('partial');
    expect(chapterCoverage(version({ verification_status: 'verified' }), subjects, chapters)).toBe('complete');
  });

  it('treats a version with no subjects as missing, not complete', () => {
    expect(chapterCoverage(version(), [], [])).toBe('missing');
  });
});

describe('display helpers', () => {
  it('shows the Bangla name alongside the English one', () => {
    expect(subjectDisplayName(subject())).toBe('Physics · পদার্থবিজ্ঞান');
    expect(subjectDisplayName(subject({ name_bn: null }))).toBe('Physics');
  });

  it('summarises only the versions in scope, and counts verified chapters separately', () => {
    const summary = summariseCurriculum(
      [version(), version({ id: 'v2', is_demo: true })],
      [subject({ id: 's1', curriculum_version_id: 'v1' }), subject({ id: 's2', curriculum_version_id: 'other' })],
      [chapter({ curriculum_subject_id: 's1' }), chapter({ id: 'c2', curriculum_subject_id: 's1', verification_status: 'verified' })],
    );
    expect(summary).toEqual({ versions: 2, subjects: 1, chapters: 2, verifiedChapters: 1, demoVersions: 1 });
  });
});

describe('shipped official data holds the line on verification', () => {
  it('marks no official version verified and ships only sourced chapter rows', () => {
    expect(OFFICIAL_VERSIONS.every((v) => v.verification_status === 'needs_verification')).toBe(true);
    expect(OFFICIAL_VERSIONS.every((v) => v.scope === 'subject_structure')).toBe(true);

    // Three subjects have a chapter list, each read from the printed contents
    // page of the official textbook. Nothing else may appear out of nowhere.
    expect(OFFICIAL_CURRICULUM.chapters).toHaveLength(41);
    for (const chapter of OFFICIAL_CURRICULUM.chapters) {
      expect(chapter.source_url).toBeTruthy();
      expect(chapter.source_document).toContain('সূচিপত্র');
      expect(chapter.verification_status).not.toBe('verified');
    }
    expect(new Set(OFFICIAL_CURRICULUM.chapters.map((c) => c.curriculum_subject_id)).size).toBe(3);
  });

  it('allows only needs_verification or partially_verified for shipped subjects', () => {
    // Narrowed in migration 0008: a subject may be `partially_verified` when an
    // official document confirms it but a detail (the paper number) is inferred.
    // `verified` stays out of reach until a human compares the chapter list.
    for (const subject of OFFICIAL_SUBJECTS) {
      expect(['needs_verification', 'partially_verified']).toContain(subject.verification_status);
    }
    expect(OFFICIAL_SUBJECTS.some((s) => s.verification_status === 'verified')).toBe(false);
  });

  it('never claims partial verification without naming the document', () => {
    for (const subject of OFFICIAL_SUBJECTS.filter((s) => s.verification_status === 'partially_verified')) {
      expect(subject.source_url).toBeTruthy();
      expect(subject.source_document).toBeTruthy();
    }
  });

  it('splits Bangla and English into two papers for every version', () => {
    for (const version of OFFICIAL_VERSIONS) {
      const papers = OFFICIAL_SUBJECTS.filter(
        (s) => s.curriculum_version_id === version.id && (s.name === 'Bangla' || s.name === 'English'),
      );
      expect(papers.map((s) => s.paper_label).sort()).toEqual([
        '1st Paper',
        '1st Paper',
        '2nd Paper',
        '2nd Paper',
      ]);
    }
  });

  it('covers SSC and HSC for all three groups with unique deterministic ids', () => {
    const keys = OFFICIAL_VERSIONS.map((v) => `${v.education_level}/${v.stream}`);
    expect(keys.sort()).toEqual([
      'HSC/Business Studies',
      'HSC/Humanities',
      'HSC/Science',
      'SSC/Business Studies',
      'SSC/Humanities',
      'SSC/Science',
    ]);
    const ids = [...OFFICIAL_VERSIONS.map((v) => v.id), ...OFFICIAL_SUBJECTS.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every subject a Bangla name and a source URL', () => {
    expect(OFFICIAL_SUBJECTS.every((s) => Boolean(s.name_bn))).toBe(true);
    expect(OFFICIAL_SUBJECTS.every((s) => Boolean(s.source_url))).toBe(true);
  });

  it('points every source at an official document', () => {
    // nctb.gov.bd is the authority. The two textbook scans are the printed NCTB
    // books themselves, hosted by the Internet Archive because the official PDF
    // is behind a Drive interstitial; they are labelled as such everywhere.
    const allowed = /^https:\/\/(nctb\.gov\.bd\/|archive\.org\/details\/)/;
    for (const url of [...OFFICIAL_VERSIONS.map((v) => v.source_url), ...OFFICIAL_SUBJECTS.map((s) => s.source_url)]) {
      expect(url).toMatch(allowed);
    }
    const scanned = OFFICIAL_SUBJECTS.filter((s) => s.source_url?.startsWith('https://archive.org/'));
    // SSC Chemistry, SSC Physics, and HSC Physics 2nd Paper.
    expect(scanned.map((s) => `${s.name} ${s.paper_label ?? ''}`.trim()).sort()).toEqual([
      'Chemistry',
      'Physics',
      'Physics 2nd Paper',
    ]);
  });
});
