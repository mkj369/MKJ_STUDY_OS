import { describe, expect, it } from 'vitest';
import { buildImportPreview, importCsvExample, parseImportText, parseCsv } from '@/domain/import';

describe('CSV parsing', () => {
  it('handles quoted fields and commas inside quotes', () => {
    const table = parseCsv('subject,chapter\n"Physics, 1st",Motion\nChemistry,"Atomic, bonding"');
    expect(table).toEqual([
      ['subject', 'chapter'],
      ['Physics, 1st', 'Motion'],
      ['Chemistry', 'Atomic, bonding'],
    ]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('import text', () => {
  it('reads the documented CSV example', () => {
    const parsed = parseImportText(importCsvExample);
    expect(parsed.format).toBe('csv');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows[0]).toEqual({
      subject: 'Physics 1st Paper',
      chapter: 'Chapter 1 — your own title',
      lecture_target: 6,
    });
  });

  it('accepts aliased headers', () => {
    const parsed = parseImportText('Subject Name,Chapter Title,Lectures\nPhysics,Motion,4');
    expect(parsed.rows[0]?.lecture_target).toBe(4);
  });

  it('reports row-level errors without dropping valid rows', () => {
    const parsed = parseImportText('subject,chapter,lecture_target\n,Orphan,3\nPhysics,Motion,4');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.rowNumber).toBe(2);
    expect(parsed.errors[0]?.message).toContain('Subject is required');
  });

  it('reads JSON arrays and { chapters: [...] } objects', () => {
    const array = parseImportText(JSON.stringify([{ subject: 'Physics', chapter: 'Motion', lectureTarget: 5 }]));
    expect(array.format).toBe('json');
    expect(array.rows[0]?.lecture_target).toBe(5);
    const object = parseImportText(JSON.stringify({ chapters: [{ subject: 'Chem', title: 'Bonding' }] }), 'x.json');
    expect(object.rows[0]?.chapter).toBe('Bonding');
  });

  it('explains malformed JSON instead of throwing', () => {
    const parsed = parseImportText('{ not json');
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0]?.message).toContain('Could not read JSON');
  });

  it('rejects an empty file with a clear message', () => {
    const parsed = parseImportText('   ');
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0]?.message).toContain('empty');
  });

  it('rejects out-of-range lecture targets', () => {
    const parsed = parseImportText('subject,chapter,lecture_target\nPhysics,Motion,999');
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors).toHaveLength(1);
  });
});

describe('import preview', () => {
  const existing = [{ subjectName: 'Physics', chapterTitle: 'Motion' }];

  it('marks ready, duplicate-in-file and duplicate-in-workspace rows', () => {
    const parsed = parseImportText(
      'subject,chapter\nPhysics,Motion\nPhysics,Waves\nPhysics,Waves\n',
    );
    const preview = buildImportPreview(parsed, existing, ['Physics']);
    expect(preview.rows.map((r) => r.status)).toEqual(['duplicate', 'ready', 'duplicate']);
    expect(preview.readyCount).toBe(1);
    expect(preview.duplicateCount).toBe(2);
    expect(preview.invalidCount).toBe(0);
  });

  it('matches duplicates case-insensitively and trims whitespace', () => {
    const parsed = parseImportText('subject,chapter\n  physics ,  MOTION ');
    const preview = buildImportPreview(parsed, existing);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.readyCount).toBe(0);
  });

  it('groups subjects and marks which ones already exist', () => {
    const parsed = parseImportText('subject,chapter\nPhysics,Waves\nPhysics,Optics\nChemistry,Bonding');
    const preview = buildImportPreview(parsed, [], ['physics']);
    expect(preview.subjects).toHaveLength(2);
    const physics = preview.subjects.find((s) => s.name === 'Physics');
    expect(physics?.newChapters).toBe(2);
    expect(physics?.existingSubject).toBe(true);
    const chemistry = preview.subjects.find((s) => s.name === 'Chemistry');
    expect(chemistry?.existingSubject).toBe(false);
  });

  it('counts invalid rows from parsing errors', () => {
    const parsed = parseImportText('subject,chapter\n,No subject\nPhysics,Motion');
    const preview = buildImportPreview(parsed, []);
    expect(preview.invalidCount).toBe(1);
    expect(preview.readyCount).toBe(1);
    expect(preview.errors[0]?.rowNumber).toBe(2);
  });

  it('never silently drops rows: ready + duplicate + invalid equals input rows', () => {
    const parsed = parseImportText('subject,chapter\nPhysics,Motion\nPhysics,Motion\nPhysics,Waves\n,broken\n');
    const preview = buildImportPreview(parsed, []);
    expect(preview.readyCount + preview.duplicateCount + preview.invalidCount).toBe(4);
  });
});
