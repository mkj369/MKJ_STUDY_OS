import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Executes the real migration files and asserts the security model.
 *
 * Engine: PGlite (Postgres 18 compiled to WASM), not a hosted Supabase project.
 * The harness in tests/db/bootstrap.sql supplies faithful stand-ins for the
 * Supabase-managed objects the migrations depend on: the auth schema and
 * auth.uid() (JWT subject claim), the anon/authenticated roles, and
 * storage.buckets / storage.objects / storage.foldername().
 *
 * What this proves: the SQL parses and applies in order, constraints and foreign
 * keys behave as documented, and RLS actually isolates users.
 * What it does not prove: Supabase-specific wiring (PostgREST, GoTrue, the real
 * storage service). Those still need a `supabase db push` on a real project.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

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

async function userExec(userId: string, sql: string): Promise<void> {
  await asUser(userId);
  await db.exec(sql);
}

/** Run SQL as a user and return the error message, or null on success. */
async function captureError(userId: string, sql: string): Promise<string | null> {
  try {
    await userExec(userId, sql);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

async function count(userId: string, table: string): Promise<number> {
  const rows = await userQuery<{ c: number }>(userId, `select count(*)::int as c from ${table}`);
  return rows[0]?.c ?? -1;
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
      ('${USER_A}', 'a@example.test', '{"display_name":"Student A"}'),
      ('${USER_B}', 'b@example.test', '{"display_name":"Student B"}');
  `);
}, 120_000);

describe('migrations apply cleanly', () => {
  it('creates every expected table', async () => {
    const rows = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const tables = rows.rows.map((r) => r.table_name);
    for (const expected of [
      'profiles',
      'curriculum_versions',
      'curriculum_subjects',
      'curriculum_chapters',
      'user_subjects',
      'user_chapters',
      'chapter_checklist_items',
      'chapter_checklist_progress',
      'lecture_records',
      'study_sessions',
      'revision_sessions',
      'topic_difficulties',
      'mistake_logs',
      'exam_results',
      'study_tasks',
      'study_resources',
      'notes',
      'weekly_summaries',
      'reminder_preferences',
      'reminder_events',
      'audit_events',
    ]) {
      expect(tables, `missing table ${expected}`).toContain(expected);
    }
  });

  it('has row level security enabled on every user table', async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const unprotected = rows.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(unprotected).toEqual([]);
  });

  it('provisions a profile and reminder preferences through the auth trigger', async () => {
    const profile = await asAdminProfile();
    expect(profile.display_name).toBe('Student A');
    const prefs = await userQuery<{ channel: string; max_per_day: number }>(
      USER_A,
      'select channel, max_per_day from reminder_preferences',
    );
    expect(prefs[0]?.channel).toBe('in_app');
    expect(prefs[0]?.max_per_day).toBeGreaterThan(0);
  });

  it('round-trips the demo curriculum with explicit verification status', async () => {
    const rows = await userQuery<{ is_demo: boolean; verification_status: string; title: string }>(
      USER_A,
      'select is_demo, verification_status, title from curriculum_versions where is_demo',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_demo).toBe(true);
    expect(rows[0]?.verification_status).toBe('needs_verification');
    expect(rows[0]?.title).toMatch(/not official/i);
    const chapters = await count(USER_A, 'curriculum_chapters');
    expect(chapters).toBeGreaterThan(0);
  });

  it('seeds official subject structure across both levels and all three groups', async () => {
    const versions = await userQuery<{ education_level: string; stream: string; scope: string }>(
      USER_A,
      'select education_level, stream, scope from curriculum_versions where not is_demo order by education_level, stream',
    );
    expect(versions.map((v) => `${v.education_level}/${v.stream}`)).toEqual([
      'HSC/Business Studies',
      'HSC/Humanities',
      'HSC/Science',
      'SSC/Business Studies',
      'SSC/Humanities',
      'SSC/Science',
    ]);
    // Scope is recorded so a subject list is never mistaken for textbook contents.
    expect(versions.every((v) => v.scope === 'subject_structure')).toBe(true);

    const subjects = await userQuery<{ n: number; verified: number }>(
      USER_A,
      `select count(*)::int as n,
              count(*) filter (where s.verification_status = 'verified')::int as verified
         from curriculum_subjects s
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo`,
    );
    expect(subjects[0]?.n).toBeGreaterThan(0);
    expect(subjects[0]?.verified).toBe(0);

    // Chapters exist only where a printed contents page was actually read, and
    // every one of them names its source. Nothing is invented to fill a gap.
    const officialChapters = await userQuery<{ n: number; sourced: number; verified: number }>(
      USER_A,
      `select count(*)::int as n,
              count(*) filter (where c.source_url is not null)::int as sourced,
              count(*) filter (where c.verification_status = 'verified')::int as verified
         from curriculum_chapters c
         join curriculum_subjects s on s.id = c.curriculum_subject_id
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo`,
    );
    expect(officialChapters[0]?.n).toBe(26);
    expect(officialChapters[0]?.sourced).toBe(26);
    // OCR scans of 2022 reprints are evidence, not confirmation.
    expect(officialChapters[0]?.verified).toBe(0);
  });
});

async function asAdminProfile() {
  await db.exec('reset role');
  const rows = await db.query<{ display_name: string }>(
    `select display_name from public.profiles where id = '${USER_A}'`,
  );
  return rows.rows[0] as { display_name: string };
}

describe('row level security isolates users', () => {
  it('lets a user create and read their own records', async () => {
    await userExec(
      USER_A,
      `insert into user_subjects (curriculum_subject_id) values ('d0000000-0000-4000-8000-000000000101');
       insert into user_chapters (user_subject_id, curriculum_chapter_id)
         select id, 'd0000000-0000-4000-8000-000000000201' from user_subjects;
       insert into lecture_records (user_subject_id, user_chapter_id, title, lecture_date)
         select s.id, c.id, 'A private lecture', '2026-10-27'
           from user_subjects s join user_chapters c on c.user_subject_id = s.id;`,
    );
    expect(await count(USER_A, 'lecture_records')).toBe(1);
    expect(await count(USER_A, 'user_subjects')).toBe(1);
  });

  it('hides those records from another user', async () => {
    expect(await count(USER_B, 'user_subjects')).toBe(0);
    expect(await count(USER_B, 'user_chapters')).toBe(0);
    expect(await count(USER_B, 'lecture_records')).toBe(0);
    expect(await count(USER_B, 'profiles')).toBe(1); // only B's own profile
  });

  it('refuses to let one user write a row owned by another', async () => {
    const error = await captureError(
      USER_B,
      `insert into user_subjects (user_id, custom_name) values ('${USER_A}', 'forged')`,
    );
    expect(error).toBeTruthy();
    expect(error).toMatch(/row-level security|violates row-level security/i);
    expect(await count(USER_A, 'user_subjects')).toBe(1);
  });

  it('cannot update or delete another user row', async () => {
    await userExec(USER_B, `update lecture_records set title = 'hijacked'`);
    const titles = await userQuery<{ title: string }>(USER_A, 'select title from lecture_records');
    expect(titles[0]?.title).toBe('A private lecture');

    await userExec(USER_B, 'delete from user_subjects');
    expect(await count(USER_A, 'user_subjects')).toBe(1);
  });

  it('blocks linking to another user parent through the composite foreign key', async () => {
    const subject = await userQuery<{ id: string }>(USER_A, 'select id from user_subjects');
    const subjectId = subject[0]?.id as string;
    const error = await captureError(
      USER_B,
      `insert into lecture_records (user_subject_id, title, lecture_date)
       values ('${subjectId}', 'stolen link', '2026-10-27')`,
    );
    expect(error).toBeTruthy();
    expect(await count(USER_B, 'lecture_records')).toBe(0);
  });

  it('keeps curriculum read-only for normal users', async () => {
    const error = await captureError(
      USER_A,
      `insert into curriculum_versions (authority, country, education_level, class_grade, academic_year, version_label, title)
       values ('attacker', 'BD', 'HSC', '11-12', '2030', 'x', 'Injected')`,
    );
    expect(error).toBeTruthy();
    expect(error).toMatch(/permission denied|row-level security/i);
  });

  it('gives anonymous users no access to private tables', async () => {
    await db.exec('reset role');
    await db.exec('set role anon');
    let error = '';
    try {
      await db.query('select * from public.lecture_records');
    } catch (cause) {
      error = (cause as Error).message;
    }
    expect(error).toMatch(/permission denied/i);

    // Anonymous users have no grant at all, including on curriculum tables:
    // reference data is only exposed to signed-in users by these migrations.
    let curriculumError = '';
    try {
      await db.query('select id from public.curriculum_versions');
    } catch (cause) {
      curriculumError = (cause as Error).message;
    }
    expect(curriculumError).toMatch(/permission denied/i);
    await db.exec('reset role');
  });
});

describe('constraints and foreign keys', () => {
  it('rejects invalid enum-like values and negative durations', async () => {
    const badActivity = await captureError(
      USER_A,
      `insert into study_sessions (user_subject_id, activity_type, session_date, duration_minutes)
       select id, 'scrolling', '2026-10-27', 30 from user_subjects`,
    );
    expect(badActivity).toMatch(/check constraint/i);

    const badDuration = await captureError(
      USER_A,
      `insert into study_sessions (user_subject_id, activity_type, session_date, duration_minutes)
       select id, 'practice', '2026-10-27', 0 from user_subjects`,
    );
    expect(badDuration).toMatch(/check constraint/i);
  });

  it('rejects end before start and more marks than total', async () => {
    const badRange = await captureError(
      USER_A,
      `insert into study_sessions (user_subject_id, activity_type, session_date, duration_minutes, started_at, ended_at)
       select id, 'practice', '2026-10-27', 30, '2026-10-27T10:00:00Z', '2026-10-27T09:00:00Z' from user_subjects`,
    );
    expect(badRange).toMatch(/check constraint/i);

    const badMarks = await captureError(
      USER_A,
      `insert into exam_results (exam_name, exam_type, exam_date, marks_obtained, total_marks)
       values ('Unit test', 'school', '2026-10-27', 60, 50)`,
    );
    expect(badMarks).toMatch(/check constraint/i);
  });

  it('keeps lecture history when a chapter is deleted, and unlinks it', async () => {
    await userExec(USER_A, 'delete from user_chapters');
    const lectures = await userQuery<{ user_chapter_id: string | null }>(
      USER_A,
      'select user_chapter_id from lecture_records',
    );
    expect(lectures).toHaveLength(1);
    expect(lectures[0]?.user_chapter_id).toBeNull();
  });

  it('refuses to delete a subject that still has linked records', async () => {
    const error = await captureError(USER_A, 'delete from user_subjects');
    expect(error).toBeTruthy();
    expect(error).toMatch(/foreign key|restrict/i);
    expect(await count(USER_A, 'user_subjects')).toBe(1);
  });

  it('cascades checklist items when their chapter is deleted', async () => {
    await userExec(
      USER_A,
      `insert into user_chapters (user_subject_id, custom_title) select id, 'Cascade test chapter' from user_subjects;
       insert into chapter_checklist_items (user_chapter_id, kind, label)
         select id, 'reading', 'Main book' from user_chapters;
       insert into chapter_checklist_progress (checklist_item_id, is_done)
         select id, true from chapter_checklist_items;
       delete from user_chapters;`,
    );
    expect(await count(USER_A, 'chapter_checklist_items')).toBe(0);
    expect(await count(USER_A, 'chapter_checklist_progress')).toBe(0);
  });

  it('prevents a second progress row for the same checklist item', async () => {
    await userExec(
      USER_A,
      `insert into user_chapters (user_subject_id, custom_title) select id, 'Unique progress chapter' from user_subjects;
       insert into chapter_checklist_items (user_chapter_id, kind, label)
         select id, 'practice', 'Practice' from user_chapters;
       insert into chapter_checklist_progress (checklist_item_id, is_done)
         select id, true from chapter_checklist_items;`,
    );
    const duplicate = await captureError(
      USER_A,
      `insert into chapter_checklist_progress (checklist_item_id, is_done)
       select id, false from chapter_checklist_items`,
    );
    expect(duplicate).toMatch(/duplicate key|unique/i);
  });
});

describe('audit log is append-only', () => {
  it('accepts an insert but rejects update and delete for clients', async () => {
    await userExec(
      USER_A,
      `insert into audit_events (entity_type, entity_id, action)
       values ('study_tasks', gen_random_uuid(), 'create')`,
    );
    const updateError = await captureError(USER_A, `update audit_events set action = 'delete'`);
    expect(updateError).toMatch(/permission denied|row-level security/i);
    const deleteError = await captureError(USER_A, 'delete from audit_events');
    expect(deleteError).toBeTruthy();
  });
});

describe('storage policy scopes files to the owner', () => {
  it('allows writing inside your own folder and denies another folder', async () => {
    await userExec(
      USER_A,
      `insert into storage.objects (bucket_id, name) values ('study-files', '${USER_A}/note.pdf')`,
    );
    const own = await userQuery<{ name: string }>(USER_A, 'select name from storage.objects');
    expect(own.map((o) => o.name)).toContain(`${USER_A}/note.pdf`);

    const denied = await captureError(
      USER_A,
      `insert into storage.objects (bucket_id, name) values ('study-files', '${USER_B}/steal.pdf')`,
    );
    expect(denied).toMatch(/row-level security|permission denied/i);
  });

  it('hides other users files', async () => {
    const visible = await userQuery<{ name: string }>(USER_B, 'select name from storage.objects');
    expect(visible).toHaveLength(0);
  });
});

describe('deleting an account removes private data', () => {
  it('cascades every owned row when the auth user is removed', async () => {
    await asAdmin(
      `insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'c@example.test')`,
    );
    await userExec(
      '33333333-3333-4333-8333-333333333333',
      `insert into user_subjects (custom_name) values ('Temp subject');
       insert into study_tasks (title) values ('Temp task');
       insert into notes (title, body) values ('Temp note', 'body');`,
    );
    await asAdmin(`delete from auth.users where id = '33333333-3333-4333-8333-333333333333'`);
    const rows = await db.query<{ c: number }>(
      `select
         (select count(*) from public.user_subjects where user_id = '33333333-3333-4333-8333-333333333333')
       + (select count(*) from public.study_tasks where user_id = '33333333-3333-4333-8333-333333333333')
       + (select count(*) from public.notes where user_id = '33333333-3333-4333-8333-333333333333')
       + (select count(*) from public.profiles where id = '33333333-3333-4333-8333-333333333333') as c`,
    );
    expect(rows.rows[0]?.c).toBe(0);
  });
});

describe('phase 2 tables keep the same security model', () => {
  it('creates the new tables with RLS enabled', async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('curriculum_topics','user_topics','daily_blocks','focus_sessions',
                            'exam_targets','practice_questions','practice_attempts')`,
    );
    expect(rows.rows).toHaveLength(7);
    expect(rows.rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it('isolates syllabus topics between users', async () => {
    await asAdmin(
      `insert into auth.users (id, email) values
        ('44444444-4444-4444-8444-444444444444', 'd@example.test'),
        ('55555555-5555-4555-8555-555555555555', 'e@example.test');
       insert into public.user_subjects (id, user_id, custom_name)
       values ('a0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'Topic subject');
       insert into public.user_chapters (id, user_id, user_subject_id, custom_title)
       values ('a0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444',
               'a0000000-0000-4000-8000-000000000001', 'Topic chapter');`,
    );
    await userExec(
      '44444444-4444-4444-8444-444444444444',
      `insert into user_topics (user_chapter_id, custom_title, status)
       values ('a0000000-0000-4000-8000-000000000002', 'Motion graphs', 'in_progress');`,
    );
    expect(await count('44444444-4444-4444-8444-444444444444', 'user_topics')).toBe(1);
    expect(await count('55555555-5555-4555-8555-555555555555', 'user_topics')).toBe(0);

    const forged = await captureError(
      '55555555-5555-4555-8555-555555555555',
      `insert into user_topics (user_id, user_chapter_id, custom_title)
       values ('44444444-4444-4444-8444-444444444444', 'a0000000-0000-4000-8000-000000000002', 'forged')`,
    );
    expect(forged).toMatch(/row-level security/i);
  });

  it('reads demo topics but denies writes to the curriculum', async () => {
    const rows = await userQuery<{ c: number }>(USER_A, 'select count(*)::int as c from curriculum_topics');
    expect(rows[0]?.c).toBeGreaterThan(0);
    const write = await captureError(
      USER_A,
      `insert into curriculum_topics (curriculum_chapter_id, title)
       values ('d0000000-0000-4000-8000-000000000201', 'injected')`,
    );
    expect(write).toMatch(/permission denied|row-level security/i);
  });

  it('requires a label on custom day blocks and rejects impossible durations', async () => {
    await userExec(
      USER_A,
      `insert into daily_blocks (entry_date, category, duration_minutes)
       values ('2026-10-27', 'college', 120)`,
    );
    expect(await count(USER_A, 'daily_blocks')).toBeGreaterThan(0);

    const missingLabel = await captureError(
      USER_A,
      `insert into daily_blocks (entry_date, category, custom_label, duration_minutes)
       values ('2026-10-27', 'custom', null, 60)`,
    );
    expect(missingLabel).toMatch(/check constraint/i);

    const badDuration = await captureError(
      USER_A,
      `insert into daily_blocks (entry_date, category, duration_minutes)
       values ('2026-10-27', 'sleep', 5000)`,
    );
    expect(badDuration).toMatch(/check constraint/i);
  });

  it('prevents duplicate timer submissions through the idempotency key', async () => {
    await userExec(
      USER_A,
      `insert into study_sessions (user_subject_id, activity_type, session_date, duration_minutes, client_entry_id)
       select id, 'practice', '2026-10-27', 25, 'entry-abc-123' from user_subjects limit 1`,
    );
    const duplicate = await captureError(
      USER_A,
      `insert into study_sessions (user_subject_id, activity_type, session_date, duration_minutes, client_entry_id)
       select id, 'practice', '2026-10-27', 25, 'entry-abc-123' from user_subjects limit 1`,
    );
    expect(duplicate).toMatch(/duplicate key|unique/i);
  });

  it('keeps practice attempts with their question and removes them on delete', async () => {
    await userExec(
      USER_A,
      `insert into practice_questions (id, question_text, answer_text, source)
       values ('b0000000-0000-4000-8000-000000000001', 'What is force?', 'mass x acceleration', 'user');
       insert into practice_attempts (practice_question_id, is_correct, needs_review)
       values ('b0000000-0000-4000-8000-000000000001', true, false);`,
    );
    expect(await count(USER_A, 'practice_attempts')).toBe(1);
    await userExec(USER_A, `delete from practice_questions where id = 'b0000000-0000-4000-8000-000000000001'`);
    expect(await count(USER_A, 'practice_attempts')).toBe(0);
  });

  it('links a mistake to a practice question and keeps the mistake when it is deleted', async () => {
    // migration 0005: optional link, composite FK on (id, user_id), ON DELETE SET NULL.
    await userExec(
      USER_A,
      `insert into practice_questions (id, question_text, source)
       values ('b0000000-0000-4000-8000-0000000000aa', 'Linked question', 'user');`,
    );
    await userExec(
      USER_A,
      `insert into mistake_logs (user_subject_id, category, what_went_wrong, occurred_at, practice_question_id)
       select id, 'concept_gap', 'Sign flipped', '2026-10-27', 'b0000000-0000-4000-8000-0000000000aa'
         from user_subjects limit 1;`,
    );
    const linked = await userQuery<{ practice_question_id: string | null }>(
      USER_A,
      `select practice_question_id from mistake_logs where what_went_wrong = 'Sign flipped'`,
    );
    expect(linked[0]?.practice_question_id).toBe('b0000000-0000-4000-8000-0000000000aa');

    // Another user's question is not a valid target, even though the app cannot see it.
    await asAdmin(
      `insert into public.practice_questions (id, user_id, question_text, source)
       values ('b0000000-0000-4000-8000-0000000000bb', '44444444-4444-4444-8444-444444444444', 'Someone else''s question', 'user');`,
    );
    const foreign = await captureError(
      USER_A,
      `insert into mistake_logs (user_subject_id, category, what_went_wrong, occurred_at, practice_question_id)
       select id, 'concept_gap', 'Borrowed question', '2026-10-27', 'b0000000-0000-4000-8000-0000000000bb'
         from user_subjects limit 1;`,
    );
    expect(foreign).toMatch(/foreign key/i);

    await userExec(USER_A, `delete from practice_questions where id = 'b0000000-0000-4000-8000-0000000000aa'`);
    const afterDelete = await userQuery<{ practice_question_id: string | null }>(
      USER_A,
      `select practice_question_id from mistake_logs where what_went_wrong = 'Sign flipped'`,
    );
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.practice_question_id).toBeNull();
  });

  it('scopes exam targets and focus sessions to their owner', async () => {
    await userExec(
      USER_A,
      `insert into exam_targets (title, exam_date, priority) values ('Model test', '2027-01-15', 'high');
       insert into focus_sessions (focus_minutes, started_at) values (25, now());`,
    );
    expect(await count(USER_A, 'exam_targets')).toBeGreaterThan(0);
    expect(await count('44444444-4444-4444-8444-444444444444', 'exam_targets')).toBe(0);
    expect(await count('44444444-4444-4444-8444-444444444444', 'focus_sessions')).toBe(0);
  });
});
