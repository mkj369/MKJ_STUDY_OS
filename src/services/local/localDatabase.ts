import {
  CURRICULUM_TABLES,
  USER_OWNED_TABLES,
  type RepositoryTable,
  type TableMap,
} from '@/types/domain';
import { DEMO_CURRICULUM } from '@/services/seed/demoCurriculum';
import { demoFixturesEnabled } from '@/config/release';
import { OFFICIAL_CURRICULUM } from '@/services/seed/officialCurriculum';
import { CURRICULUM_SOURCES, PENDING_REQUIREMENTS } from '@/services/seed/curriculumReadiness';
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
  version: number;
  tables: Record<string, Row[]>;
}

/**
 * Schema version of the local document store.
 *
 *   1 — first release: one JSON blob, tables created on demand.
 *   2 — class scoping (user_subjects.class_level) and profile view settings
 *       (active_class, active_group, theme) became columns. Existing rows get
 *       explicit nulls so every reader can rely on the key being present.
 *
 * Migrations only ever add or normalise; nothing is deleted, and a store written
 * by a later version is left untouched rather than downgraded.
 */
const SCHEMA_VERSION = 2;

function migrate(db: DatabaseShape): boolean {
  if (db.version >= SCHEMA_VERSION) return false;
  if (db.version < 2) {
    for (const profile of (db.tables['profiles'] ?? []) as Row[]) {
      profile['active_class'] ??= null;
      profile['active_group'] ??= null;
      profile['onboarded_at'] ??= null;
      profile['theme_mode'] ??= 'system';
      profile['theme_preset'] ??= 'sky';
      profile['theme_accent'] ??= null;
    }
    for (const subject of (db.tables['user_subjects'] ?? []) as Row[]) {
      subject['class_level'] ??= null;
      subject['paper_label'] ??= null;
      subject['name_bn'] ??= null;
    }
    for (const chapter of (db.tables['user_chapters'] ?? []) as Row[]) {
      chapter['chapter_number'] ??= null;
      chapter['chapter_title_bn'] ??= null;
    }
  }
  db.version = SCHEMA_VERSION;
  return true;
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
    const db: DatabaseShape = {
      version: typeof parsed?.version === 'number' ? parsed.version : 1,
      tables,
    };
    const migrated = migrate(db);
    this.ensureCurriculum(db);
    // Persist the migration once, so the next read is already on the new shape.
    if (migrated) this.write(db);
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
    /*
     * The demo curriculum ("Demo chapter 1 — mechanics") is a fixture. Merging
     * it into a store build would put placeholder chapter titles in the
     * template list of every new install, so it is only merged when the demo
     * fixtures are enabled. Rows already in a student's store are left alone.
     */
    if (demoFixturesEnabled()) {
      this.mergeCurriculum(db, {
        versions: [DEMO_CURRICULUM.version],
        subjects: DEMO_CURRICULUM.subjects,
        chapters: DEMO_CURRICULUM.chapters,
      });
    }
    this.mergeReadiness(db);
  }

  /**
   * Source registry and outstanding requirements, merged by natural key so a
   * later release can correct a note or flip `access_state` once a document
   * becomes readable without duplicating the row.
   */
  private mergeReadiness(db: DatabaseShape): void {
    const sources = db.tables['curriculum_sources'] as unknown as TableMap['curriculum_sources'][];
    for (const source of CURRICULUM_SOURCES) {
      const index = sources.findIndex(
        (s) => s.url === source.url && s.document_type === source.document_type,
      );
      if (index >= 0) sources[index] = { ...sources[index], ...source, id: sources[index]!.id };
      else sources.push({ ...source });
    }

    const requirements = db.tables[
      'curriculum_pending_requirements'
    ] as unknown as TableMap['curriculum_pending_requirements'][];
    for (const requirement of PENDING_REQUIREMENTS) {
      const index = requirements.findIndex(
        (r) =>
          r.education_level === requirement.education_level &&
          r.academic_year === requirement.academic_year &&
          r.stream === requirement.stream &&
          r.requirement === requirement.requirement,
      );
      if (index >= 0) requirements[index] = { ...requirements[index], ...requirement, id: requirements[index]!.id };
      else requirements.push({ ...requirement });
    }
  }

  private mergeCurriculum(
    db: DatabaseShape,
    bundle: {
      versions: readonly TableMap['curriculum_versions'][];
      subjects: readonly TableMap['curriculum_subjects'][];
      chapters: readonly TableMap['curriculum_chapters'][];
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

    // Chapters merge by id, never by position: a student's `user_chapters` row
    // points at this id, so re-running the seed may refresh a title but must
    // never replace the row. Nothing is deleted here — a chapter that disappears
    // from the seed would leave the student's record orphaned.
    const chapters = db.tables['curriculum_chapters'] as unknown as TableMap['curriculum_chapters'][];
    for (const chapter of bundle.chapters) {
      const existing = chapters.findIndex((c) => c.id === chapter.id);
      if (existing >= 0) chapters[existing] = { ...chapters[existing], ...chapter };
      else chapters.push({ ...chapter });
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
