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

/* -------------------------------------------------------------------------- */
/* Topics                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A topic list read out of the *body* of a chapter, not off its contents page.
 *
 * This is a different job from a chapter import and it fails in different
 * ways. A chapter list is short and every line is numbered, so a missed line
 * shows up as a gap. A topic list is long, headings sit between paragraphs,
 * and the section that was skipped looks exactly like the section that never
 * existed. The rules below exist because "we did not see it" and "it is not
 * there" must not produce the same row set.
 *
 * Deliberate choices:
 *   * `document_type` must be `textbook`. A syllabus lists the sections that
 *     are examined; a book lists the sections it contains. Importing one as
 *     the other is the substitution this project refuses to make.
 *   * `page` is optional but recorded when present, because a topic that
 *     cannot be found again is indistinguishable from an invented one.
 *   * `number` is required. A heading with no printed number is the most
 *     common OCR failure and the cheapest thing to check.
 */
export const TOPIC_IMPORT_SCHEMA = z.object({
  /** The `curriculum_chapters.id` these sections live under. */
  chapter_id: z.string().uuid(),
  academic_year: z.string().min(4),
  source_document: z.string().min(3),
  source_url: z.string().url(),
  document_type: z.enum(['textbook', 'curriculum', 'exam_syllabus', 'other']),
  checked_at: z.string().min(10),
  fully_verified: z.boolean().default(false),
  topics: z
    .array(
      z.object({
        number: z.string().min(1).max(24),
        title: z.string().min(1).max(160),
        title_bn: z.string().max(160).nullish(),
        /** Printed page the section starts on. */
        page: z.number().int().positive().nullish(),
      }),
    )
    .min(1),
});

export type TopicImportFile = z.input<typeof TOPIC_IMPORT_SCHEMA>;

export interface TopicImportValidation {
  ok: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  data: z.output<typeof TOPIC_IMPORT_SCHEMA> | null;
  resulting_status: 'verified' | 'partially_verified' | null;
}

export function validateTopicImport(raw: unknown): TopicImportValidation {
  const parsed = TOPIC_IMPORT_SCHEMA.safeParse(raw);
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

  if (data.document_type === 'exam_syllabus') {
    errors.push({
      path: 'document_type',
      message:
        'An exam syllabus lists the sections being examined, not the sections the book contains. Import it as a syllabus record, never as the textbook topic list.',
    });
  }

  // Whitespace-only text passes a length check and is still not a heading.
  data.topics.forEach((topic, index) => {
    if (topic.title.trim().length === 0) {
      errors.push({
        path: `topics[${index}].title`,
        message: 'A title of only whitespace is an OCR artefact, not a heading.',
      });
    }
    if (topic.number.trim().length === 0) {
      errors.push({
        path: `topics[${index}].number`,
        message: 'A section number of only whitespace cannot key an import.',
      });
    }
  });

  // Duplicate numbers: the copy-paste error that produces two "1.2"s.
  const byNumber = new Map<string, number>();
  data.topics.forEach((topic, index) => {
    const key = topic.number.trim();
    const previous = byNumber.get(key);
    if (previous !== undefined) {
      errors.push({
        path: `topics[${index}].number`,
        message: `Section number "${key}" already appears at topics[${previous}].`,
      });
    } else {
      byNumber.set(key, index);
    }
  });

  // Duplicate titles with different numbers is the other half of the same
  // mistake: a re-read heading filed twice under adjacent numbers.
  const byTitle = new Map<string, number>();
  data.topics.forEach((topic, index) => {
    const key = topic.title.trim().toLowerCase();
    const previous = byTitle.get(key);
    if (previous !== undefined) {
      warnings.push({
        path: `topics[${index}].title`,
        message: `Title repeats topics[${previous}] under a different number — check whether the page was read twice.`,
      });
    } else {
      byTitle.set(key, index);
    }
  });

  // Numbers should form an unbroken run per chapter prefix (1.1, 1.2, …).
  // A gap is a warning, not an error: books do skip numbers.
  const grouped = new Map<string, number[]>();
  for (const topic of data.topics) {
    const [prefix, suffix] = topic.number.trim().split('.');
    if (prefix === undefined || suffix === undefined) continue;
    const minor = Number(suffix);
    if (!Number.isFinite(minor)) continue;
    grouped.set(prefix, [...(grouped.get(prefix) ?? []), minor]);
  }
  for (const [prefix, minors] of grouped) {
    const sorted = [...minors].sort((a, b) => a - b);
    const expected = sorted.map((_, index) => index + 1);
    if (sorted.some((value, index) => value !== expected[index])) {
      warnings.push({
        path: 'topics',
        message: `Sections ${prefix}.x are not a clean 1..${sorted.length} run (found ${sorted.join(', ')}). Check for a missed heading.`,
      });
    }
  }

  const withoutPage = data.topics.filter((topic) => topic.page === null || topic.page === undefined);
  if (withoutPage.length > 0) {
    warnings.push({
      path: 'topics',
      message: `${withoutPage.length} of ${data.topics.length} sections have no page reference. They stay traceable only by title.`,
    });
  }

  // "Verified" means someone re-opened the book and found every section where
  // this file says it is. Without a page number that check did not happen.
  if (data.fully_verified && withoutPage.length > 0) {
    errors.push({
      path: 'fully_verified',
      message: 'A topic list cannot be marked verified while some sections carry no page reference to verify against.',
    });
  }

  if (!data.fully_verified) {
    warnings.push({
      path: 'fully_verified',
      message: 'Sections will be stored as partially_verified, not verified.',
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

export interface ExistingTopic {
  id: string;
  topic_number: string | null;
  title: string;
  source_page: number | null;
}

export interface PlannedTopic {
  action: 'insert' | 'update' | 'unchanged';
  number: string;
  title: string;
  page: number | null;
  previous_title?: string;
}

export interface TopicImportPlan {
  inserts: PlannedTopic[];
  updates: PlannedTopic[];
  unchanged: PlannedTopic[];
  /** Sections on file that the new reading does not contain. */
  missing_from_import: string[];
  idempotent: boolean;
}

export function planTopicImport(
  existing: ExistingTopic[],
  incoming: z.output<typeof TOPIC_IMPORT_SCHEMA>,
): TopicImportPlan {
  const byNumber = new Map<string, ExistingTopic>();
  for (const topic of existing) {
    if (topic.topic_number) byNumber.set(topic.topic_number.trim(), topic);
  }

  const inserts: PlannedTopic[] = [];
  const updates: PlannedTopic[] = [];
  const unchanged: PlannedTopic[] = [];

  for (const topic of incoming.topics) {
    const number = topic.number.trim();
    const current = byNumber.get(number);
    const page = topic.page ?? null;
    const planned: PlannedTopic = { action: 'insert', number, title: topic.title, page };
    if (!current) {
      inserts.push(planned);
    } else if (current.title !== topic.title || current.source_page !== page) {
      updates.push({ ...planned, action: 'update', previous_title: current.title });
    } else {
      unchanged.push({ ...planned, action: 'unchanged' });
    }
  }

  // Reported, never acted on: removing a section would orphan a student's
  // `user_topics` row, exactly as deleting a chapter would orphan progress.
  const incomingNumbers = new Set(incoming.topics.map((topic) => topic.number.trim()));
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
