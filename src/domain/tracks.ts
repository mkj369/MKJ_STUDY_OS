/**
 * Academic tracks and curriculum mapping.
 *
 * Five sections: Class 1–5, Class 6–8, SSC, HSC and HSC Admission.
 * SSC and HSC have separate curriculum structures. HSC Admission is a *track*,
 * not a syllabus: it reuses the exact same HSC curriculum rows (versions,
 * subjects, chapters). Nothing is duplicated, so progress recorded under HSC
 * stays valid when a student switches to Admission preparation.
 *
 * Class 1–5 and Class 6–8 currently have no seeded curriculum (no verified
 * data exists in the app yet). Setup still completes for them: students pick
 * their class and add subjects/chapters manually. The curriculum tables are
 * level-generic, so a verified Primary/Junior version can be added later
 * without any schema change.
 */
import type { CurriculumVersion } from '@/types/domain';

export const ACADEMIC_TRACKS = ['class_1_5', 'class_6_8', 'ssc', 'hsc', 'hsc_admission'] as const;
export type AcademicTrack = (typeof ACADEMIC_TRACKS)[number];

export const TRACK_LABELS: Record<AcademicTrack, string> = {
  class_1_5: 'Class 1–5',
  class_6_8: 'Class 6–8',
  ssc: 'SSC',
  hsc: 'HSC',
  hsc_admission: 'HSC Admission',
};

export const TRACK_DESCRIPTIONS: Record<AcademicTrack, string> = {
  class_1_5: 'Primary school, Class 1 to Class 5.',
  class_6_8: 'Junior school, Class 6 to Class 8.',
  ssc: 'Class 9–10, Secondary School Certificate.',
  hsc: 'Class 11–12, Higher Secondary Certificate.',
  hsc_admission: 'University admission preparation on the same HSC syllabus.',
};

/** Class options for the school tracks. Board tracks use groups instead. */
export const CLASS_LEVELS: Partial<Record<AcademicTrack, readonly string[]>> = {
  class_1_5: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'],
  class_6_8: ['Class 6', 'Class 7', 'Class 8'],
};

export function trackUsesClassLevel(track: AcademicTrack): boolean {
  return track === 'class_1_5' || track === 'class_6_8';
}

export function trackUsesGroup(track: AcademicTrack): boolean {
  return !trackUsesClassLevel(track);
}

export const STUDY_GROUPS = ['Science', 'Humanities', 'Business Studies'] as const;
export type StudyGroup = (typeof STUDY_GROUPS)[number];

export type CurriculumLevel = 'Primary' | 'Junior' | 'SSC' | 'HSC';

/** The curriculum level a track reads from. Admission deliberately maps to HSC. */
export function curriculumLevelForTrack(track: AcademicTrack): CurriculumLevel {
  if (track === 'class_1_5') return 'Primary';
  if (track === 'class_6_8') return 'Junior';
  return track === 'ssc' ? 'SSC' : 'HSC';
}

export function isAcademicTrack(value: unknown): value is AcademicTrack {
  return typeof value === 'string' && (ACADEMIC_TRACKS as readonly string[]).includes(value);
}

/** Curriculum versions that serve a track (level match, demo rows excluded). */
export function versionsForTrack(versions: CurriculumVersion[], track: AcademicTrack): CurriculumVersion[] {
  const level = curriculumLevelForTrack(track);
  return versions.filter((version) => version.education_level === level && !version.is_demo);
}

/** Groups available for a track, derived from the seeded curriculum structure. */
export function groupsForTrack(versions: CurriculumVersion[], track: AcademicTrack): string[] {
  if (!trackUsesGroup(track)) return [];
  return [...new Set(versionsForTrack(versions, track).map((v) => v.stream).filter((s): s is string => Boolean(s)))].sort();
}

/**
 * Academic sessions offered in setup. These are the years the seeded
 * curriculum structure actually covers — not an invented list of every board
 * session. Students can type another session if theirs is not listed.
 */
export function sessionsForTrack(versions: CurriculumVersion[], track: AcademicTrack, group: string): string[] {
  return [
    ...new Set(
      versionsForTrack(versions, track)
        .filter((v) => !group || v.stream === group)
        .map((v) => v.academic_year),
    ),
  ].sort();
}

/** Versions with an actual syllabus beat structure-only versions. */
function scopeRank(version: CurriculumVersion): number {
  return version.scope === 'subject_structure' ? 1 : 0;
}

/** Best-matching curriculum version for the chosen track/group/session. */
export function resolveVersion(
  versions: CurriculumVersion[],
  track: AcademicTrack,
  group: string,
  session: string,
): CurriculumVersion | null {
  const candidates = versionsForTrack(versions, track)
    .filter((v) => !group || v.stream === group)
    .slice()
    .sort((a, b) => scopeRank(a) - scopeRank(b));
  return candidates.find((v) => v.academic_year === session) ?? candidates[0] ?? null;
}

/** Infer a track from a legacy v1 profile (which only had `academic_level`). */
export function trackFromLegacyLevel(level: string | null | undefined): AcademicTrack | null {
  if (!level) return null;
  const normalized = level.trim().toUpperCase();
  if (normalized === 'SSC') return 'ssc';
  if (normalized === 'HSC') return 'hsc';
  if (normalized.includes('ADMISSION')) return 'hsc_admission';
  return null;
}
