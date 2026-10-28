/**
 * Pure helpers for browsing the curriculum reference data.
 *
 * Kept out of the React component so the filtering and — more importantly — the
 * honesty rules ("is this curriculum complete?", "does this subject have a
 * verified chapter list?") can be unit tested directly. Getting these wrong is
 * how an unverified subject structure ends up looking like a finished syllabus.
 */
import type { CurriculumChapter, CurriculumScope, CurriculumSubject, CurriculumVersion } from '@/types/domain';

export interface CurriculumFilters {
  level: string;
  year: string;
  group: string;
  /** Free-text match on the subject name, English or Bangla. */
  subjectQuery: string;
}

export const EMPTY_FILTERS: CurriculumFilters = { level: '', year: '', group: '', subjectQuery: '' };

function sortedUnique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

export function levelOptions(versions: CurriculumVersion[]): string[] {
  return sortedUnique(versions.map((version) => version.education_level));
}

export function yearOptions(versions: CurriculumVersion[], level = ''): string[] {
  return sortedUnique(
    versions.filter((version) => !level || version.education_level === level).map((version) => version.academic_year),
  );
}

export function groupOptions(versions: CurriculumVersion[], level = '', year = ''): string[] {
  return sortedUnique(
    versions
      .filter((version) => (!level || version.education_level === level) && (!year || version.academic_year === year))
      .map((version) => version.stream),
  );
}

/**
 * Subjects matching the free-text query. An empty query matches everything.
 * Bangla search matters: a lot of students know the subject by its Bangla name
 * and would type "পদার্থবিজ্ঞান", not "Physics".
 */
export function matchesSubjectQuery(subject: CurriculumSubject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    subject.name.toLowerCase().includes(needle) ||
    (subject.name_bn ?? '').toLowerCase().includes(needle) ||
    (subject.code ?? '').toLowerCase().includes(needle)
  );
}

export interface VersionWithSubjects {
  version: CurriculumVersion;
  subjects: CurriculumSubject[];
  chapterCount: number;
}

/**
 * Applies the filters and returns only versions that still have something to
 * show. A version whose subjects were all filtered out is dropped, so the page
 * never renders an empty card the user has to scroll past.
 */
export function filterCurriculum(
  versions: CurriculumVersion[],
  subjects: CurriculumSubject[],
  chapters: CurriculumChapter[],
  filters: CurriculumFilters,
): VersionWithSubjects[] {
  const chaptersBySubject = new Map<string, number>();
  for (const chapter of chapters) {
    chaptersBySubject.set(chapter.curriculum_subject_id, (chaptersBySubject.get(chapter.curriculum_subject_id) ?? 0) + 1);
  }

  return versions
    .filter(
      (version) =>
        (!filters.level || version.education_level === filters.level) &&
        (!filters.year || version.academic_year === filters.year) &&
        (!filters.group || version.stream === filters.group),
    )
    .map((version) => {
      const versionSubjects = subjects
        .filter((subject) => subject.curriculum_version_id === version.id)
        .filter((subject) => matchesSubjectQuery(subject, filters.subjectQuery))
        .sort((a, b) => a.sort_order - b.sort_order);
      const chapterCount = versionSubjects.reduce(
        (total, subject) => total + (chaptersBySubject.get(subject.id) ?? 0),
        0,
      );
      return { version, subjects: versionSubjects, chapterCount };
    })
    .filter((entry) => entry.subjects.length > 0)
    .sort(
      (a, b) =>
        a.version.education_level.localeCompare(b.version.education_level) ||
        (a.version.stream ?? '').localeCompare(b.version.stream ?? '') ||
        a.version.academic_year.localeCompare(b.version.academic_year),
    );
}

/**
 * How complete a version's chapter data really is. Three states, because
 * "we have no chapters" and "we have every chapter" must never be confused,
 * and a partially imported list must not read as finished.
 */
export type ChapterCoverage = 'complete' | 'partial' | 'missing';

export function chapterCoverage(version: CurriculumVersion, subjects: CurriculumSubject[], chapters: CurriculumChapter[]): ChapterCoverage {
  if (subjects.length === 0) return 'missing';
  const withChapters = subjects.filter((subject) =>
    chapters.some((chapter) => chapter.curriculum_subject_id === subject.id),
  ).length;
  if (withChapters === 0) return 'missing';
  if (withChapters < subjects.length) return 'partial';
  return version.verification_status === 'verified' ? 'complete' : 'partial';
}

export const COVERAGE_LABEL: Record<ChapterCoverage, string> = {
  complete: 'Chapter list verified',
  partial: 'Chapter list partly recorded',
  missing: 'Chapter list not yet verified',
};

export const SCOPE_LABEL: Record<CurriculumScope, string> = {
  textbook: 'Full textbook contents',
  exam_syllabus: 'Exam-only revised syllabus',
  subject_structure: 'Subject structure only',
};

export const VERIFICATION_LABEL: Record<
  CurriculumVersion['verification_status'],
  { text: string; tone: 'good' | 'warn' | 'neutral' | 'danger' }
> = {
  verified: { text: 'Verified source', tone: 'good' },
  partially_verified: { text: 'Partly verified', tone: 'neutral' },
  needs_verification: { text: 'Needs verification', tone: 'warn' },
  draft: { text: 'Draft', tone: 'neutral' },
  retired: { text: 'Retired', tone: 'danger' },
};

/** "Physics · পদার্থবিজ্ঞান" — the Bangla name only when it adds information. */
export function subjectDisplayName(subject: CurriculumSubject): string {
  return subject.name_bn ? `${subject.name} · ${subject.name_bn}` : subject.name;
}

export interface CurriculumSummary {
  versions: number;
  subjects: number;
  chapters: number;
  verifiedChapters: number;
  demoVersions: number;
}

/** Honest totals for the page header: never rounded up, never implied complete. */
export function summariseCurriculum(
  versions: CurriculumVersion[],
  subjects: CurriculumSubject[],
  chapters: CurriculumChapter[],
): CurriculumSummary {
  const versionIds = new Set(versions.map((version) => version.id));
  const ours = subjects.filter((subject) => versionIds.has(subject.curriculum_version_id));
  const subjectIds = new Set(ours.map((subject) => subject.id));
  const ourChapters = chapters.filter((chapter) => subjectIds.has(chapter.curriculum_subject_id));
  return {
    versions: versions.length,
    subjects: ours.length,
    chapters: ourChapters.length,
    verifiedChapters: ourChapters.filter((chapter) => chapter.verification_status === 'verified').length,
    demoVersions: versions.filter((version) => version.is_demo).length,
  };
}
