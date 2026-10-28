/**
 * Curriculum coverage maths — pure functions, no React, no storage.
 *
 * The point of this module is to make overstating coverage difficult. A screen
 * that shows "70 subjects" next to "0 chapters" invites the reader to assume
 * the syllabus is done; a screen that says "SSC / Science — 17 subjects, 0
 * chapters, chapter list blocked at source" does not.
 *
 * Three separate questions are kept apart on purpose:
 *
 *   1. Is the *inventory* complete? (are all the subjects that should be there,
 *      there?) — `inventoryState`
 *   2. Is the *chapter data* present and checked? — `chapterState`
 *   3. Is anything known to be missing, and why? — the pending requirements
 *
 * A subject can score well on (2) and still be missing entirely from (1). They
 * are never collapsed into one percentage.
 */
import type {
  CurriculumChapter,
  CurriculumPendingRequirement,
  CurriculumSubject,
  CurriculumTopic,
  CurriculumVersion,
  VerificationStatus,
} from '@/types/domain';

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * HSC leads.
 *
 * This app is used by an HSC student, so the level they are actually sitting
 * should not be buried under SSC in every list. SSC is still shown in full —
 * sorted second, never hidden. Nothing else about the reports changes: a level
 * being *first* says nothing about it being *complete*.
 */
export function levelRank(level: string): number {
  if (level === 'HSC') return 0;
  if (level === 'SSC') return 1;
  return 2;
}

/* -------------------------------------------------------------------------- */
/* Per-subject                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How good this subject's chapter data is.
 *
 * `none` is deliberately distinct from `unverified`: "no chapters recorded" and
 * "chapters recorded but not checked" are different states, and only the second
 * one is close to usable.
 */
export type ChapterState = 'verified' | 'partially_verified' | 'unverified' | 'none';

export const CHAPTER_STATE_LABEL: Record<ChapterState, string> = {
  verified: 'Chapter list verified',
  partially_verified: 'Chapter list partly verified',
  unverified: 'Chapter list unverified',
  none: 'No chapter list',
};

export const CHAPTER_STATE_TONE: Record<ChapterState, 'good' | 'info' | 'warn' | 'danger'> = {
  verified: 'good',
  partially_verified: 'info',
  unverified: 'warn',
  none: 'danger',
};

export interface SubjectCoverage {
  curriculum_subject_id: string;
  curriculum_version_id: string;
  education_level: string;
  stream: string;
  academic_year: string;
  name: string;
  name_bn: string | null;
  paper_label: string | null;
  is_compulsory: boolean;
  subject_status: VerificationStatus;
  chapter_count: number;
  verified_chapters: number;
  partial_chapters: number;
  unverified_chapters: number;
  topic_count: number;
  chapter_state: ChapterState;
}

function chapterStateOf(counts: {
  chapter_count: number;
  verified_chapters: number;
  partial_chapters: number;
}): ChapterState {
  if (counts.chapter_count === 0) return 'none';
  if (counts.verified_chapters === counts.chapter_count) return 'verified';
  if (counts.verified_chapters + counts.partial_chapters > 0) return 'partially_verified';
  return 'unverified';
}

/**
 * Builds one row per subject across every version, including the versions and
 * subjects with no chapters at all. Rows with nothing are the important ones —
 * dropping them is exactly how a half-built curriculum starts to look finished.
 */
export function subjectCoverage(
  versions: CurriculumVersion[],
  subjects: CurriculumSubject[],
  chapters: CurriculumChapter[],
  topics: CurriculumTopic[] = [],
): SubjectCoverage[] {
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const chaptersBySubject = new Map<string, CurriculumChapter[]>();
  for (const chapter of chapters) {
    const list = chaptersBySubject.get(chapter.curriculum_subject_id);
    if (list) list.push(chapter);
    else chaptersBySubject.set(chapter.curriculum_subject_id, [chapter]);
  }
  const topicsByChapter = new Map<string, number>();
  for (const topic of topics) {
    topicsByChapter.set(topic.curriculum_chapter_id, (topicsByChapter.get(topic.curriculum_chapter_id) ?? 0) + 1);
  }

  const rows: SubjectCoverage[] = [];
  for (const subject of subjects) {
    const version = versionById.get(subject.curriculum_version_id);
    if (!version) continue;
    const own = chaptersBySubject.get(subject.id) ?? [];
    const counts = {
      chapter_count: own.length,
      verified_chapters: own.filter((c) => c.verification_status === 'verified').length,
      partial_chapters: own.filter((c) => c.verification_status === 'partially_verified').length,
      unverified_chapters: own.filter(
        (c) => c.verification_status === 'needs_verification' || c.verification_status === 'draft',
      ).length,
    };
    rows.push({
      curriculum_subject_id: subject.id,
      curriculum_version_id: subject.curriculum_version_id,
      education_level: version.education_level,
      stream: version.stream ?? '—',
      academic_year: version.academic_year,
      name: subject.name,
      name_bn: subject.name_bn,
      paper_label: subject.paper_label,
      is_compulsory: subject.is_compulsory,
      subject_status: subject.verification_status,
      ...counts,
      topic_count: own.reduce((total, chapter) => total + (topicsByChapter.get(chapter.id) ?? 0), 0),
      chapter_state: chapterStateOf(counts),
    });
  }
  return rows.sort(
    (a, b) =>
      levelRank(a.education_level) - levelRank(b.education_level) ||
      a.stream.localeCompare(b.stream) ||
      a.academic_year.localeCompare(b.academic_year) ||
      a.name.localeCompare(b.name) ||
      (a.paper_label ?? '').localeCompare(b.paper_label ?? ''),
  );
}

