import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 0019 — the study group.
 *
 * Class 11–12 students are examined by stream, so the profile needs to remember
 * one. The point of this file is that the column is *safe*: it is additive, it
 * rejects values the app cannot reason about, and it never invents a group for a
 * student who was already using the app.
 *
 * Engine: PGlite (Postgres in WASM). Hosted Supabase remains unverified.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');
const USER_A = '55555555-5555-4555-8555-555555555555';
const USER_B = '66666666-6666-4666-8666-666666666666';

let db: PGlite;

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
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  // Two students, created the way the app creates them (signup trigger).
  await db.exec(`insert into auth.users (id, email) values ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com')`);
});

describe('0019 study group column', () => {
  it('exists on profiles and starts null, so no group is invented', async () => {
    const rows = await userQuery<{ active_group: string | null }>(USER_A, 'select active_group from profiles');
    expect(rows[0]?.active_group).toBeNull();
  });

  it('accepts the three supported groups', async () => {
    for (const group of ['science', 'humanities', 'business_studies']) {
      await asUser(USER_A);
      await db.exec(`update profiles set active_group = '${group}'`);
      const rows = await userQuery<{ active_group: string }>(USER_A, 'select active_group from profiles');
      expect(rows[0]?.active_group).toBe(group);
    }
  });

  it('rejects a group the app does not model', async () => {
    const message = await errorFrom(USER_A, `update profiles set active_group = 'science-ish'`);
    expect(message).not.toBeNull();
    expect(message?.toLowerCase()).toContain('check');
  });

  it("keeps one student's group out of another student's profile", async () => {
    await asUser(USER_A);
    await db.exec(`update profiles set active_group = 'humanities'`);
    const rows = await userQuery<{ active_group: string | null }>(USER_B, 'select active_group from profiles');
    expect(rows[0]?.active_group).toBeNull();
  });

  it('still enforces the 1–12 class check alongside the group', async () => {
    const message = await errorFrom(USER_A, `update profiles set active_class = 0`);
    expect(message).not.toBeNull();
  });
});
