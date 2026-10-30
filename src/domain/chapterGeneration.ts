/**
 * Chapter generation.
 *
 * The single most repetitive thing a student does is type "Chapter 1", "Chapter
 * 2", … twelve times. This module does that arithmetic and nothing else: it is
 * pure, so the numbers can be tested without a database or a browser.
 *
 * Two rules it never breaks:
 *   1. Numbers are never duplicated within a subject.
 *   2. A generated title is a placeholder, never official curriculum data. It is
 *      stored as a user-created title and is editable from the first render.
 */

export interface ExistingChapter {
  id: string;
  /** Explicit number when known, otherwise null (derived from position). */
  chapter_number: number | null;
  title: string;
  sort_order: number;
}

export interface NewChapterSpec {
  chapter_number: number;
  title: string;
  sort_order: number;
}

/** Numbers already taken in this subject, ignoring gaps and nulls. */
export function usedChapterNumbers(chapters: ExistingChapter[]): number[] {
  return chapters
    .map((chapter) => chapter.chapter_number)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
}

/**
 * The next number a student would expect.
 *
 * Highest existing number + 1, not count + 1: deleting Chapter 3 must not make
 * the next chapter re-use 3, and a student who imported 1–15 then deletes 7
 * should get 16, not 15 again.
 */
export function nextChapterNumber(chapters: ExistingChapter[]): number {
  const used = usedChapterNumbers(chapters);
  const highest = used[used.length - 1];
  return highest === undefined ? 1 : highest + 1;
}

/** Default placeholder title. Deliberately plain — this is the student's label. */
export function placeholderTitle(chapterNumber: number): string {
  return `Chapter ${chapterNumber}`;
}

/**
 * Plan `count` new chapters, continuing past the highest existing number.
 *
 * `count` is clamped to a sane range: 1–200. The upper bound is not arbitrary —
 * it is the same limit the import validator already applies, so a pasted "9999"
 * cannot create a subject with thousands of rows by accident.
 */
export function planChapterGeneration(
  chapters: ExistingChapter[],
  count: number,
  options: { startAt?: number | null } = {},
): NewChapterSpec[] {
  const safeCount = Math.min(200, Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)));
  if (safeCount === 0) return [];

  const start = options.startAt && options.startAt > 0 ? Math.floor(options.startAt) : nextChapterNumber(chapters);
  const taken = new Set(usedChapterNumbers(chapters));
  const highestOrder = chapters.reduce((max, chapter) => Math.max(max, chapter.sort_order), 0);

  const planned: NewChapterSpec[] = [];
  let candidate = start;
  while (planned.length < safeCount) {
    // Skip over a number another chapter already holds instead of colliding.
    if (!taken.has(candidate)) {
      planned.push({
        chapter_number: candidate,
        title: placeholderTitle(candidate),
        sort_order: highestOrder + planned.length + 1,
      });
      taken.add(candidate);
    }
    candidate += 1;
  }
  return planned;
}

/** Convenience for the "add one chapter" button. */
export function planSingleChapter(chapters: ExistingChapter[]): NewChapterSpec | null {
  return planChapterGeneration(chapters, 1)[0] ?? null;
}

/**
 * A preview line for the confirmation dialog.
 * "Chapter 5 – Chapter 16 (12 chapters)" tells the student exactly what will exist.
 */
export function describeGeneration(planned: NewChapterSpec[]): string {
  const head = planned[0];
  if (!head) return 'No chapters to add.';
  const first = head.chapter_number;
  const last = planned[planned.length - 1]?.chapter_number ?? first;
  const noun = planned.length === 1 ? 'chapter' : 'chapters';
  if (planned.length === 1) return `Chapter ${first}`;
  return `Chapter ${first} – Chapter ${last} (${planned.length} ${noun})`;
}

/**
 * Renaming only ever changes a title. It returns the patch, not a new record, so
 * callers cannot accidentally delete-and-recreate and lose checklist progress,
 * notes, revision history or study logs attached to the chapter id.
 */