/* -------------------------------------------------------------------------- */
/* Per level / group / year                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `complete` requires all three: subjects present, every subject carrying at
 * least one chapter, and every chapter verified. Anything short of that is
 * `partial` or `missing` — there is no "mostly done" that reads as done.
 */
export type InventoryState = 'complete' | 'partial' | 'missing';

export const INVENTORY_LABEL: Record<InventoryState, string> = {
  complete: 'Complete and verified',
  partial: 'Incomplete',
  missing: 'No subject inventory',
};

export interface GroupCoverage {
  education_level: string;
  stream: string;
  academic_year: string;
  version_id: string;
  version_status: VerificationStatus;
  subjects: number;
  compulsory_subjects: number;
  subjects_with_chapters: number;
  /** Subjects whose chapter list is verified in full. */
  verified_subjects: number;
  /** Subjects with a chapter list, short of verified (e.g. OCR-sourced). */
  partial_subjects: number;
  /** Subjects with no chapter list at all — the honest gap count. */
  missing_subjects: number;
  chapters: number;
  verified_chapters: number;
  partial_chapters: number;
  topics: number;
  inventory_state: InventoryState;
  /** Requirements that block this exact level/group/year, if any are on file. */
  blocking_requirements: CurriculumPendingRequirement[];
}

export function groupCoverage(
  versions: CurriculumVersion[],
  rows: SubjectCoverage[],
  requirements: CurriculumPendingRequirement[] = [],
): GroupCoverage[] {
  return versions
    .map((version) => {
      const own = rows.filter((row) => row.curriculum_version_id === version.id);
      const chapters = own.reduce((total, row) => total + row.chapter_count, 0);
      const verified = own.reduce((total, row) => total + row.verified_chapters, 0);
      const subjectsWithChapters = own.filter((row) => row.chapter_count > 0).length;

      let state: InventoryState;
      if (own.length === 0) state = 'missing';
      else if (
        subjectsWithChapters === own.length &&
        chapters > 0 &&
        verified === chapters &&
        version.verification_status === 'verified'
      )
        state = 'complete';
      else state = 'partial';

      return {
        education_level: version.education_level,
        stream: version.stream ?? '—',
        academic_year: version.academic_year,
        version_id: version.id,
        version_status: version.verification_status,
        subjects: own.length,
        compulsory_subjects: own.filter((row) => row.is_compulsory).length,
        subjects_with_chapters: subjectsWithChapters,
        verified_subjects: own.filter((row) => row.chapter_state === 'verified').length,
        partial_subjects: own.filter(
          (row) => row.chapter_state === 'partially_verified' || row.chapter_state === 'unverified',
        ).length,
        missing_subjects: own.filter((row) => row.chapter_state === 'none').length,
        chapters,
        verified_chapters: verified,
        partial_chapters: own.reduce((total, row) => total + row.partial_chapters, 0),
        topics: own.reduce((total, row) => total + row.topic_count, 0),
        inventory_state: state,
        blocking_requirements: requirements.filter(
          (requirement) =>
            requirement.education_level === version.education_level &&
            requirement.academic_year === version.academic_year &&
            (requirement.stream === 'all' || requirement.stream === version.stream),
        ),
      };
    })
    .sort(
      (a, b) =>
        levelRank(a.education_level) - levelRank(b.education_level) ||
        a.stream.localeCompare(b.stream) ||
        a.academic_year.localeCompare(b.academic_year),
    );
}

/* -------------------------------------------------------------------------- */
/* Whole curriculum                                                            */
/* -------------------------------------------------------------------------- */

export interface CurriculumTotals {
  versions: number;
  subjects: number;
  chapters: number;
  verified_chapters: number;
  partial_chapters: number;
  topics: number;
  /** True only when every version is `complete`. Never inferred from counts. */
  complete: boolean;
}

export function curriculumTotals(groups: GroupCoverage[]): CurriculumTotals {
  return {
    versions: groups.length,
    subjects: groups.reduce((total, group) => total + group.subjects, 0),
    chapters: groups.reduce((total, group) => total + group.chapters, 0),
    verified_chapters: groups.reduce((total, group) => total + group.verified_chapters, 0),
    partial_chapters: groups.reduce((total, group) => total + group.partial_chapters, 0),
    topics: groups.reduce((total, group) => total + group.topics, 0),
    complete: groups.length > 0 && groups.every((group) => group.inventory_state === 'complete'),
  };
}

/** Requirements for years NCTB has not published yet, newest last. */
export function awaitingPublication(
  requirements: CurriculumPendingRequirement[],
): CurriculumPendingRequirement[] {
  return requirements
    .filter((requirement) => requirement.status === 'awaiting_publication')
    .sort((a, b) => a.academic_year.localeCompare(b.academic_year));
}

/**
 * Requirements that are a *known* blocker, i.e. something was identified and
 * could not be read. Excludes `awaiting_publication`, which is not a failure
 * on our side.
 */
export function blockedRequirements(
  requirements: CurriculumPendingRequirement[],
): CurriculumPendingRequirement[] {
  return requirements.filter(
    (requirement) => requirement.status === 'source_blocked' || requirement.status === 'awaiting_source',
  );
}
