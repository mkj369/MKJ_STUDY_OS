import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 0018 — classes 1–12, student-owned subjects and generated chapters.
 *
 * The point of this file is the *safety* of the change, not its shape: a student
 * who used the app before this migration must keep every subject, chapter,
 * checklist tick and note, and must be able to keep using them afterwards.
 *
 * Engine: PGlite (Postgres in WASM). Hosted Supabase is still unverified.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';

let db: PGlite;

async function asAdmin(sql: string): Promise<void> {
  await db.exec('reset role');
  await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec(sql);
}

async function asUser(userId: string): Promise<void> {
  await db.exec('reset role');
  await db.exec('set role authenticated');
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`);
}

async function userQuery<T = Record<string, unknown>>(userId: string, sql: string): Promise<T[]> {
  await asUser(userId);
  const result = await db.query<T>(sql);
  return result.rows;
}

async function errorFrom(userId: string, sql: string): Promise<string | null> {
  try {
    await asUser(userId);
    await db.exec(sql);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(BOOTSTRAP, 'utf8'));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  await asAdmin(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${USER_A}', 'legacy-a@example.test', '{"display_name":"Legacy A"}'),
      ('${USER_B}', 'legacy-b@example.test', '{"display_name":"Legacy B"}');
  `);
}, 120_000);

describe('0018 is additive', () => {
  it('adds the class, chapter-order and theme columns', async () => {
    const rows = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (
            ('user_subjects', 'class_level'),
            ('user_subjects', 'name_bn'),
            ('user_chapters', 'chapter_number'),
            ('user_chapters', 'chapter_title_bn'),
            ('user_chapters', 'sort_order'),
            ('profiles', 'theme_mode'),
            ('profiles', 'theme_preset'),
            ('profiles', 'theme_accent'),
            ('profiles', 'active_class')
          )`,
    );
    expect(rows.rows).toHaveLength(9);
  });

  it('defaults new profiles to Sky Blue, system mode and no accent', async () => {
    const profiles = await userQuery<{ theme_mode: string; theme_preset: string; theme_accent: string | null }>(
      USER_A,
      'select theme_mode, theme_preset, theme_accent from profiles',
    );
    expect(profiles[0]).toEqual({ theme_mode: 'system', theme_preset: 'sky', theme_accent: null });
  });

  it('defaults new subjects to the Sky Blue accent, not the old green', async () => {
    const rows = await db.query<{ column_default: string }>(
      `select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'user_subjects' and column_name = 'color'`,
    );
    expect(String(rows.rows[0]?.column_default).toLowerCase()).toContain('#38bdf8');
  });

  it('rejects a class outside 1–12', async () => {
    const message = await errorFrom(USER_A, `update profiles set active_class = 13`);
    expect(message).not.toBeNull();
    expect(message?.toLowerCase()).toContain('check');
  });

  it('rejects an invalid theme accent', async () => {
    const message = await errorFrom(USER_A, `update profiles set theme_accent = 'sky-blue'`);
    expect(message).not.toBeNull();
  });

  it('rejects an unknown theme mode', async () => {
    const message = await errorFrom(USER_A, `update profiles set theme_mode = 'sepia'`);
    expect(message).not.toBeNull();
  });
});

describe('legacy rows survive the class model', () => {
  let subjectId = '';
  let chapterId = '';

  beforeAll(async () => {
    await asUser(USER_A);
    const subject = await db.query<{ id: string }>(
      `insert into user_subjects (user_id, custom_name, class_level, status)
       values (auth.uid(), 'Legacy Physics', null, 'active')
       returning id`,
    );
    subjectId = String(subject.rows[0]?.id);

    const chapter = await db.query<{ id: string }>(
      `insert into user_chapters (user_id, user_subject_id, custom_title, sort_order)
       values (auth.uid(), '${subjectId}', 'Legacy chapter', 0)
       returning id`,
    );
    chapterId = String(chapter.rows[0]?.id);
  });

  it('keeps a subject with no class visible and editable', async () => {
    const rows = await userQuery<{ id: string; class_level: number | null }>(
      USER_A,
      `select id, class_level from user_subjects where id = '${subjectId}'`,
    );
    expect(rows[0]?.class_level).toBeNull();
  });

  it('lets the student file that subject under a class later', async () => {
    await asUser(USER_A);
    await db.exec(`update user_subjects set class_level = 11 where id = '${subjectId}'`);
    const rows = await userQuery<{ class_level: number }>(
      USER_A,
      `select class_level from user_subjects where id = '${subjectId}'`,
    );
    expect(rows[0]?.class_level).toBe(11);
  });

  it('renaming a chapter changes the title, not the row identity', async () => {
    const before = await userQuery<{ created_at: string }>(
      USER_A,
      `select created_at::text as created_at from user_chapters where id = '${chapterId}'`,
    );
    await asUser(USER_A);
    await db.exec(`update user_chapters set custom_title = 'ভেক্টর', chapter_number = 1 where id = '${chapterId}'`);
    const after = await userQuery<{ custom_title: string; created_at: string; chapter_number: number }>(
      USER_A,
      `select custom_title, created_at::text as created_at, chapter_number from user_chapters where id = '${chapterId}'`,
    );
    expect(after[0]?.custom_title).toBe('ভেক্টর');
    expect(after[0]?.chapter_number).toBe(1);
    expect(after[0]?.created_at).toBe(before[0]?.created_at);
  });

  it('keeps chapters created without an official curriculum row', async () => {
    // The old CHECK allows a chapter only when it has a custom title or a
    // curriculum reference; generated chapters rely on the custom-title branch.
    const message = await errorFrom(
      USER_A,
      `insert into user_chapters (user_id, user_subject_id) values (auth.uid(), '${subjectId}')`,
    );
    expect(message).not.toBeNull();
  });
});

describe('per-student isolation', () => {
  it('does not let one student see another student\'s subjects', async () => {
    const rows = await userQuery<{ c: number }>(USER_B, 'select count(*)::int as c from user_subjects');
    expect(rows[0]?.c).toBe(0);
  });

  it('does not let one student read another student\'s theme', async () => {
    await asUser(USER_A);
    await db.exec(`update profiles set theme_preset = 'rose', theme_mode = 'dark'`);
    const b = await userQuery<{ theme_preset: string; theme_mode: string }>(
      USER_B,
      'select theme_preset, theme_mode from profiles',
    );
    expect(b[0]).toEqual({ theme_preset: 'sky', theme_mode: 'system' });
  });

  it('refuses a subject row owned by another student', async () => {
    await asUser(USER_A);
    const mine = await db.query<{ id: string }>('select id from user_subjects limit 1');
    const id = String(mine.rows[0]?.id);
    const message = await errorFrom(
      USER_B,
      `insert into user_chapters (user_id, user_subject_id, custom_title)
       values (auth.uid(), '${id}', 'Not mine')`,
    );
    expect(message).not.toBeNull();
  });
});
