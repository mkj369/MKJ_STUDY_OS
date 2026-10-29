/**
 * Pure helpers for browsing the curriculum reference data.
 *
 * Kept out of the React component so the filtering and — more importantly — the
 * honesty rules ("is this curriculum complete?", "does this subject have a
 * verified chapter list?") can be unit tested directly. Getting these wrong is
 * how an unverified subject structure ends up looking like a finished syllabus.
 */
import type { CurriculumChapter, CurriculumScope, CurriculumSubject, CurriculumVersion } from '@/types/domain';
import { levelRank } from '@/domain/curriculumCoverage';

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

/**
 * HSC first. This app's owner sits HSC, and an alphabetical sort buried the
 * level they are examined on underneath one they have finished. SSC is still
 * listed — second, not hidden.
 */
export function levelOptions(versions: CurriculumVersion[]): string[] {
  return sortedUnique(versions.map((version) => version.education_level)).sort(
    (a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b),
  );
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

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * Bengali paper labels, derived from the stored English ones. A student types
 * "১ম পত্র", not "1st Paper"; both have to find the same paper. Only exact known
 * labels are translated — anything else passes through untouched.
 */
export function paperLabelBn(label: string | null): string | null {
  if (!label) return null;
  const map: Record<string, string> = { '1st Paper': '১ম পত্র', '2nd Paper': '২য় পত্র', '3rd Paper': '৩য় পত্র' };
  return map[label] ?? null;
}

/**
 * Folds the ways a Bangladeshi student might type a paper into one form, so the
 * search box is not secretly English-only. Ordinals are translated before digits
 * because "১ম" contains a Bengali digit.
 */
export function normaliseCurriculumQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/১ম|প্রথম/g, '1st')
    .replace(/২য়|দ্বিতীয়/g, '2nd')
    .replace(/৩য়|তৃতীয়/g, '3rd')
    .replace(/[০-৯]/g, (digit) => String(BN_DIGITS.indexOf(digit)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Subjects matching the free-text query. An empty query matches everything.
 * Bangla search matters: a lot of students know the subject by its Bangla name
 * and would type "পদার্থবিজ্ঞান", not "Physics" — and would type "২য় পত্র", not
 * "2nd Paper", which is the half that used to find nothing at all.
 */
export function matchesSubjectQuery(subject: CurriculumSubject, query: string): boolean {
  const needle = normaliseCurriculumQuery(query);
  if (!needle) return true;
  /*
   * The haystack includes the paper label, both alone and joined to the name.
   * Without that, "Physics 1st Paper" matched nothing: the label lives in its own
   * column, so 1st and 2nd Paper were impossible to tell apart from the search
   * box — the one place a student is most likely to try.
   */
  const haystack = normaliseCurriculumQuery(
    [
      subject.name,
      subject.name_bn ?? '',
      subject.code ?? '',
      subject.paper_label ?? '',
      subject.paper_label ? `${subject.name} ${subject.paper_label}` : '',
      paperLabelBn(subject.paper_label) ?? '',
      paperLabelBn(subject.paper_label) ? `${subject.name} ${paperLabelBn(subject.paper_label)}` : '',
    ].join(' '),
  );
  return haystack.includes(needle);
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
