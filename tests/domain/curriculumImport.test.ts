import { describe, expect, it } from 'vitest';
import { planChapterImport, validateChapterImport } from '@/domain/curriculumImport';

const base = {
  subject_id: 'a0000000-0000-4000-8000-000000000001',
  academic_year: '2025',
  source_document: 'NCTB Physics Class 9–10 (2025), table of contents p. 7',
  source_url: 'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767',
  document_type: 'textbook' as const,
  checked_at: '2026-10-28',
  fully_verified: false,
  chapters: [
    { number: '1', title: 'Chapter one', topics: [] },
    { number: '2', title: 'Chapter two', topics: [{ title: 'Topic 2.1' }] },
  ],
};

function loaded() {
  const result = validateChapterImport(base);
  if (!result.data) throw new Error('fixture did not validate');
  return result.data;
}

describe('validateChapterImport', () => {
  it('accepts a well-formed textbook import and marks it partially verified', () => {
    const result = validateChapterImport(base);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.resulting_status).toBe('partially_verified');
    // Not being fully checked is a warning, not a failure — the rows are still
    // worth importing, they just must not claim to be confirmed.
    expect(result.warnings.map((w) => w.path)).toContain('fully_verified');
  });

  it('marks a confirmed import as verified', () => {
    const result = validateChapterImport({ ...base, fully_verified: true });
    expect(result.resulting_status).toBe('verified');
    expect(result.warnings).toEqual([]);
  });

  it('refuses an exam syllabus as a textbook table of contents', () => {
    const result = validateChapterImport({ ...base, document_type: 'exam_syllabus' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe('document_type');
  });

  it('requires a source document and a URL', () => {
    const result = validateChapterImport({ ...base, source_document: '', source_url: 'not-a-url' });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.path).sort()).toEqual(['source_document', 'source_url']);
  });

  it('rejects duplicate chapter numbers', () => {
    const result = validateChapterImport({
      ...base,
      chapters: [
        { number: '3', title: 'First' },
        { number: '3', title: 'Second' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain('already appears');
  });

  it('warns about a gap in the numbering', () => {
    const result = validateChapterImport({
      ...base,
      chapters: [
        { number: '1', title: 'One' },
        { number: '3', title: 'Three' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.path === 'chapters')).toBe(true);
  });

  it('rejects an empty chapter list and a non-uuid subject', () => {
    expect(validateChapterImport({ ...base, chapters: [] }).ok).toBe(false);
    expect(validateChapterImport({ ...base, subject_id: 'physics' }).ok).toBe(false);
  });
});

describe('planChapterImport', () => {
  it('plans inserts when nothing is stored yet', () => {
    const plan = planChapterImport([], loaded());
    expect(plan.inserts).toHaveLength(2);
    expect(plan.updates).toHaveLength(0);
    expect(plan.idempotent).toBe(false);
  });

  it('plans updates only where a title changed', () => {
    const plan = planChapterImport(
      [
        { id: 'c1', chapter_number: '1', title: 'Chapter one' },
        { id: 'c2', chapter_number: '2', title: 'Chapter two (old)' },
      ],
      loaded(),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates.map((u) => u.previous_title)).toEqual(['Chapter two (old)']);
    expect(plan.unchanged).toHaveLength(1);
  });

  it('is idempotent once the file matches what is stored', () => {
    const plan = planChapterImport(
      [
        { id: 'c1', chapter_number: '1', title: 'Chapter one' },
        { id: 'c2', chapter_number: '2', title: 'Chapter two' },
      ],
      loaded(),
    );
    expect(plan.idempotent).toBe(true);
  });

  it('reports chapters on file that the file no longer lists, without planning a delete', () => {
    const plan = planChapterImport(
      [
        { id: 'c1', chapter_number: '1', title: 'Chapter one' },
        { id: 'c2', chapter_number: '2', title: 'Chapter two' },
        { id: 'c9', chapter_number: '9', title: 'Chapter nine' },
      ],
      loaded(),
    );
    expect(plan.missing_from_import).toEqual(['9']);
    // Never deleted: a student's progress row points at that chapter id.
    expect(plan.idempotent).toBe(true);
  });

  it('ignores stored chapters with no number, which cannot be matched', () => {
    const plan = planChapterImport([{ id: 'x', chapter_number: null, title: 'Unnumbered' }], loaded());
    expect(plan.inserts).toHaveLength(2);
    expect(plan.missing_from_import).toEqual([]);
  });
});
