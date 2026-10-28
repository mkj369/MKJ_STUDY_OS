/**
 * Curriculum / chapter import helpers.
 *
 * The import is deliberately two-phase: parse + preview (validation, duplicate
 * detection) and only then a write with an `import_batch_id` so the whole batch
 * can be undone. No AI-generated syllabus is ever silently trusted: imported
 * rows are user content, marked as not verified.
 */
import { z } from 'zod';
import { importRowSchema } from '@/domain/schemas';
import type { ImportRow } from '@/domain/schemas';

export interface ParsedImport {
  rows: ImportRow[];
  errors: { rowNumber: number; message: string }[];
  format: 'csv' | 'json';
}

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // ignore; newline handled by \n
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  subject: 'subject',
  'subject name': 'subject',
  chapter: 'chapter',
  'chapter name': 'chapter',
  'chapter title': 'chapter',
  'lecture target': 'lecture_target',
  lecture_target: 'lecture_target',
  'lectures': 'lecture_target',
  'lecture count': 'lecture_target',
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseImportText(text: string, fileName?: string): ParsedImport {
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith('[') || trimmed.startsWith('{') || fileName?.toLowerCase().endsWith('.json');
  if (looksJson) return parseJsonImport(trimmed);
  return parseCsvImport(trimmed);
}

function parseJsonImport(text: string): ParsedImport {
  try {
    const raw: unknown = JSON.parse(text);
    const array = Array.isArray(raw)
      ? raw
      : typeof raw === 'object' && raw !== null && 'chapters' in raw && Array.isArray((raw as { chapters: unknown }).chapters)
        ? ((raw as { chapters: unknown[] }).chapters)
        : [];
    const rows: ImportRow[] = [];
    const errors: { rowNumber: number; message: string }[] = [];
    array.forEach((entry, index) => {
      const record = entry as Record<string, unknown>;
      const candidate = {
        subject: String(record['subject'] ?? record['subject_name'] ?? ''),
        chapter: String(record['chapter'] ?? record['chapter_name'] ?? record['title'] ?? ''),
        lecture_target: record['lecture_target'] ?? record['lectureTarget'] ?? '',
      };
      const parsed = importRowSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push({ rowNumber: index + 1, message: parsed.error.issues.map((i) => i.message).join('; ') });
      } else {
        rows.push(parsed.data);
      }
    });
    return { rows, errors, format: 'json' };
  } catch (error) {
    return {
      rows: [],
      errors: [{ rowNumber: 0, message: `Could not read JSON: ${(error as Error).message}` }],
      format: 'json',
    };
  }
}

function parseCsvImport(text: string): ParsedImport {
  const table = parseCsv(text);
  const errors: { rowNumber: number; message: string }[] = [];
  const rows: ImportRow[] = [];
  if (table.length === 0) return { rows, errors: [{ rowNumber: 0, message: 'The file is empty.' }], format: 'csv' };

  const firstRow = table[0] ?? [];
  const hasHeader = firstRow.some((cell) => normalizeHeader(cell) in HEADER_ALIASES);
  let subjectIndex = 0;
  let chapterIndex = 1;
  let targetIndex = 2;
  if (hasHeader) {
    firstRow.forEach((cell, index) => {
      const alias = HEADER_ALIASES[normalizeHeader(cell)];
      if (alias === 'subject') subjectIndex = index;
      if (alias === 'chapter') chapterIndex = index;
      if (alias === 'lecture_target') targetIndex = index;
    });
  }
  const body = hasHeader ? table.slice(1) : table;
  body.forEach((cells, index) => {
    const rowNumber = index + (hasHeader ? 2 : 1);
    const candidate = {
      subject: (cells[subjectIndex] ?? '').trim(),
      chapter: (cells[chapterIndex] ?? '').trim(),
      lecture_target: (cells[targetIndex] ?? '').trim(),
    };
    const parsed = importRowSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ rowNumber, message: parsed.error.issues.map((i) => i.message).join('; ') });
    } else {
      rows.push(parsed.data);
    }
  });
  if (rows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: 0, message: 'No data rows found. Expected columns: subject, chapter, lecture_target.' });
  }
  return { rows, errors, format: 'csv' };
}

export interface ExistingChapterKey {
  subjectName: string;
  chapterTitle: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  subject: string;
  chapter: string;
  lectureTarget: number | null;
  status: 'ready' | 'duplicate' | 'invalid';
  message: string | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  ready: ImportRow[];
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  subjects: { name: string; newChapters: number; existingSubject: boolean }[];
  errors: { rowNumber: number; message: string }[];
}

export function buildImportPreview(
  parsed: ParsedImport,
  existingChapters: ExistingChapterKey[],
  existingSubjectNames: string[] = [],
): ImportPreview {
  const seen = new Set<string>();
  const existing = new Set(
    existingChapters.map((c) => `${c.subjectName.trim().toLowerCase()}::${c.chapterTitle.trim().toLowerCase()}`),
  );
  const subjectNames = new Set(existingSubjectNames.map((s) => s.trim().toLowerCase()));
  const rows: ImportPreviewRow[] = [];
  const ready: ImportRow[] = [];
  const subjects = new Map<string, { name: string; newChapters: number; existingSubject: boolean }>();

  parsed.rows.forEach((row, index) => {
    const key = `${row.subject.trim().toLowerCase()}::${row.chapter.trim().toLowerCase()}`;
    if (existing.has(key)) {
      rows.push({
        rowNumber: index + 1,
        subject: row.subject,
        chapter: row.chapter,
        lectureTarget: row.lecture_target,
        status: 'duplicate',
        message: 'Already in your workspace — will be skipped.',
      });
      return;
    }
    if (seen.has(key)) {
      rows.push({
        rowNumber: index + 1,
        subject: row.subject,
        chapter: row.chapter,
        lectureTarget: row.lecture_target,
        status: 'duplicate',
        message: 'Repeated inside the file — will be skipped.',
      });
      return;
    }
    seen.add(key);
    rows.push({
      rowNumber: index + 1,
      subject: row.subject,
      chapter: row.chapter,
      lectureTarget: row.lecture_target,
      status: 'ready',
      message: null,
    });
    ready.push(row);
    const entry = subjects.get(key.split('::')[0] ?? row.subject) ?? {
      name: row.subject.trim(),
      newChapters: 0,
      existingSubject: subjectNames.has(row.subject.trim().toLowerCase()),
    };
    entry.newChapters += 1;
    subjects.set(key.split('::')[0] ?? row.subject, entry);
  });

  return {
    rows,
    ready,
    readyCount: ready.length,
    duplicateCount: rows.filter((r) => r.status === 'duplicate').length,
    invalidCount: parsed.errors.length,
    subjects: [...subjects.values()],
    errors: parsed.errors,
  };
}

export const importJsonExample = JSON.stringify(
  [
    { subject: 'Physics 1st Paper', chapter: 'Chapter 1 — your own title', lecture_target: 6 },
    { subject: 'Physics 1st Paper', chapter: 'Chapter 2 — your own title', lecture_target: null },
  ],
  null,
  2,
);

export const importCsvExample = `subject,chapter,lecture_target
Physics 1st Paper,Chapter 1 — your own title,6
Physics 1st Paper,Chapter 2 — your own title,
Chemistry 1st Paper,Chapter 1 — your own title,4`;

export { z };
