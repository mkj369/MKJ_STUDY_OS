import {
  CURRICULUM_TABLES,
  USER_OWNED_TABLES,
  type RepositoryTable,
  type TableMap,
} from '@/types/domain';
import { DEMO_CURRICULUM } from '@/services/seed/demoCurriculum';
import type { KeyValueStorage } from './storage';
import { STORAGE_PREFIX } from './storage';

export type Row = Record<string, unknown>;

interface DatabaseShape {
  version: 1;
  tables: Record<string, Row[]>;
}

const ALL_TABLES: RepositoryTable[] = [
  ...CURRICULUM_TABLES,
  ...USER_OWNED_TABLES,
  'reminder_preferences',
];

/** Tables whose primary key column is `user_id` instead of `id`. */
const USER_KEYED_TABLES = new Set<RepositoryTable>(['reminder_preferences']);

export class LocalDatabase {
  private readonly storage: KeyValueStorage;
  private readonly storageKey = `${STORAGE_PREFIX}.db`;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  private read(): DatabaseShape {
    const raw = this.storage.getItem(this.storageKey);
    let parsed: DatabaseShape | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as DatabaseShape;
      } catch {
        parsed = null;
      }
    }
    const tables: Record<string, Row[]> = {};
    for (const table of ALL_TABLES) {
      const existing = parsed?.tables?.[table];
      tables[table] = Array.isArray(existing) ? existing : [];
    }
    const db: DatabaseShape = { version: 1, tables };
    this.ensureCurriculum(db);
    return db;
  }

  private ensureCurriculum(db: DatabaseShape): void {
    const versions = db.tables['curriculum_versions'] as unknown as TableMap['curriculum_versions'][];
    if (!versions?.some((v) => v.id === DEMO_CURRICULUM.version.id)) {
      versions?.push({ ...DEMO_CURRICULUM.version });
    }
    const subjects = db.tables['curriculum_subjects'] as unknown as TableMap['curriculum_subjects'][];
    for (const subject of DEMO_CURRICULUM.subjects) {
      if (!subjects.some((s) => s.id === subject.id)) subjects.push({ ...subject });
    }
    const chapters = db.tables['curriculum_chapters'] as unknown as TableMap['curriculum_chapters'][];
    for (const chapter of DEMO_CURRICULUM.chapters) {
      if (!chapters.some((c) => c.id === chapter.id)) chapters.push({ ...chapter });
    }
  }

  private write(db: DatabaseShape): void {
    this.storage.setItem(this.storageKey, JSON.stringify(db));
  }

  rows(table: RepositoryTable): Row[] {
    return this.read().tables[table] ?? [];
  }

  mutate<T>(fn: (db: DatabaseShape) => T): T {
    const db = this.read();
    const result = fn(db);
    this.write(db);
    return result;
  }

  static isUserKeyed(table: RepositoryTable): boolean {
    return USER_KEYED_TABLES.has(table);
  }

  static isCurriculum(table: RepositoryTable): boolean {
    return (CURRICULUM_TABLES as readonly string[]).includes(table);
  }

  clear(): void {
    this.storage.removeItem(this.storageKey);
  }
}
