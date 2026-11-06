import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  REFERENCE_CHAPTERS,
  REFERENCE_SUBJECTS,
  REFERENCE_VERSION,
} from '@/services/seed/referenceSyllabus';
import referenceData from '@/services/seed/data/referenceSyllabus.json';

/**
 * The imported reference syllabus exists twice (TypeScript seed for local
 * mode, SQL migration 0009 for cloud). This suite proves:
 *   * the DB rows match the TypeScript rows field for field;
 *   * the TypeScript rows match the captured source JSON verbatim (names,
 *     order, paper relationships) — nothing invented, nothing dropped;
 *   * re-running the migration duplicates nothing;
 *   * user progress linked to a reference chapter survives a re-seed.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

let db: PGlite;

async function applyAll(): Promise<void> {
  for (const file of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
}

async function rows<T>(sql: string): Promise<T[]> {
  await db.exec('reset role');
  const result = await db.query<T>(sql);
  return result.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(BOOTSTRAP, 'utf8'));
  await applyAll();
}, 60_000);

describe('reference syllabus import (0009)', () => {
  it('seeds exactly 1 version, 13 subjects, 128 chapters', async () => {
    const versions = await rows<{ id: string }>(
      `select id from curriculum_versions where id = '${REFERENCE_VERSION.id}'`,
    );
    expect(versions).toHaveLength(1);
    const subjects = await rows<{ id: string }>(
      `select id from curriculum_subjects where curriculum_version_id = '${REFERENCE_VERSION.id}'`,
    );
    expect(subjects).toHaveLength(13);
    const chapters = await rows<{ id: string }>(
      `select c.id from curriculum_chapters c
       join curriculum_subjects s on s.id = c.curriculum_subject_id
       where s.curriculum_version_id = '${REFERENCE_VERSION.id}'`,
    );
    expect(chapters).toHaveLength(128);
  });

  it('matches the TypeScript seed field for field (titles, order, papers)', async () => {
    const dbSubjects = await rows<{
      id: string; name: string; name_bn: string | null; paper_label: string | null;
      code: string | null; sort_order: number; verification_status: string;
    }>(
      `select id, name, name_bn, paper_label, code, sort_order, verification_status
       from curriculum_subjects where curriculum_version_id = '${REFERENCE_VERSION.id}' order by sort_order`,
    );
    expect(dbSubjects).toHaveLength(REFERENCE_SUBJECTS.length);
    REFERENCE_SUBJECTS.forEach((seed, i) => {
      const row = dbSubjects[i];
      expect(row?.id).toBe(seed.id);
      expect(row?.name).toBe(seed.name);
      expect(row?.name_bn).toBe(seed.name_bn);
      expect(row?.paper_label).toBe(seed.paper_label);
      expect(row?.code).toBe(seed.code);
      expect(row?.sort_order).toBe(seed.sort_order);
      expect(row?.verification_status).toBe('needs_verification');
    });

    const dbChapters = await rows<{
      id: string; curriculum_subject_id: string; title: string; chapter_number: string | null; sort_order: number;
    }>(
      `select c.id, c.curriculum_subject_id, c.title, c.chapter_number, c.sort_order
       from curriculum_chapters c
       join curriculum_subjects s on s.id = c.curriculum_subject_id
       where s.curriculum_version_id = '${REFERENCE_VERSION.id}'
       order by s.sort_order, c.sort_order`,
    );
    expect(dbChapters).toHaveLength(REFERENCE_CHAPTERS.length);
    const seedSorted = REFERENCE_SUBJECTS.flatMap((s) =>
      REFERENCE_CHAPTERS.filter((c) => c.curriculum_subject_id === s.id).sort((a, b) => a.sort_order - b.sort_order),
    );
    seedSorted.forEach((seed, i) => {
      const row = dbChapters[i];
      expect(row?.id).toBe(seed.id);
      expect(row?.curriculum_subject_id).toBe(seed.curriculum_subject_id);
      expect(row?.title).toBe(seed.title);
      expect(row?.chapter_number).toBe(seed.chapter_number);
      expect(row?.sort_order).toBe(seed.sort_order);
    });
  });

  it('preserves the captured source data verbatim (no invention, no loss)', () => {
    expect(REFERENCE_SUBJECTS).toHaveLength(referenceData.subjects.length);
    let chapterIndex = 0;
    referenceData.subjects.forEach((source, si) => {
      const seed = REFERENCE_SUBJECTS[si];
      expect(seed?.name).toBe(source.name);
      expect(seed?.paper_label).toBe(source.paper_label);
      expect(seed?.sort_order).toBe(si + 1);
      const chapters = REFERENCE_CHAPTERS.filter((c) => c.curriculum_subject_id === seed?.id);
      expect(chapters).toHaveLength(source.chapters.length);
      source.chapters.forEach((title, ci) => {
        expect(chapters[ci]?.title).toBe(title);
        expect(chapters[ci]?.sort_order).toBe(ci + 1);
        chapterIndex += 1;
      });
    });
    expect(chapterIndex).toBe(128);
    expect(chapterIndex).toBe(referenceData.meta.chapter_total_expected);
  });

  it('records the source and import date on every row', async () => {
    const version = await rows<{ source_url: string; source_checked_at: string; verification_status: string; scope: string }>(
      `select source_url, source_checked_at::text, verification_status, scope from curriculum_versions where id = '${REFERENCE_VERSION.id}'`,
    );
    expect(version[0]?.source_url).toBe('https://hscstudytracker.lovable.app/');
    expect(version[0]?.source_checked_at).toBe('2026-11-07');
    expect(version[0]?.verification_status).toBe('needs_verification');
    const unsourced = await rows<{ count: string }>(
      `select count(*)::text as count from curriculum_chapters c
       join curriculum_subjects s on s.id = c.curriculum_subject_id
       where s.curriculum_version_id = '${REFERENCE_VERSION.id}' and c.source_url is null`,
    );
    expect(Number(unsourced[0]?.count)).toBe(0);
  });

  it('is idempotent and keeps user progress linked to chapter ids', async () => {
    // A user adopts a reference chapter, then the migration re-runs.
    await db.exec('reset role');
    const chapterId = REFERENCE_CHAPTERS[0]!.id;
    const subjectId = REFERENCE_SUBJECTS[0]!.id;
    await db.exec(`
      insert into auth.users (id, email) values ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'ref-test@example.com')
      on conflict (id) do nothing;
    `);
    await db.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', false);
    `);
    await db.exec(`
      insert into user_subjects (id, user_id, curriculum_subject_id, curriculum_version_id, color, sort_order)
      values ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', '${subjectId}', '${REFERENCE_VERSION.id}', '#0f5132', 1);
      insert into user_chapters (id, user_id, user_subject_id, curriculum_chapter_id, curriculum_version_id, status)
      values ('dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', '${chapterId}', '${REFERENCE_VERSION.id}', 'in_progress');
    `);
    await db.exec('reset role');
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    await applyAll(); // re-run every migration as admin
    const counts = await rows<{ subjects: string; chapters: string }>(
      `select
        (select count(*) from curriculum_subjects where curriculum_version_id = '${REFERENCE_VERSION.id}')::text as subjects,
        (select count(*) from curriculum_chapters c join curriculum_subjects s on s.id = c.curriculum_subject_id
          where s.curriculum_version_id = '${REFERENCE_VERSION.id}')::text as chapters`,
    );
    expect(Number(counts[0]?.subjects)).toBe(13);
    expect(Number(counts[0]?.chapters)).toBe(128);
    const progress = await rows<{ status: string; curriculum_chapter_id: string }>(
      `select status, curriculum_chapter_id from user_chapters where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd03'`,
    );
    expect(progress[0]?.status).toBe('in_progress');
    expect(progress[0]?.curriculum_chapter_id).toBe(chapterId);
  });
});
