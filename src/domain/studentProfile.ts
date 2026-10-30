/**
 * The student's class and study group.
 *
 * Class is the primary curriculum context: one class holds its own subjects and
 * nothing from another class leaks into the dashboard, planner, revision queue
 * or any subject picker. The group only exists where Bangladesh actually splits
 * students — Classes 9–12 — and is optional for Class 9–10.
 *
 * Both values are metadata on the profile. Switching class is a view change, so
 * records that belong to the previous class are never deleted or relabelled.
 */

import { isClassLevel, type ClassLevel } from '@/domain/classLevels';

export const STUDY_GROUPS = ['science', 'humanities', 'business_studies'] as const;
export type StudyGroup = (typeof STUDY_GROUPS)[number];

export const STUDY_GROUP_LABELS: Record<StudyGroup, { label: string; labelBn: string }> = {
  science: { label: 'Science', labelBn: 'বিজ্ঞান' },
  humanities: { label: 'Humanities', labelBn: 'মানবিক' },
  business_studies: { label: 'Business Studies', labelBn: 'ব্যবসায় শিক্ষা' },
};

/** Groups are only offered for the classes that are examined by group. */
export function groupAppliesToClass(level: ClassLevel | null | undefined): boolean {
  return typeof level === 'number' && level >= 9 && level <= 12;
}

/** Class 11–12 students must choose a group; Class 9–10 may leave it unset. */
export function groupRequiredForClass(level: ClassLevel | null | undefined): boolean {
  return typeof level === 'number' && level >= 11 && level <= 12;
}

export function normaliseGroup(value: unknown): StudyGroup | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (STUDY_GROUPS as readonly string[]).includes(key) ? (key as StudyGroup) : null;
}

export function groupLabel(group: StudyGroup | null): string | null {
  return group ? STUDY_GROUP_LABELS[group].label : null;
}

/**
 * Coerce whatever is stored into a usable pair. A group that cannot apply to the
 * stored class is dropped rather than shown as a stale selection.
 */
export function normaliseStudentProfile(input: {
  activeClass?: number | null;
  activeGroup?: string | null;
}): { activeClass: ClassLevel | null; activeGroup: StudyGroup | null } {
  const activeClass = isClassLevel(input.activeClass) ? input.activeClass : null;
  const group = normaliseGroup(input.activeGroup);
  return { activeClass, activeGroup: groupAppliesToClass(activeClass) ? group : null };
}

/**
 * Whether a subject belongs to the active class context.
 *
 * `activeClass === null` means the student has not chosen yet (or skipped
 * onboarding): nothing is hidden, which is the only safe default for a workspace
 * that already held records before classes existed.
 */
export function subjectBelongsToClass(
  subjectClass: number | null | undefined,
  activeClass: ClassLevel | null,
): boolean {
  if (activeClass === null) return true;
  return (subjectClass ?? null) === activeClass;
}

/**
 * Whether an official curriculum version belongs to the active context.
 *
 * Class is matched against `class_grade` ("11", "Class 11", "HSC"…), the group
 * against the version `stream`. A version with no stream is shared across groups
 * — for example the compulsory subjects every HSC student takes — so it is never
 * excluded.
 */
export function versionBelongsToProfile(
  version: { class_grade: string | null; stream: string | null },
  activeClass: ClassLevel | null,
  activeGroup: StudyGroup | null,
): boolean {
  if (activeClass !== null) {
    const span = gradeSpan(version.class_grade);
    /*
     * A published structure covers a *range*: "Class 9–10" is SSC, taken by both
     * Class 9 and Class 10. Comparing only the first number in that string
     * silently hid every official subject from Class 10 and Class 12 students —
     * the two classes that sit the exam. Membership, not equality.
     */
    if (span !== null && (activeClass < span[0] || activeClass > span[1])) return false;
  }
  if (activeGroup !== null && version.stream) {
    const stream = normaliseGroup(version.stream);
    // An unmapped stream value is left visible rather than hidden by guesswork.
    if (stream !== null && stream !== activeGroup) return false;
  }
  return true;
}

/**
 * The classes a published structure covers, as an inclusive range.
 *
 * "Class 9–10" → [9, 10]; "Class 11–12" → [11, 12]; "Class 6" → [6, 6]; "HSC" →
 * [11, 12]; "SSC" → [9, 10]. Returns null when no class can be read, in which
 * case the version is treated as applying to everyone rather than hidden.
 */
export function gradeSpan(value: string | null | undefined): [ClassLevel, ClassLevel] | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  const numeric = value.match(/(\d{1,2})\s*(?:[–—\-−]|to|through)\s*(\d{1,2})/);
  if (numeric?.[1] && numeric[2]) {
    const from = Number.parseInt(numeric[1], 10);
    const to = Number.parseInt(numeric[2], 10);
    if (isClassLevel(from) && isClassLevel(to)) {
      return from <= to ? [from, to] : [to, from];
    }
  }
  // Exam names before bare numbers: "HSC 2026" must not read as Class 20.
  if (/\bhsc\b|higher secondary/.test(lowered)) return [11, 12];
  if (/\bssc\b|secondary school certificate/.test(lowered)) return [9, 10];
  const single = parseGrade(value);
  if (single !== null) return [single, single];
  return null;
}

/** Parse "11", "Class 11", "HSC 2026", "Nine" → a class number, or null. */
export function parseGrade(value: string | null | undefined): ClassLevel | null {
  if (!value) return null;
  const numeric = value.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  if (numeric?.[1]) {
    const parsed = Number.parseInt(numeric[1], 10);
    if (isClassLevel(parsed)) return parsed;
  }
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const lowered = value.toLowerCase();
  for (const [word, level] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`).test(lowered)) return level as ClassLevel;
  }
  // HSC is Classes 11–12; SSC is 9–10. Useful when a source only names the exam.
  if (/\bhsc\b|higher secondary/.test(lowered)) return 11;
  if (/\bssc\b|secondary school certificate/.test(lowered)) return 9;
  return null;
}
