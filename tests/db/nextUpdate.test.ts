import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration 0008 surfaces: targets, lecture checklists, community privacy,
 * preferences. Executes the real SQL in PGlite and asserts RLS behaviour —
 * in particular that a private community row is invisible to other users and
 * that turning sharing off immediately hides it again.
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

async function captureError(userId: string, sql: string): Promise<string | null> {
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
  for (const file of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  await asAdmin(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'a@example.test'),
      ('${USER_B}', 'b@example.test');
  `);
});

describe('study_targets RLS', () => {
  it('isolates targets between users and rejects forged ownership', async () => {
    await asUser(USER_A);
    await db.exec(`
      insert into public.study_targets (id, user_id, title, period_type, period_start, metric, target_value)
      values ('aaaaaaaa-0000-4000-8000-000000000001', '${USER_A}', 'Finish Mechanics', 'weekly', '2026-11-02', 'chapters', 2);
    `);
    const own = await userQuery(USER_A, 'select title from public.study_targets');
    expect(own).toHaveLength(1);
    const other = await userQuery(USER_B, 'select title from public.study_targets');
    expect(other).toHaveLength(0);

    const forged = await captureError(
      USER_B,
      `insert into public.study_targets (user_id, title, period_type, period_start, metric, target_value)
       values ('${USER_A}', 'forged', 'weekly', '2026-11-02', 'minutes', 60);`,
    );
    expect(forged).toMatch(/row-level security/i);

    // B cannot edit or delete A's target either.
    await asUser(USER_B);
    await db.exec(`update public.study_targets set title = 'hacked' where user_id = '${USER_A}'`);
    const unchanged = await userQuery<{ title: string }>(USER_A, 'select title from public.study_targets');
    expect(unchanged[0]?.title).toBe('Finish Mechanics');
  });

  it('rejects invalid metrics and non-positive goals at the database level', async () => {
    const badMetric = await captureError(
      USER_A,
      `insert into public.study_targets (title, period_type, period_start, metric, target_value)
       values ('x', 'weekly', '2026-11-02', 'vibes', 3);`,
    );
    expect(badMetric).toMatch(/check constraint/i);
    const badGoal = await captureError(
      USER_A,
      `insert into public.study_targets (title, period_type, period_start, metric, target_value)
       values ('x', 'monthly', '2026-11-01', 'minutes', 0);`,
    );
    expect(badGoal).toMatch(/check constraint/i);
  });
});

describe('lecture_checklist_items RLS + composite FK', () => {
  const LECTURE_A = 'aaaaaaaa-0000-4000-8000-000000000010';
  const SUBJECT_A = 'aaaaaaaa-0000-4000-8000-000000000011';

  beforeAll(async () => {
    await asUser(USER_A);
    await db.exec(`
      insert into public.user_subjects (id, user_id, custom_name)
      values ('${SUBJECT_A}', '${USER_A}', 'Physics');
      insert into public.lecture_records (id, user_id, user_subject_id, title, lecture_date)
      values ('${LECTURE_A}', '${USER_A}', '${SUBJECT_A}', 'Vectors 1', '2026-11-01');
    `);
  });

  it('saves items with defaults and keeps them private', async () => {
    await asUser(USER_A);
    await db.exec(`
      insert into public.lecture_checklist_items (lecture_record_id, user_id, label, sort_order)
      values ('${LECTURE_A}', '${USER_A}', 'Watched the lecture', 1);
    `);
    const rows = await userQuery<{ is_done: boolean }>(
      USER_A,
      `select is_done from public.lecture_checklist_items where lecture_record_id = '${LECTURE_A}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_done).toBe(false);
    const invisible = await userQuery(USER_B, 'select * from public.lecture_checklist_items');
    expect(invisible).toHaveLength(0);
  });

  it("rejects attaching an item to another user's lecture even with own user_id", async () => {
    const error = await captureError(
      USER_B,
      `insert into public.lecture_checklist_items (lecture_record_id, user_id, label)
       values ('${LECTURE_A}', '${USER_B}', 'sneaky');`,
    );
    expect(error).toMatch(/foreign key/i);
  });

  it('cascades item deletion when the lecture is deleted', async () => {
    await asUser(USER_A);
    await db.exec(`delete from public.lecture_records where id = '${LECTURE_A}'`);
    const rows = await userQuery(USER_A, 'select * from public.lecture_checklist_items');
    expect(rows).toHaveLength(0);
  });
});

