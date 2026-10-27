import {
  CURRICULUM_TABLES,
  USER_OWNED_TABLES,
  type RepositoryTable,
  type TableMap,
} from '@/types/domain';
import { DEMO_CURRICULUM } from '@/services/seed/demoCurriculum';
import { OFFICIAL_CURRICULUM } from '@/services/seed/officialCurriculum';
import type { KeyValueStorage } from './storage';
import { STORAGE_PREFIX } from './storage';

export type Row = Record<string, unknown>;

/**
 * Columns added after the first release. Browser storage written by an earlier
 * build has no values for them, so they are backfilled on read with the same
 * defaults Postgres would apply. Without this an upgrade would crash the UI on
 * `undefined.map` instead of showing the user's old records.
 */
const COLUMN_DEFAULTS: Partial<Record<RepositoryTable, Record<string, unknown>>> = {
  notes: { kind: 'note', tags: [], is_pinned: false },
  study_sessions: { source: 'manual', client_entry_id: null, user_topic_id: null, user_task_id: null },
  mistake_logs: { attempted_answer: null, lesson_learned: null, resolved_at: null, practice_question_id: null },
  practice_questions: { source: 'user', difficulty: 'medium', tags: [], is_archived: false },
  practice_attempts: { is_correct: null, needs_review: false, time_spent_minutes: null, notes: null },
  daily_blocks: { started_at: null, ended_at: null, source: 'manual', client_entry_id: null, notes: null, custom_label: null },
  user_topics: { status: 'not_recorded', notes: null },
  exam_targets: { exam_type: 'school', priority: 'medium', status: 'planned', coverage_note: null },
  focus_sessions: { break_minutes: 0, planned_intervals: 1, completed_intervals: 0, ended_at: null, status: 'completed', study_session_id: null, notes: null },
};

function normaliseRow(table: RepositoryTable, row: Row): Row {
  const defaults = COLUMN_DEFAULTS[table];
  if (!defaults) return row;
  const next = { ...row };
  for (const [column, value] of Object.entries(defaults)) {
    if (next[column] === undefined) next[column] = Array.isArray(value) ? [] : value;
  }
  return next;
}

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
      tables[table] = Array.isArray(existing) ? existing.map((row) => normaliseRow(table, row)) : [];
    }
    const db: DatabaseShape = { version: 1, tables };
    this.ensureCurriculum(db);
    return db;
  }

  /**
   * Reference data is merged in, never replacing what is already stored: a
   * student's own imported chapters, adopted subjects and progress all keep
   * their ids. Existing curriculum rows are updated in place (the seed is the
   * source of truth for its own deterministic ids) so a later release can
   * correct a mistyped subject name without losing progress.
   */
  private ensureCurriculum(db: DatabaseShape): void {
    this.mergeCurriculum(db, OFFICIAL_CURRICULUM);
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

  private mergeCurriculum(
    db: DatabaseShape,
    bundle: {
      versions: readonly TableMap['curriculum_versions'][];
      subjects: readonly TableMap['curriculum_subjects'][];
    },
  ): void {
    const versions = db.tables['curriculum_versions'] as unknown as TableMap['curriculum_versions'][];
    for (const version of bundle.versions) {
      const existing = versions.findIndex((v) => v.id === version.id);
      if (existing >= 0) versions[existing] = { ...versions[existing], ...version };
      else versions.push({ ...version });
    }
    const subjects = db.tables['curriculum_subjects'] as unknown as TableMap['curriculum_subjects'][];
    for (const subject of bundle.subjects) {
      const existing = subjects.findIndex((s) => s.id === subject.id);
      if (existing >= 0) subjects[existing] = { ...subjects[existing], ...subject };
      else subjects.push({ ...subject });
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
