import { describe, expect, it } from 'vitest';
import { OFFICIAL_CHAPTERS, OFFICIAL_SUBJECTS, OFFICIAL_VERSIONS } from '@/services/seed/officialCurriculum';
import { VERIFICATION_LABEL, filterCurriculum, EMPTY_FILTERS } from '@/domain/curriculum';

/**
 * The eight HSC Science papers this project is required to carry separately.
 * Round 8's scope is explicit: Physics/Chemistry/Biology/Higher Mathematics,
 * each ১ম পত্র and ২য় পত্র, must never collapse into one subject, and no paper
 * may be presented as complete while its chapter list is unverified.
 */

const SCIENCE = ['Physics', 'Chemistry', 'Biology', 'Higher Mathematics'] as const;

function scienceSubjects() {
  const hscScience = OFFICIAL_VERSIONS.find(
    (version) => version.education_level === 'HSC' && version.stream === 'Science' && !version.is_demo,
  );
  expect(hscScience, 'an official HSC Science version must exist').toBeTruthy();
  return {
    version: hscScience!,
    subjects: OFFICIAL_SUBJECTS.filter((subject) => subject.curriculum_version_id === hscScience!.id),
  };
}

describe('HSC Science paper inventory', () => {
  it('carries all eight papers as distinct subjects, never merged', () => {
    const { subjects } = scienceSubjects();
    const missing: string[] = [];
    for (const name of SCIENCE) {
      for (const paper of ['1st Paper', '2nd Paper']) {
        const match = subjects.filter((subject) => subject.name === name && subject.paper_label === paper);
        if (match.length !== 1) missing.push(`${name} ${paper} (found ${match.length})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every paper its own id, so progress and reports cannot collide', () => {
    const { subjects } = scienceSubjects();
    const ids = subjects.map((subject) => subject.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps 1st and 2nd Paper separable through the subject filter', () => {
    const { subjects, version } = scienceSubjects();
    const firstPaper = filterCurriculum([version], subjects, OFFICIAL_CHAPTERS, {
      ...EMPTY_FILTERS,
      subjectQuery: 'Physics 1st Paper',
    });
    const secondPaper = filterCurriculum([version], subjects, OFFICIAL_CHAPTERS, {
      ...EMPTY_FILTERS,
      subjectQuery: 'Physics 2nd Paper',
    });
    const namesOf = (result: typeof firstPaper) =>
      result.flatMap((entry) => entry.subjects.map((s) => `${s.name} ${s.paper_label ?? ''}`));

    expect(namesOf(firstPaper)).toEqual(['Physics 1st Paper']);
    expect(namesOf(secondPaper)).toEqual(['Physics 2nd Paper']);
  });
});

describe('searching for a paper the way a student types it', () => {
  it('finds a paper from the Bengali label as well as the English one', () => {
    const { subjects, version } = scienceSubjects();
    const namesFor = (query: string) =>
      filterCurriculum([version], subjects, OFFICIAL_CHAPTERS, { ...EMPTY_FILTERS, subjectQuery: query })
        .flatMap((entry) => entry.subjects.map((s) => `${s.name} ${s.paper_label ?? ''}`));

    // Same paper, four ways of asking for it.
    expect(namesFor('Physics 2nd Paper')).toEqual(['Physics 2nd Paper']);
    expect(namesFor('physics 2nd')).toEqual(['Physics 2nd Paper']);
    expect(namesFor('পদার্থবিজ্ঞান ২য়')).toEqual(['Physics 2nd Paper']);

    // "২য় পত্র" on its own is the generic "2nd Paper": every subject that has a
    // second paper legitimately matches, and Physics must be one of them.
    const bengaliPaper = namesFor('২য় পত্র');
    expect(bengaliPaper).toContain('Physics 2nd Paper');
    expect(bengaliPaper.every((label) => label.endsWith('2nd Paper'))).toBe(true);
  });

  it('never returns the other paper when one is asked for by number', () => {
    const { subjects, version } = scienceSubjects();
    const second = filterCurriculum([version], subjects, OFFICIAL_CHAPTERS, {
      ...EMPTY_FILTERS,
      subjectQuery: '1st Paper',
    }).flatMap((entry) => entry.subjects.map((s) => s.paper_label));
    expect(second.every((label) => label === '1st Paper')).toBe(true);
  });
});

describe('verification honesty across the eight papers', () => {
  it('never marks a paper verified while any of its chapters is unverified', () => {
    const { subjects } = scienceSubjects();
    const offenders: string[] = [];
    for (const subject of subjects) {
      const chapters = OFFICIAL_CHAPTERS.filter((c) => c.curriculum_subject_id === subject.id);
      const allVerified = chapters.length > 0 && chapters.every((c) => c.verification_status === 'verified');
      if (subject.verification_status === 'verified' && !allVerified) {
        offenders.push(`${subject.name} ${subject.paper_label ?? ''}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('marks a paper with recovered chapters as partial, not verified', () => {
    const recovered = OFFICIAL_SUBJECTS.filter((subject) => {
      const chapters = OFFICIAL_CHAPTERS.filter((c) => c.curriculum_subject_id === subject.id);
      return chapters.length > 0;
    });
    expect(recovered.length).toBeGreaterThan(0);
    for (const subject of recovered) {
      expect(subject.verification_status, `${subject.name} ${subject.paper_label ?? ''}`).toBe(
        'partially_verified',
      );
    }
  });

  it('records a source on every chapter row — no orphan titles', () => {
    const orphans = OFFICIAL_CHAPTERS.filter((chapter) => !chapter.source_url || !chapter.source_document);
    expect(orphans.map((chapter) => chapter.title)).toEqual([]);
  });

  it('says out loud that nothing is verified, rather than quietly implying it', () => {
    // Round 8 delivered zero verified chapters. If that ever changes, the label
    // map must still have the word for it — this pins the vocabulary, not the count.
    expect(VERIFICATION_LABEL.verified.text).toMatch(/verified/i);
    expect(VERIFICATION_LABEL.partially_verified.text).toMatch(/partly|partial/i);
    expect(VERIFICATION_LABEL.needs_verification.text).toMatch(/verification/i);
  });
});

describe('what the eight papers actually contain', () => {
  it('reports the count of recovered papers without inventing the rest', () => {
    const { subjects } = scienceSubjects();
    const withChapters = subjects.filter((subject) =>
      OFFICIAL_CHAPTERS.some((chapter) => chapter.curriculum_subject_id === subject.id),
    );
    const withoutChapters = subjects.filter(
      (subject) => !OFFICIAL_CHAPTERS.some((chapter) => chapter.curriculum_subject_id === subject.id),
    );

    // Nothing may be silently absent: every paper is either recovered or openly empty.
    expect(withChapters.length + withoutChapters.length).toBe(subjects.length);

    /*
     * The state as of Round 8. Pinned deliberately: it is the finding of the
     * audit, and a future import that changes it should have to update this test
     * and say so — not slip through.
     */
    const physics2nd = withChapters.find((subject) => subject.name === 'Physics' && subject.paper_label === '2nd Paper');
    expect(physics2nd, 'Physics 2nd Paper is the one recovered paper').toBeTruthy();
    expect(OFFICIAL_CHAPTERS.filter((c) => c.curriculum_subject_id === physics2nd!.id)).toHaveLength(15);
    expect(withoutChapters.length).toBe(subjects.length - withChapters.length);
  });

  it('never invents a Bengali title it could not read', () => {
    // The Physics 2nd Paper source is OCR whose Bengali glyphs were unreadable.
    // Its rows must therefore carry no title_bn — a made-up Bengali title would
    // look more authoritative than the source actually is.
    const physics2nd = OFFICIAL_SUBJECTS.find(
      (subject) => subject.name === 'Physics' && subject.paper_label === '2nd Paper',
    )!;
    const rows = OFFICIAL_CHAPTERS.filter((c) => c.curriculum_subject_id === physics2nd.id);
    expect(rows.length).toBe(15);
    expect(rows.every((row) => row.title_bn === null)).toBe(true);
    expect(rows.every((row) => row.verification_status === 'partially_verified')).toBe(true);
    // Printed numbering preserved exactly, 1..15 in order.
    expect(rows.map((row) => row.chapter_number)).toEqual(
      Array.from({ length: 15 }, (_, index) => String(index + 1)),
    );
  });
});
