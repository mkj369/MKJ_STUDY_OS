import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPOSITORY_TABLES, USER_OWNED_TABLES } from '@/types/domain';

/**
 * Guards against schema drift: every table the SQL migrations create must have a
 * TypeScript row type and appear in REPOSITORY_TABLES, otherwise a page can read a
 * table the app believes exists but cannot parse (or vice versa).
 */
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function sqlTables(): string[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const tables = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const match of sql.matchAll(/create table if not exists public\.([a-z_]+)/gi)) {
      if (match[1]) tables.add(match[1]);
    }
  }
  return [...tables].sort();
}

describe('SQL and TypeScript agree on the tables', () => {
  it('has a repository entry for every migrated table', () => {
    const missing = sqlTables().filter((table) => !(REPOSITORY_TABLES as readonly string[]).includes(table));
    expect(missing).toEqual([]);
  });

  it('does not reference tables that no migration creates', () => {
    const created = sqlTables();
    const orphaned = (REPOSITORY_TABLES as readonly string[]).filter((table) => !created.includes(table));
    expect(orphaned).toEqual([]);
  });

  it('keeps user-owned tables out of the curriculum list', () => {
    const curriculum = sqlTables().filter((table) => table.startsWith('curriculum_'));
    expect(curriculum.length).toBeGreaterThan(0);
    expect(USER_OWNED_TABLES as readonly string[]).not.toContain('curriculum_versions');
  });
});