describe('community_profiles privacy', () => {
  it('is private by default: another user cannot see a non-shared row', async () => {
    await asUser(USER_A);
    await db.exec(`
      insert into public.community_profiles (user_id, pseudonym, overall_percent, chapters_completed, chapters_total, weekly_minutes)
      values ('${USER_A}', 'Quiet Falcon', 42, 5, 12, 180);
    `);
    const own = await userQuery(USER_A, 'select pseudonym from public.community_profiles');
    expect(own).toHaveLength(1);
    const other = await userQuery(USER_B, 'select pseudonym from public.community_profiles');
    expect(other).toHaveLength(0);
  });

  it('becomes visible only after explicit opt-in, and hides again on opt-out', async () => {
    await asUser(USER_A);
    await db.exec(`update public.community_profiles set sharing_enabled = true where user_id = '${USER_A}'`);
    const visible = await userQuery<{ pseudonym: string }>(
      USER_B,
      `select pseudonym from public.community_profiles where user_id = '${USER_A}'`,
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.pseudonym).toBe('Quiet Falcon');

    await asUser(USER_A);
    await db.exec(`update public.community_profiles set sharing_enabled = false where user_id = '${USER_A}'`);
    const hidden = await userQuery(USER_B, `select * from public.community_profiles where user_id = '${USER_A}'`);
    expect(hidden).toHaveLength(0);
  });

  it('rejects forged rows and edits by other users', async () => {
    const forged = await captureError(
      USER_B,
      `insert into public.community_profiles (user_id, pseudonym) values ('${USER_A}', 'Impostor');`,
    );
    expect(forged).toMatch(/row-level security|duplicate key/i);

    await asUser(USER_A);
    await db.exec(`update public.community_profiles set sharing_enabled = true where user_id = '${USER_A}'`);
    await asUser(USER_B);
    await db.exec(`update public.community_profiles set pseudonym = 'vandalised' where user_id = '${USER_A}'`);
    const rows = await userQuery<{ pseudonym: string }>(
      USER_A,
      `select pseudonym from public.community_profiles where user_id = '${USER_A}'`,
    );
    expect(rows[0]?.pseudonym).toBe('Quiet Falcon');
  });

  it('has no contact-data columns at all', async () => {
    await asAdmin('select 1');
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'community_profiles'`,
    );
    const names = columns.rows.map((r) => r.column_name);
    for (const forbidden of ['email', 'phone', 'location', 'address', 'display_name']) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe('user_preferences and profile setup fields', () => {
  it('stores theme per user with RLS isolation', async () => {
    await asUser(USER_A);
    await db.exec(`insert into public.user_preferences (user_id, theme) values ('${USER_A}', 'dark')`);
    const rows = await userQuery<{ theme: string }>(USER_A, 'select theme from public.user_preferences');
    expect(rows[0]?.theme).toBe('dark');
    const other = await userQuery(USER_B, 'select * from public.user_preferences');
    expect(other).toHaveLength(0);
    const invalid = await captureError(
      USER_A,
      `update public.user_preferences set theme = 'neon' where user_id = '${USER_A}'`,
    );
    expect(invalid).toMatch(/check constraint/i);
  });

  it('stores private chapter notes on user_chapters with own-RLS', async () => {
    const subjectId = '33333333-3333-4333-8333-333333333333';
    const chapterId = '44444444-4444-4444-8444-444444444444';
    await asUser(USER_A);
    await db.exec(`
      insert into public.user_subjects (id, user_id, custom_name)
      values ('${subjectId}', '${USER_A}', 'Physics notes test')
      on conflict (id) do nothing;
      insert into public.user_chapters (id, user_id, user_subject_id, custom_title, notes)
      values ('${chapterId}', '${USER_A}', '${subjectId}', 'Vectors', 'My private derivation notes')
      on conflict (id) do update set notes = excluded.notes;
    `);
    const mine = await userQuery<{ notes: string }>(
      USER_A,
      `select notes from public.user_chapters where id = '${chapterId}'`,
    );
    expect(mine[0]?.notes).toBe('My private derivation notes');
    const theirs = await userQuery(USER_B, `select * from public.user_chapters where id = '${chapterId}'`);
    expect(theirs).toHaveLength(0);
  });

  it('accepts the three academic tracks and rejects anything else', async () => {
    await asUser(USER_A);
    await db.exec(`
      insert into public.profiles (id, display_name) values ('${USER_A}', 'A')
      on conflict (id) do nothing;
    `);
    await db.exec(`update public.profiles set academic_track = 'hsc_admission' where id = '${USER_A}'`);
    const rows = await userQuery<{ academic_track: string }>(
      USER_A,
      `select academic_track from public.profiles where id = '${USER_A}'`,
    );
    expect(rows[0]?.academic_track).toBe('hsc_admission');
    const invalid = await captureError(
      USER_A,
      `update public.profiles set academic_track = 'primary' where id = '${USER_A}'`,
    );
    expect(invalid).toMatch(/check constraint/i);
  });
});
