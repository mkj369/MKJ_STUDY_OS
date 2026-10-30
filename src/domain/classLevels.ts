/**
 * Classes 1–12.
 *
 * Bangladesh school education runs Classes 1–10 and college runs Classes 11–12.
 * The app treats "class" as the primary way a student organises curriculum:
 * one class holds its own subjects, and switching class is a view change, not a
 * data operation.
 *
 * No academic year is required anywhere. A student in Class 9 adds Physics once
 * and keeps it; the year they are in it is optional metadata they can ignore.
 */

export const CLASS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

export const MIN_CLASS = 1;
export const MAX_CLASS = 12;

export type SchoolStage = 'primary' | 'secondary' | 'higher_secondary';

export interface ClassGroup {
  stage: SchoolStage;
  label: string;
  /** Short label for a compact chip row. */
  shortLabel: string;
  classes: ClassLevel[];
}

export const CLASS_GROUPS: ClassGroup[] = [
  { stage: 'primary', label: 'Primary', shortLabel: 'Primary', classes: [1, 2, 3, 4, 5] },
  { stage: 'secondary', label: 'High School', shortLabel: 'High', classes: [6, 7, 8, 9, 10] },
  { stage: 'higher_secondary', label: 'College', shortLabel: 'College', classes: [11, 12] },
];

/** Levels at which subjects are commonly examined as two separate papers. */
export const PAPER_LEVELS: ClassLevel[] = [9, 10, 11, 12];

export function isClassLevel(value: unknown): value is ClassLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_CLASS && value <= MAX_CLASS;
}

/** Accepts a form string ("11") and returns a valid class, or null. */
export function parseClassLevel(value: string | number | null | undefined): ClassLevel | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
  return isClassLevel(numeric) ? numeric : null;
}

export function classStage(level: ClassLevel): SchoolStage {
  if (level <= 5) return 'primary';
  if (level <= 10) return 'secondary';
  return 'higher_secondary';
}

export function classLabel(level: ClassLevel | null): string {
  return level === null ? 'No class' : `Class ${level}`;
}

/** e.g. "Class 11 · College". Used where the stage adds real context. */
export function classWithStageLabel(level: ClassLevel): string {
  const group = CLASS_GROUPS.find((entry) => entry.classes.includes(level));
  return group ? `Class ${level} · ${group.label}` : `Class ${level}`;
}

/** The class a student is most likely to be in, used only as a default. */
export const DEFAULT_CLASS: ClassLevel = 9;

/**
 * Whether the paper-label field is worth showing for a class. It is shown from
 * Class 9 up, where two-paper subjects are normal, and hidden below that — but
 * the field is never hidden once a value exists, so nothing is lost.
 */
export function paperLabelRelevant(level: ClassLevel | null, hasExistingLabel = false): boolean {
  if (hasExistingLabel) return true;
  if (level === null) return true;
  return PAPER_LEVELS.includes(level);
}

/** Standard paper labels offered as one-tap options. Students may type their own. */
export const PAPER_LABEL_SUGGESTIONS = ['1st Paper', '2nd Paper', '3rd Paper'] as const;

/** Bengali forms, used for display and search. Only exact known labels map. */
const PAPER_LABEL_BN: Record<string, string> = {
  '1st Paper': '১ম পত্র',
  '2nd Paper': '২য় পত্র',
  '3rd Paper': '৩য় পত্র',
};

export function paperLabelBn(label: string | null | undefined): string | null {
  if (!label) return null;
  return PAPER_LABEL_BN[label] ?? null;
}
