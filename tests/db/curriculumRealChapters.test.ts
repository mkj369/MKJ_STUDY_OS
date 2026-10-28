import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The first genuinely imported curriculum data (migration 0010).
 *
 * Two official NCTB textbooks — SSC Physics and SSC Chemistry — were read from
 * scans of the printed সূচিপত্র and encoded here. These tests pin down the parts
 * that matter for a student:
 *
 *   * the chapter counts and numbering are what the printed page says;
 *   * the two subjects are `partially_verified`, never `verified`, because the
 *     source is a 2022 OCR scan and not the 2025 edition;
 *   * re-running the migration changes nothing and destroys nothing;
 *   * a student's progress record survives a re-import and still points at the
 *     same chapter;
 *   * nothing claims `verified` without a source anywhere in the database.
 *
 * The test deliberately does not re-type the chapter titles as an oracle. It
 * reads them back from the database, which is the same thing a student sees.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

const PHYSICS_SUBJECT = 'a0000000-0000-4000-8000-000000001111';
const CHEMISTRY_SUBJECT = 'a0000000-0000-4000-8000-000000001112';
const STUDENT = '77777777-7777-4777-8777-777777777777';

let db: PGlite;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function applyAllMigrations(): Promise<void> {
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
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

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(BOOTSTRAP, 'utf8'));
  await applyAllMigrations();
  await exec(`insert into auth.users (id) values ('${STUDENT}')`);
}, 120_000);

describe('imported SSC Physics and Chemistry chapters', () => {
  it('stores exactly the 14 Physics chapters from the printed contents page', async () => {
    const chapters = await rows<{ chapter_number: string; title: string; sort_order: number }>(
      `select chapter_number, title, sort_order
         from public.curriculum_chapters
        where curriculum_subject_id = '${PHYSICS_SUBJECT}'
        order by sort_order`,
    );

    expect(chapters.map((row) => row.chapter_number)).toEqual(
      Array.from({ length: 14 }, (_, index) => String(index + 1)),
    );
    expect(chapters[0]?.title).toBe('ভৌত রাশি এবং পরিমাপ');
    expect(chapters[3]?.title).toBe('কাজ, ক্ষমতা ও শক্তি');
    expect(chapters[6]?.title).toBe('তরঙ্গ ও শব্দ');
    expect(chapters[13]?.title).toBe('জীবন বাঁচাতে পদার্থবিজ্ঞান');
  });

  it('stores exactly the 12 Chemistry chapters from the printed contents page', async () => {
    const chapters = await rows<{ chapter_number: string; title: string }>(
      `select chapter_number, title
         from public.curriculum_chapters
        where curriculum_subject_id = '${CHEMISTRY_SUBJECT}'
        order by sort_order`,
    );

    expect(chapters).toHaveLength(12);
    expect(chapters[0]?.title).toBe('রসায়নের ধারণা');
    expect(chapters[7]?.title).toBe('রসায়ন ও শক্তি');
    expect(chapters[11]?.title).toBe('আমাদের জীবনে রসায়ন');
  });

  it('keeps every imported chapter and subject at partially_verified with a source', async () => {
    const chapters = await rows<{ verification_status: string; source_url: string | null }>(
      `select verification_status, source_url
         from public.curriculum_chapters
        where curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')`,
    );
    expect(chapters).toHaveLength(26);
    for (const chapter of chapters) {
      expect(chapter.verification_status).toBe('partially_verified');
      expect(chapter.source_url).toContain('archive.org/details/');
    }

    const subjects = await rows<{ verification_status: string; source_document: string | null }>(
      `select verification_status, source_document
         from public.curriculum_subjects
        where id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')`,
    );
    expect(subjects).toHaveLength(2);
    for (const subject of subjects) {
      expect(subject.verification_status).toBe('partially_verified');
      expect(subject.source_document).toContain('সূচিপত্র');
    }
  });

  it('invents no topics for the imported chapters', async () => {
    const topics = await rows<{ count: number }>(
      `select count(*)::int as count
         from public.curriculum_topics t
         join public.curriculum_chapters c on c.id = t.curriculum_chapter_id
        where c.curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')`,
    );
    expect(topics[0]?.count).toBe(0);
  });

  it('never lets any row claim verified without a source', async () => {
    const orphans = await rows<{ table_name: string }>(`
      select 'chapters' as table_name from public.curriculum_chapters
       where verification_status = 'verified' and source_url is null
      union all
      select 'subjects' from public.curriculum_subjects
       where verification_status = 'verified' and source_url is null
      union all
      select 'versions' from public.curriculum_versions
       where verification_status = 'verified' and source_url is null
    `);
    expect(orphans).toEqual([]);
  });
});

describe('re-running the import', () => {
  it('changes nothing on a second application', async () => {
    const before = await rows<{ id: string; title: string; verification_status: string }>(
      `select id, title, verification_status
         from public.curriculum_chapters
        where curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')
        order by curriculum_subject_id, sort_order`,
    );

    await applyAllMigrations();

    const after = await rows<{ id: string; title: string; verification_status: string }>(
      `select id, title, verification_status
         from public.curriculum_chapters
        where curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')
        order by curriculum_subject_id, sort_order`,
    );

    expect(after).toEqual(before);
  });

  it('keeps a student chapter record through a re-import, on the same chapter', async () => {
    await exec(`select set_config('request.jwt.claim.sub', '${STUDENT}', false)`);

    const [userSubject] = await rows<{ id: string }>(`
      insert into public.user_subjects (user_id, curriculum_subject_id, is_demo)
      values ('${STUDENT}', '${PHYSICS_SUBJECT}', false)
      returning id
    `);
    const [chapter] = await rows<{ id: string }>(
      `select id from public.curriculum_chapters
        where curriculum_subject_id = '${PHYSICS_SUBJECT}' and chapter_number = '7'`,
    );

    await exec(`
      insert into public.user_chapters (user_id, user_subject_id, curriculum_chapter_id, status)
      values ('${STUDENT}', '${userSubject!.id}', '${chapter!.id}', 'complete')
    `);

    await applyAllMigrations();

    const records = await rows<{ curriculum_chapter_id: string; status: string }>(
      `select curriculum_chapter_id, status from public.user_chapters where user_id = '${STUDENT}'`,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.curriculum_chapter_id).toBe(chapter!.id);
    expect(records[0]?.status).toBe('complete');

    await exec(`select set_config('request.jwt.claim.sub', '', false)`);
  });
});
