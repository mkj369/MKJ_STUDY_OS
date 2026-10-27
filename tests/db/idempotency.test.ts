import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migrations must be safe to re-apply.
 *
 * The README tells people they can paste the files into the SQL editor "in order" and
 * that they are idempotent. Supabase's `db push` can also re-run a file after a partial
 * failure. This test executes the whole set twice against one database and fails on the
 * first statement that is not guarded.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function applyAll(db: PGlite): Promise<void> {
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`${file} failed on re-apply: ${(error as Error).message}`);
    }
  }
}

describe('migrations are idempotent', () => {
  it('applies every migration twice without error and keeps the schema intact', async () => {
    const db = new PGlite();
    await db.exec(readFileSync(BOOTSTRAP, 'utf8'));

    await applyAll(db);
    const first = await db.query<{ c: number }>(
      `select count(*)::int as c from information_schema.tables where table_schema = 'public'`,
    );

    await applyAll(db);
    const second = await db.query<{ c: number }>(
      `select count(*)::int as c from information_schema.tables where table_schema = 'public'`,
    );

    expect(second.rows[0]?.c).toBe(first.rows[0]?.c);
    expect(first.rows[0]?.c ?? 0).toBeGreaterThan(20);

    // The newest migration's column must survive the second pass.
    const column = await db.query<{ c: number }>(
      `select count(*)::int as c from information_schema.columns
        where table_schema = 'public' and table_name = 'mistake_logs' and column_name = 'practice_question_id'`,
    );
    expect(column.rows[0]?.c).toBe(1);

    await db.close();
  }, 60_000);
});