export function renamePatch(input: {
  title?: string;
  titleBn?: string | null;
  chapterNumber?: number | null;
}): { custom_title?: string | null; chapter_title_bn?: string | null; chapter_number?: number | null } {
  const patch: { custom_title?: string | null; chapter_title_bn?: string | null; chapter_number?: number | null } = {};
  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    // An empty title is not a rename — it would render as a blank row. The UI
    // offers "restore default" for that instead.
    patch.custom_title = trimmed.length > 0 ? trimmed : null;
  }
  if (input.titleBn !== undefined) {
    const trimmed = (input.titleBn ?? '').trim();
    patch.chapter_title_bn = trimmed.length > 0 ? trimmed : null;
  }
  if (input.chapterNumber !== undefined) {
    patch.chapter_number =
      input.chapterNumber === null || !Number.isFinite(input.chapterNumber)
        ? null
        : Math.max(1, Math.floor(input.chapterNumber));
  }
  return patch;
}

/** True when the title is still the untouched generated placeholder. */
export function isPlaceholderTitle(title: string): boolean {
  return /^Chapter\s+\d+$/i.test(title.trim());
}

/**
 * Reorder a list by moving one chapter to a new index, returning id → sort_order
 * patches. Sorting rewrites `sort_order` only; ids never change, so progress and
 * every record pointing at a chapter stay attached.
 */
export function planReorder(chapters: ExistingChapter[], fromIndex: number, toIndex: number): { id: string; sort_order: number }[] {
  if (chapters.length === 0) return [];
  const from = Math.max(0, Math.min(chapters.length - 1, fromIndex));
  const to = Math.max(0, Math.min(chapters.length - 1, toIndex));
  if (from === to) return [];

  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
  const [moved] = ordered.splice(from, 1);
  if (!moved) return [];
  ordered.splice(to, 0, moved);
  return ordered.map((chapter, index) => ({ id: chapter.id, sort_order: index + 1 }));
}

/**
 * Normalise the order of a chapter list for display: explicit order first, then
 * number, then title. Used everywhere chapters are listed so the syllabus, the
 * subject page and the export never disagree.
 */
export function sortChapters<T extends { sort_order: number; chapter_number: number | null; title: string }>(chapters: T[]): T[] {
  return [...chapters].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      (a.chapter_number ?? Number.MAX_SAFE_INTEGER) - (b.chapter_number ?? Number.MAX_SAFE_INTEGER) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Detect a likely duplicate subject before it is saved.
 *
 * Comparison is case- and whitespace-insensitive, and treats "Physics 1st Paper"
 * and "Physics — 1st Paper" as the same thing, because those two strings produce
 * two subject cards that look identical and confuse the student later.
 */
export function normaliseSubjectKey(name: string, paperLabel: string | null | undefined): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[—–\-_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  let subjectName = clean(name);
  let paper = paperLabel ? clean(paperLabel) : '';
  /*
   * "Physics — 1st Paper" typed as the whole name is the same subject as
   * "Physics" + paper "1st Paper". Without this split the duplicate check would
   * happily create two cards that read identically on screen.
   */
  if (!paper) {
    const suffix = subjectName.match(/^(.*\S)\s+(\d\s*st|\d\s*nd|\d\s*rd|\d\s*th)\s+paper$/);
    if (suffix?.[1] && suffix[2]) {
      subjectName = suffix[1];
      paper = `${suffix[2].replace(/\s+/g, '')} paper`;
    }
  }
  return paper ? `${subjectName}|${paper}` : subjectName;
}

export function findDuplicateSubject(
  existing: { id: string; name: string; paperLabel: string | null; classLevel: number | null }[],
  candidate: { name: string; paperLabel?: string | null; classLevel: number | null },
): { id: string; name: string; paperLabel: string | null; classLevel: number | null } | null {
  const key = normaliseSubjectKey(candidate.name, candidate.paperLabel ?? null);
  if (!key) return null;
  return (
    existing.find(
      (subject) =>
        subject.classLevel === candidate.classLevel &&
        normaliseSubjectKey(subject.name, subject.paperLabel) === key,
    ) ?? null
  );
}
