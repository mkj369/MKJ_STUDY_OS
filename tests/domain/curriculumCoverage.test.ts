import { describe, expect, it } from 'vitest';
import {
  awaitingPublication,
  blockedRequirements,
  curriculumTotals,
  groupCoverage,
  subjectCoverage,
} from '@/domain/curriculumCoverage';
import type {
  CurriculumChapter,
  CurriculumPendingRequirement,
  CurriculumSubject,
  CurriculumTopic,
  CurriculumVersion,
} from '@/types/domain';

const NOW = '2026-10-28T00:00:00.000Z';

function version(overrides: Partial<CurriculumVersion> = {}): CurriculumVersion {
  return {
    id: 'v1',
    authority: 'NCTB',
    country: 'Bangladesh',
    education_level: 'SSC',
    class_grade: 'Class 9–10',
    stream: 'Science',
    academic_year: '2025',
    version_label: 'ssc-2025-subject-structure',
    title: 'SSC Science',
    source_url: 'https://nctb.gov.bd/',
    scope: 'subject_structure',
    source_checked_at: NOW,
    source_note: null,
    verification_status: 'needs_verification',
    is_demo: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as CurriculumVersion;
}

function subject(id: string, versionId: string, overrides: Partial<CurriculumSubject> = {}): CurriculumSubject {
  return {
    id,
    curriculum_version_id: versionId,
    name: id,
    name_bn: null,
    code: null,
    paper_label: null,
    is_compulsory: true,
    sort_order: 1,
    verification_status: 'needs_verification',
    source_url: null,
    created_at: NOW,
    ...overrides,
  };
}

function chapter(
  id: string,
  subjectId: string,
  status: CurriculumChapter['verification_status'] = 'needs_verification',
): CurriculumChapter {
  return {
    id,
    curriculum_subject_id: subjectId,
    parent_id: null,
    title: id,
    title_bn: null,
    chapter_number: null,
    sort_order: 1,
    source_url: status === 'verified' ? 'https://nctb.gov.bd/' : null,
    verification_status: status,
    is_demo: false,
    created_at: NOW,
  };
}

function topic(id: string, chapterId: string): CurriculumTopic {
  return {
    id,
    curriculum_chapter_id: chapterId,
    title: id,
    title_bn: null,
    sort_order: 1,
    source_url: null,
    verification_status: 'needs_verification',
    is_demo: false,
    created_at: NOW,
  };
}

function requirement(overrides: Partial<CurriculumPendingRequirement> = {}): CurriculumPendingRequirement {
  return {
    id: 'r1',
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2025',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Chapter lists',
    status: 'source_blocked',
    source_url: null,
    note: null,
    created_at: NOW,
    ...overrides,
  };
}

describe('subjectCoverage', () => {
  it('keeps a row for every subject, including the ones with no chapters at all', () => {
    const rows = subjectCoverage(
      [version()],
      [subject('Physics', 'v1'), subject('Chemistry', 'v1')],
      [chapter('c1', 'Physics')],
    );

    // Dropping empty subjects is exactly how a half-built syllabus starts to
    // look finished, so both must survive.
    expect(rows.map((row) => row.curriculum_subject_id)).toEqual(['Chemistry', 'Physics']);
    expect(rows.find((row) => row.curriculum_subject_id === 'Chemistry')?.chapter_state).toBe('none');
    expect(rows.find((row) => row.curriculum_subject_id === 'Physics')?.chapter_state).toBe('unverified');
  });

  it('distinguishes none from unverified from partly verified from verified', () => {
    const rows = subjectCoverage(
      [version()],
      [
        subject('Empty', 'v1'),
        subject('Unchecked', 'v1'),
        subject('Mixed', 'v1'),
        subject('Checked', 'v1'),
      ],
      [
        chapter('u1', 'Unchecked'),
        chapter('m1', 'Mixed', 'verified'),
        chapter('m2', 'Mixed', 'partially_verified'),
        chapter('k1', 'Checked', 'verified'),
        chapter('k2', 'Checked', 'verified'),
      ],
    );

    const state = (name: string) => rows.find((row) => row.curriculum_subject_id === name)?.chapter_state;
    expect(state('Empty')).toBe('none');
    expect(state('Unchecked')).toBe('unverified');
    expect(state('Mixed')).toBe('partially_verified');
    expect(state('Checked')).toBe('verified');
  });

  it('counts topics through their chapter, and never inflates chapter counts', () => {
    const rows = subjectCoverage(
      [version()],
      [subject('Physics', 'v1')],
      [chapter('c1', 'Physics'), chapter('c2', 'Physics')],
      [topic('t1', 'c1'), topic('t2', 'c1'), topic('t3', 'c2')],
    );

    const physics = rows[0]!;
    expect(physics.chapter_count).toBe(2);
    expect(physics.topic_count).toBe(3);
  });

  it('ignores chapters belonging to a subject that is not in the list', () => {
    const rows = subjectCoverage([version()], [subject('Physics', 'v1')], [chapter('c1', 'Ghost')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chapter_count).toBe(0);
  });
});

describe('groupCoverage', () => {
  it('reports missing when a version has no subjects', () => {
    const groups = groupCoverage([version()], []);
    expect(groups[0]?.inventory_state).toBe('missing');
    expect(groups[0]?.subjects).toBe(0);
  });

  it('splits the subject count into verified / partly / none without losing anyone', () => {
    const versions = [version()];
    const subjects = [
      subject('Physics', 'v1'),
      subject('Chemistry', 'v1'),
      subject('Biology', 'v1'),
    ];
    const chapters = [
      chapter('c1', 'Physics', 'verified'),
      chapter('c2', 'Chemistry', 'partially_verified'),
    ];
    const groups = groupCoverage(versions, subjectCoverage(versions, subjects, chapters));
    const row = groups[0];
    expect(row?.verified_subjects).toBe(1);
    expect(row?.partial_subjects).toBe(1);
    expect(row?.missing_subjects).toBe(1);
    // The three columns the UI shows must always account for every subject.
    expect(
      (row?.verified_subjects ?? 0) + (row?.partial_subjects ?? 0) + (row?.missing_subjects ?? 0),
    ).toBe(row?.subjects);
  });

  it('reports partial while any subject still has no chapters', () => {
    const versions = [version()];
    const subjects = [subject('Physics', 'v1'), subject('Chemistry', 'v1')];
    const chapters = [chapter('c1', 'Physics', 'verified')];
    const groups = groupCoverage(versions, subjectCoverage(versions, subjects, chapters));
    expect(groups[0]?.inventory_state).toBe('partial');
    expect(groups[0]?.subjects_with_chapters).toBe(1);
  });

  it('does not report complete while the version itself is unverified, even if every chapter is', () => {
    const versions = [version({ verification_status: 'needs_verification' })];
    const subjects = [subject('Physics', 'v1')];
    const chapters = [chapter('c1', 'Physics', 'verified')];
    const groups = groupCoverage(versions, subjectCoverage(versions, subjects, chapters));
    expect(groups[0]?.inventory_state).toBe('partial');
  });

  it('reports complete only when every subject has verified chapters and the version is verified', () => {
    const versions = [version({ verification_status: 'verified' })];
    const subjects = [subject('Physics', 'v1'), subject('Chemistry', 'v1')];
    const chapters = [chapter('c1', 'Physics', 'verified'), chapter('c2', 'Chemistry', 'verified')];
    const groups = groupCoverage(versions, subjectCoverage(versions, subjects, chapters));
    expect(groups[0]?.inventory_state).toBe('complete');
  });

  it('attaches requirements that match the level, year and group, including "all" rows', () => {
    const versions = [version()];
    const requirements = [
      requirement({ id: 'r1', stream: 'all', academic_year: '2025' }),
      requirement({ id: 'r2', stream: 'Science', academic_year: '2025' }),
      requirement({ id: 'r3', stream: 'Humanities', academic_year: '2025' }),
      requirement({ id: 'r4', stream: 'all', academic_year: '2026' }),
    ];
    const groups = groupCoverage(versions, [], requirements);
    expect(groups[0]?.blocking_requirements.map((row) => row.id)).toEqual(['r1', 'r2']);
  });
});

describe('curriculumTotals', () => {
  it('is only complete when every version is complete', () => {
    const complete = groupCoverage(
      [version({ id: 'v1', verification_status: 'verified' })],
      subjectCoverage(
        [version({ id: 'v1', verification_status: 'verified' })],
        [subject('Physics', 'v1')],
        [chapter('c1', 'Physics', 'verified')],
      ),
    );
    expect(curriculumTotals(complete).complete).toBe(true);

    const withEmptyYear = groupCoverage(
      [version({ id: 'v1' }), version({ id: 'v2', academic_year: '2027' })],
      subjectCoverage(
        [version({ id: 'v1' }), version({ id: 'v2', academic_year: '2027' })],
        [subject('Physics', 'v1')],
        [chapter('c1', 'Physics', 'verified')],
      ),
    );
    // One complete year and one unpublished year is not "complete".
    expect(curriculumTotals(withEmptyYear).complete).toBe(false);
    expect(curriculumTotals(withEmptyYear).versions).toBe(2);
  });

  it('never reports an empty curriculum as complete', () => {
    expect(curriculumTotals([]).complete).toBe(false);
  });
});

describe('requirement filters', () => {
  it('separates "NCTB has not published it" from "we could not read it"', () => {
    const requirements = [
      requirement({ id: 'a', status: 'awaiting_publication', academic_year: '2029' }),
      requirement({ id: 'b', status: 'awaiting_publication', academic_year: '2028' }),
      requirement({ id: 'c', status: 'source_blocked' }),
      requirement({ id: 'd', status: 'awaiting_source' }),
      requirement({ id: 'e', status: 'source_identified' }),
    ];

    expect(awaitingPublication(requirements).map((row) => row.id)).toEqual(['b', 'a']);
    // A document that does not exist yet is not our failure; it must not appear
    // in the "blocked" list where it would look like an unread source.
    expect(blockedRequirements(requirements).map((row) => row.id)).toEqual(['c', 'd']);
  });
});
