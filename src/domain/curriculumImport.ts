/**
 * Official curriculum import — validation and planning, no side effects.
 *
 * This is operator tooling, not a student feature. The student-facing importer
 * in `src/domain/import.ts` creates *personal* chapters; this one transcribes
 * an official NCTB table of contents into `curriculum_chapters` /
 * `curriculum_topics`. They are deliberately separate: personal imports are
 * allowed to be unverified and private, official ones must cite a document and
 * must be safe to re-run.
 *
 * Three rules are enforced here, and again in SQL (migration 0008), because a
 * rule that only lives in TypeScript is a rule someone will bypass with a
 * direct insert:
 *
 *   1. A chapter list may not be imported without naming the document it came
 *      from, and that document must be a whole-textbook source, not an exam
 *      syllabus. An exam syllabus lists the chapters being examined, which is a
 *      different and usually shorter list.
 *   2. Chapter numbers must be unique inside the file. Duplicates are how a
 *      copy-paste error turns into two chapters both called "Chapter 3".
 *   3. Re-running the import must be a no-op. `planChapterImport` classifies
 *      every row as insert / update / unchanged against what is already
 *      stored, so the caller can prove idempotency before writing anything.
 */
import { z } from 'zod';

export const CHAPTER_IMPORT_SCHEMA = z.object({
  /** The `curriculum_subjects.id` this list belongs to. */
  subject_id: z.string().uuid(),
  /** Must match the version's `academic_year` — a 2025 list cannot fill a 2026 row. */
  academic_year: z.string().min(4),
  /** Whole-textbook artefact the rows were read from. */
  source_document: z.string().min(3),
  source_url: z.string().url(),
  document_type: z.enum(['textbook', 'curriculum', 'exam_syllabus', 'other']),
  /** ISO date the human compared the document with these rows. */
  checked_at: z.string().min(10),
  /**
   * Whether the transcriber verified every row against the document. `false`
   * imports the rows as `partially_verified` — present, but not confirmed.
   */
  fully_verified: z.boolean().default(false),
  chapters: z
    .array(
      z.object({
        number: z.string().min(1),
        title: z.string().min(1).max(160),
        title_bn: z.string().max(160).nullish(),
        topics: z
          .array(z.object({ title: z.string().min(1).max(160), title_bn: z.string().max(160).nullish() }))
          .default([]),
      }),
    )
    .min(1),
});

export type ChapterImportFile = z.input<typeof CHAPTER_IMPORT_SCHEMA>;

export interface ImportIssue {
  /** Dotted path into the file, e.g. `chapters[3].title`. */
  path: string;
  message: string;
}

export interface ImportValidation {
  ok: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  data: z.output<typeof CHAPTER_IMPORT_SCHEMA> | null;
  /** What the rows would be stored as, before any write happens. */
  resulting_status: 'verified' | 'partially_verified' | null;
}

export function validateChapterImport(raw: unknown): ImportValidation {
  const parsed = CHAPTER_IMPORT_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
      warnings: [],
      data: null,
      resulting_status: null,
    };
  }

  const data = parsed.data;
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  // An exam syllabus is a subset of the book by construction. Importing it as
  // the textbook's contents would make a partial list look complete.
  if (data.document_type === 'exam_syllabus') {
    errors.push({
      path: 'document_type',
      message:
        'An exam syllabus is not a textbook table of contents and cannot be imported as one. It omits chapters that are not examined.',
    });
  }

  const seen = new Map<string, number>();
  data.chapters.forEach((chapter, index) => {
    const key = chapter.number.trim();
    const previous = seen.get(key);
    if (previous !== undefined) {
      errors.push({
        path: `chapters[${index}].number`,
        message: `Chapter number "${key}" already appears at chapters[${previous}].`,
      });
    } else {
      seen.set(key, index);
    }
  });

  // Numeric chapters should run 1..n without gaps. A gap is usually a missed
  // page; it is not an error because some books genuinely skip a number.
  const numeric = data.chapters.map((chapter) => Number(chapter.number)).filter((n) => Number.isFinite(n));
  if (numeric.length === data.chapters.length) {
    const sorted = [...numeric].sort((a, b) => a - b);
    const expected = sorted.map((_, index) => index + 1);
    if (sorted.some((value, index) => value !== expected[index])) {
      warnings.push({
        path: 'chapters',
        message: `Chapter numbers are not a clean 1..${data.chapters.length} sequence (found ${sorted.join(', ')}). Check for a skipped or duplicated page.`,
      });
    }
  }

  if (!data.fully_verified) {
    warnings.push({
      path: 'fully_verified',
      message: 'Rows will be stored as partially_verified, not verified.',
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data,
    resulting_status: data.fully_verified ? 'verified' : 'partially_verified',
  };
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

export interface ExistingChapter {
  id: string;
  chapter_number: string | null;
  title: string;
}

export interface PlannedChapter {
  action: 'insert' | 'update' | 'unchanged';
  number: string;
  title: string;
  previous_title?: string;
  topics: number;
}

export interface ImportPlan {
  inserts: PlannedChapter[];
  updates: PlannedChapter[];
  unchanged: PlannedChapter[];
  /** Numeric chapters on file that the file no longer mentions. */
  missing_from_import: string[];
  /** True when a re-run would write nothing. */
  idempotent: boolean;
}

export function planChapterImport(
  existing: ExistingChapter[],
  incoming: z.output<typeof CHAPTER_IMPORT_SCHEMA>,
): ImportPlan {
  const byNumber = new Map<string, ExistingChapter>();
  for (const chapter of existing) {
    if (chapter.chapter_number) byNumber.set(chapter.chapter_number.trim(), chapter);
  }

  const inserts: PlannedChapter[] = [];
  const updates: PlannedChapter[] = [];
  const unchanged: PlannedChapter[] = [];

  for (const chapter of incoming.chapters) {
    const number = chapter.number.trim();
    const current = byNumber.get(number);
    const planned: PlannedChapter = {
      action: 'insert',
      number,
      title: chapter.title,
      topics: chapter.topics.length,
    };
    if (!current) {
      inserts.push(planned);
    } else if (current.title !== chapter.title) {
      updates.push({ ...planned, action: 'update', previous_title: current.title });
    } else {
      unchanged.push({ ...planned, action: 'unchanged' });
    }
  }

  const incomingNumbers = new Set(incoming.chapters.map((chapter) => chapter.number.trim()));
  const missing = [...byNumber.keys()]
    .filter((number) => !incomingNumbers.has(number))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return {
    inserts,
    updates,
    unchanged,
    missing_from_import: missing,
    idempotent: inserts.length === 0 && updates.length === 0,
  };
}
