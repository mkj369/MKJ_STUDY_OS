/**
 * Offline-first sync contracts.
 *
 * Model: the local database is the working copy. Every local mutation is
 * diffed into a persisted outbox; the engine pushes ops in order and pulls
 * full per-user tables. Conflict rule: if the server row changed since the
 * student's edit was based on it (updated_at newer than the op's base),
 * SERVER WINS — the op is dropped, the local row is refreshed, and the
 * conflict is reported. Stale local data can never overwrite newer server
 * data.
 */
import type { RepositoryTable } from '@/types/domain';
import type { Row } from '@/services/local/localDatabase';

/**
 * Tables replicated to the cloud. Device-local logs (audit_events,
 * reminder_events) are intentionally excluded: they describe this device,
 * and replicating them would duplicate notification history across devices.
 */
export const SYNC_TABLES: RepositoryTable[] = [
  'profiles',
  'user_subjects',
  'user_chapters',
  'user_topics',
  'chapter_checklist_items',
  'chapter_checklist_progress',
  'lecture_records',
  'lecture_checklist_items',
  'study_sessions',
  'revision_sessions',
  'topic_difficulties',
  'mistake_logs',
  'study_tasks',
  'exam_results',
  'exam_targets',
  'study_resources',
  'notes',
  'daily_blocks',
  'focus_sessions',
  'practice_questions',
  'practice_attempts',
  'weekly_summaries',
  'study_targets',
  'reminder_preferences',
  'user_preferences',
  'community_profiles',
];

/** Curriculum is pulled (read-only) but never pushed. */
export const CURRICULUM_SYNC_TABLES: RepositoryTable[] = [
  'curriculum_versions',
  'curriculum_subjects',
  'curriculum_chapters',
  'curriculum_topics',
];

const USER_KEYED_TABLES = new Set<RepositoryTable>(['reminder_preferences', 'user_preferences', 'community_profiles']);

/** Primary-key column used for upserts and tombstones. */
export function keyColumn(table: RepositoryTable): 'id' | 'user_id' {
  return USER_KEYED_TABLES.has(table) ? 'user_id' : 'id';
}

export function rowKey(table: RepositoryTable, row: Row): string {
  return String(row[keyColumn(table)] ?? '');
}

export interface OutboxOp {
  table: RepositoryTable;
  key: string;
  kind: 'upsert' | 'delete';
  /** Full row for upserts; null for deletes. */
  payload: Row | null;
  /**
   * updated_at of the row the edit was based on. Null = row created locally
   * (any existing server row wins). Carried across coalesced edits.
   */
  baseUpdatedAt: string | null;
  queuedAt: string;
}

export interface RemoteAdapter {
  /** One row by key, or null. Must be scoped to the signed-in user by RLS. */
  fetchRow(table: RepositoryTable, key: string): Promise<Row | null>;
  upsert(table: RepositoryTable, row: Row): Promise<void>;
  remove(table: RepositoryTable, key: string): Promise<void>;
  /** All rows for this user (own rows only for community_profiles). */
  fetchAll(table: RepositoryTable): Promise<Row[]>;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'synced';

export interface SyncConflict {
  table: RepositoryTable;
  key: string;
  at: string;
}

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Most recent server-wins resolutions (max 20). */
  conflicts: SyncConflict[];
}

export const INITIAL_STATUS: SyncStatus = {
  state: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  conflicts: [],
};

/** Window event dispatched after status/data changes so queries refresh. */
export const SYNC_EVENT = 'mkj:sync';
