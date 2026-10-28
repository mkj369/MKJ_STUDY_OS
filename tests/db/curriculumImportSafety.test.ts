import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The guarantees migration 0008 has to hold for a curriculum import.
 *
 * These are the rules that make "re-running an import is safe" a property of
 * the database rather than a promise in a document:
 *
 *   * a chapter is unique per (subject, chapter number), so an import updates
 *     instead of duplicating;
 *   * a row cannot claim `verified` without naming its source;
 *   * `partially_verified` is a first-class state on every table;
 *   * a student's progress row keeps pointing at the same chapter id after the
 *     import re-runs.
 *
 * The chapter titles used here are synthetic (`Fixture chapter …`) and live on
 * a throwaway subject created inside this test. No invented title is ever
 * written under an official NCTB subject, not even in a test fixture.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

const FIXTURE_VERSION = 'f0000000-0000-4000-8000-000000000001';
const FIXTURE_SUBJECT = 'f0000000-0000-4000-8000-000000000002';
const STUDENT = '99999999-9999-4999-8999-999999999999';

let db: PGlite;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function exec(sql: string): Promise<void> {
  await db.exec('reset role');
  await db.exec(sql);
}

async function rows<T>(sql: string): Promise<T[]> {
  await db.exec('reset role');
  const result = await db.query<T>(sql);
  return result.rows;
}

/** The upsert the documented import format uses. */
function importChapter(title: string, number: string, status = 'needs_verification', source: string | null = null) {
  return `
    insert into public.curriculum_chapters
      (curriculum_subject_id, title, chapter_number, sort_order, verification_status, source_url, source_document)
    values ('${FIXTURE_SUBJECT}', '${title}', '${number}', ${Number(number)}, '${status}',
            ${source ? `'${source}'` : 'null'}, 'Fixture textbook, p. 1')
    on conflict (curriculum_subject_id, chapter_number) where chapter_number is not null
    do update set
      title               = excluded.title,
      sort_order          = excluded.sort_order,
      verification_status = excluded.verification_status,
      source_url          = excluded.source_url,
      source_document     = excluded.source_document
    returning id`;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(BOOTSTRAP, 'utf8'));
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  await exec(`insert into auth.users (id) values ('${STUDENT}')`);
  await exec(`
    insert into public.curriculum_versions
      (id, authority, country, education_level, class_grade, stream, academic_year,
       version_label, title, source_url, scope, verification_status, is_demo)
    values ('${FIXTURE_VERSION}', 'Test fixture', 'Bangladesh', 'SSC', 'Class 9–10', 'Science', '2099',
            'fixture-version', 'Fixture version (test only)', 'https://example.invalid/fixture',
            'textbook', 'needs_verification', false)`);
  await exec(`
    insert into public.curriculum_subjects
      (id, curriculum_version_id, name, name_bn, is_compulsory, sort_order,
       verification_status, source_url)
    values ('${FIXTURE_SUBJECT}', '${FIXTURE_VERSION}', 'Fixture subject', 'ফিক্সচার', true, 1,
            'needs_verification', 'https://example.invalid/fixture')`);
}, 60_000);

describe('curriculum import safety', () => {
  it('accepts partially_verified on every curriculum table', async () => {
    for (const [table, column, id] of [
      ['curriculum_versions', 'id', FIXTURE_VERSION],
      ['curriculum_subjects', 'id', FIXTURE_SUBJECT],
    ] as const) {
      await exec(`update public.${table} set verification_status = 'partially_verified' where ${column} = '${id}'`);
      const [row] = await rows<{ verification_status: string }>(
        `select verification_status from public.${table} where ${column} = '${id}'`,
      );
      expect(row?.verification_status).toBe('partially_verified');
    }
  });

  it('rejects a verified chapter that names no source', async () => {
    await expect(exec(importChapter('Fixture chapter 1', '1', 'verified', null))).rejects.toThrow(
      /curriculum_chapters_verified_needs_source/,
    );
  });

  it('creates the chapter once and updates it on re-import', async () => {
    const [first] = await rows<{ id: string }>(importChapter('Fixture chapter 1', '1'));
    const [second] = await rows<{ id: string }>(importChapter('Fixture chapter 1 (revised)', '1'));

    expect(second?.id).toBe(first?.id);

    const chapters = await rows<{ title: string }>(
      `select title from public.curriculum_chapters where curriculum_subject_id = '${FIXTURE_SUBJECT}'`,
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.title).toBe('Fixture chapter 1 (revised)');
  });

  it('accepts a verified chapter once the source is named', async () => {
    await exec(importChapter('Fixture chapter 1', '1', 'verified', 'https://example.invalid/fixture-toc'));
    const [row] = await rows<{ verification_status: string; source_document: string | null }>(
      `select verification_status, source_document from public.curriculum_chapters
        where curriculum_subject_id = '${FIXTURE_SUBJECT}' and chapter_number = '1'`,
    );
    expect(row?.verification_status).toBe('verified');
    expect(row?.source_document).toBe('Fixture textbook, p. 1');
  });

  it('keeps student progress attached across a re-import', async () => {
    const [chapter] = await rows<{ id: string }>(
      `select id from public.curriculum_chapters
        where curriculum_subject_id = '${FIXTURE_SUBJECT}' and chapter_number = '1'`,
    );

    await exec(`
      insert into public.user_subjects
        (id, user_id, curriculum_subject_id, curriculum_version_id, status, color, sort_order, is_demo)
      values ('f0000000-0000-4000-8000-000000000003', '${STUDENT}', '${FIXTURE_SUBJECT}',
              '${FIXTURE_VERSION}', 'active', '#1d4ed8', 1, false)`);
    await exec(`
      insert into public.user_chapters
        (id, user_id, user_subject_id, curriculum_chapter_id, status, is_demo)
      values ('f0000000-0000-4000-8000-000000000004', '${STUDENT}',
              'f0000000-0000-4000-8000-000000000003', '${chapter!.id}', 'complete', false)`);

    // Re-import twice, the way a corrected list would be applied.
    await exec(importChapter('Fixture chapter 1', '1', 'verified', 'https://example.invalid/fixture-toc'));
    await exec(importChapter('Fixture chapter 1', '1', 'verified', 'https://example.invalid/fixture-toc'));

    const [progress] = await rows<{ status: string; curriculum_chapter_id: string | null }>(
      `select status, curriculum_chapter_id from public.user_chapters
        where id = 'f0000000-0000-4000-8000-000000000004'`,
    );
    expect(progress?.status).toBe('complete');
    expect(progress?.curriculum_chapter_id).toBe(chapter!.id);
  });

  it('rejects a duplicate chapter number within the same subject', async () => {
    await expect(
      exec(`insert into public.curriculum_chapters
              (curriculum_subject_id, title, chapter_number, sort_order)
            values ('${FIXTURE_SUBJECT}', 'Fixture duplicate', '1', 2)`),
    ).rejects.toThrow(/curriculum_chapters_subject_number_key/);
  });

  it('rejects a duplicate pending requirement', async () => {
    const insert = `insert into public.curriculum_pending_requirements
        (education_level, stream, academic_year, requirement, status)
      values ('SSC', 'all', '2099', 'Fixture requirement', 'awaiting_source')`;
    await exec(insert);
    // Postgres truncates generated constraint names at 63 characters.
    await expect(exec(insert)).rejects.toThrow(/curriculum_pending_requiremen/);
  });

  it('reports chapters only for the subjects whose contents page was read', async () => {
    const [row] = await rows<{ chapters: number; subjects: number; with_chapters: number }>(
      `select coalesce(sum(chapter_count), 0)::int as chapters,
              count(*)::int as subjects,
              count(*) filter (where chapter_count > 0)::int as with_chapters
         from public.curriculum_coverage
        where curriculum_subject_id::text not like 'f0000000%' and not version_is_demo`,
    );
    // The inventory is complete for SSC/HSC subject structure; the chapter data
    // covers two subjects out of 80 and the report says so rather than rounding
    // the gap away.
    expect(row!.subjects).toBeGreaterThan(70);
    expect(row!.with_chapters).toBe(3);
    expect(row!.chapters).toBe(41);
  });
});
