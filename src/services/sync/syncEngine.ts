/**
 * Offline-first sync engine.
 *
 * Push: ops in queue order (upserts), then deletes children-first so server
 * FK restrictions hold. Before writing a row, the remote version is checked:
 * if it changed since the local edit's base (or the row was created locally
 * but already exists on the server), SERVER WINS — the op is dropped, the
 * remote row is applied locally and the conflict is recorded. Stale local
 * data can never overwrite a newer server row.
 *
 * Pull: full per-user tables. Rows with pending local ops are skipped (the
 * next push resolves them). Local rows absent from the server and not
 * pending were deleted on another device → remove locally. Curriculum is
 * pull-only; an empty server keeps the local seed (honest fallback).
 */
import type { KeyValueStorage } from '@/services/local/storage';
import { STORAGE_PREFIX } from '@/services/local/storage';
import type { LocalRepository } from '@/services/local/localRepository';
import type { Row } from '@/services/local/localDatabase';
import type { RepositoryTable } from '@/types/domain';
import { Outbox } from './outbox';
import {
  CURRICULUM_SYNC_TABLES,
  INITIAL_STATUS,
  SYNC_EVENT,
  SYNC_TABLES,
  rowKey,
  type OutboxOp,
  type RemoteAdapter,
  type SyncStatus,
} from './types';
import { SyncOfflineError } from './supabaseRemoteAdapter';

/** Tables whose server rows carry updated_at (conflict-comparable). */
const VERSIONED_TABLES = new Set<RepositoryTable>(
  SYNC_TABLES.filter((table) => !['focus_sessions', 'weekly_summaries', 'practice_attempts'].includes(table)),
);

function updatedAt(row: Row | null | undefined): string | null {
  const value = row?.['updated_at'] ?? row?.['created_at'];
  return typeof value === 'string' ? value : null;
}

interface Snapshot {
  tables: Map<RepositoryTable, Map<string, Row>>;
}

export class SyncEngine {
  readonly outbox: Outbox;
  private readonly local: LocalRepository;
  private readonly remote: RemoteAdapter;
  private readonly storage: KeyValueStorage;
  private readonly userId: string;
  private status: SyncStatus;
  private listeners = new Set<(status: SyncStatus) => void>();
  private running: Promise<void> | null = null;
  private debounceHandle: number | null = null;
  private intervalHandle: number | null = null;
  private onlineHandler: (() => void) | null = null;
  private disposed = false;

  constructor(local: LocalRepository, remote: RemoteAdapter, storage: KeyValueStorage, userId: string) {
    this.local = local;
    this.remote = remote;
    this.storage = storage;
    this.userId = userId;
    this.outbox = new Outbox(storage, userId);
    this.status = { ...INITIAL_STATUS, pendingCount: this.outbox.length, lastSyncedAt: this.readLastSynced() };
  }

  /* ------------------------------ status ------------------------------- */

  private readLastSynced(): string | null {
    try {
      return this.storage.getItem(`${STORAGE_PREFIX}.sync.${this.userId}`);
    } catch {
      return null;
    }
  }

  getStatus(): SyncStatus {
    return { ...this.status, pendingCount: this.outbox.length };
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.getStatus(), ...patch };
    for (const listener of this.listeners) listener(this.getStatus());
    try {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT));
    } catch {
      // non-DOM environment (tests) — listeners above still run
    }
  }

  /* -------------------------- diff capture ----------------------------- */

  private snapshot(): Snapshot {
    const raw = this.local.syncSnapshot(SYNC_TABLES);
    const tables = new Map<RepositoryTable, Map<string, Row>>();
    for (const [table, rows] of raw) {
      tables.set(table, new Map(rows.map((row) => [rowKey(table, row), row])));
    }
    return { tables };
  }

  /**
   * Wrap a local mutation: diff before/after and enqueue one op per changed
   * row. Captures cascades, demo removal and bulk deletes without trusting
   * each repository method to report its own writes.
   */
  async capture<T>(action: () => Promise<T>): Promise<T> {
    const before = this.snapshot();
    try {
      return await action();
    } finally {
      this.captureDiff(before);
      if (this.outbox.length > 0) this.schedulePush();
    }
  }

  private captureDiff(before: Snapshot): void {
    const after = this.snapshot();
    const now = new Date().toISOString();
    let changed = false;
    for (const table of SYNC_TABLES) {
      const beforeRows = before.tables.get(table) ?? new Map<string, Row>();
      const afterRows = after.tables.get(table) ?? new Map<string, Row>();
      for (const [key, row] of afterRows) {
        const previous = beforeRows.get(key);
        if (!previous) {
          this.outbox.enqueue({ table, key, kind: 'upsert', payload: row, baseUpdatedAt: null, queuedAt: now });
          changed = true;
        } else if (JSON.stringify(previous) !== JSON.stringify(row)) {
          this.outbox.enqueue({
            table,
            key,
            kind: 'upsert',
            payload: row,
            baseUpdatedAt: updatedAt(previous),
            queuedAt: now,
          });
          changed = true;
        }
      }
      for (const [key, row] of beforeRows) {
        if (!afterRows.has(key)) {
          this.outbox.enqueue({ table, key, kind: 'delete', payload: null, baseUpdatedAt: updatedAt(row), queuedAt: now });
          changed = true;
        }
      }
    }
    // Only notify when something was actually queued. Reads wrapped in
    // capture() (e.g. listAllUserData) must be silent, or the workspace
    // refetch triggered by SYNC_EVENT would loop forever.
    if (changed) this.setStatus({});
  }

  /* ------------------------------- push -------------------------------- */

  private async pushOp(op: OutboxOp): Promise<void> {
    if (op.kind === 'upsert' && op.payload) {
      const remoteRow = await this.remote.fetchRow(op.table, op.key);
      if (remoteRow) {
        if (!VERSIONED_TABLES.has(op.table)) {
          // Append-only history (focus sessions, summaries, attempts): the
          // row already exists server-side; nothing to overwrite.
          this.outbox.complete(op);
          return;
        }
        const remoteVersion = updatedAt(remoteRow);
        const base = op.baseUpdatedAt;
        const serverIsNewer = base === null || (remoteVersion !== null && remoteVersion > base);
        if (serverIsNewer) {
          // SERVER WINS: keep the newer record, drop the stale local edit.
          this.local.applyRemoteRows(op.table, [remoteRow]);
          this.outbox.complete(op);
          this.recordConflict(op);
          return;
        }
      }
      await this.remote.upsert(op.table, op.payload);
      this.outbox.complete(op);
      // Adopt the server's post-write version (touch triggers set updated_at).
      // Without this, the NEXT local edit would carry a stale base and be
      // misclassified as a conflict against this device's own write.
      // Skip if a newer local edit raced in while the push was in flight.
      const stillCurrent = this.outbox
        .list()
        .every((candidate) => !(candidate.table === op.table && candidate.key === op.key));
      if (stillCurrent && VERSIONED_TABLES.has(op.table)) {
        const saved = await this.remote.fetchRow(op.table, op.key);
        if (saved) this.local.applyRemoteRows(op.table, [saved]);
      }
      return;
    }
    if (op.kind === 'delete') {
      if (VERSIONED_TABLES.has(op.table)) {
        const remoteRow = await this.remote.fetchRow(op.table, op.key);
        const remoteVersion = updatedAt(remoteRow);
        if (remoteRow && remoteVersion && op.baseUpdatedAt && remoteVersion > op.baseUpdatedAt) {
          // Someone updated the row after the local delete was decided.
          // Keep the newer server record rather than destroying it.
          this.local.applyRemoteRows(op.table, [remoteRow]);
          this.outbox.complete(op);
          this.recordConflict(op);
          return;
        }
      }
      await this.remote.remove(op.table, op.key);
      this.outbox.complete(op);
    }
  }

  private recordConflict(op: OutboxOp): void {
    const conflicts = [
      { table: op.table, key: op.key, at: new Date().toISOString() },
      ...this.status.conflicts,
    ].slice(0, 20);
    this.setStatus({ conflicts });
  }

  private async pushAll(): Promise<void> {
    // Upserts in queue order (parents were created before children locally).
    for (const op of [...this.outbox.list()].filter((candidate) => candidate.kind === 'upsert')) {
      await this.pushOp(op);
    }
    // Deletes children-first: reverse table dependency order so FK
    // restrictions on the server never block a legitimate cascade.
    const order = new Map(SYNC_TABLES.map((table, index) => [table, index]));
    const deletes = [...this.outbox.list()]
      .filter((candidate) => candidate.kind === 'delete')
      .sort((a, b) => (order.get(b.table) ?? 0) - (order.get(a.table) ?? 0));
    for (const op of deletes) {
      await this.pushOp(op);
    }
  }

  /* ------------------------------- pull -------------------------------- */

  private async pullAll(): Promise<void> {
    for (const table of SYNC_TABLES) {
      const remoteRows = await this.remote.fetchAll(table);
      const pending = this.outbox.pendingKeys(table);
      const localRows = this.local.syncSnapshot([table]).get(table) ?? [];
      const localByKey = new Map(localRows.map((row) => [rowKey(table, row), row]));
      const remoteKeys = new Set(remoteRows.map((row) => rowKey(table, row)));

      const toApply: Row[] = [];
      for (const row of remoteRows) {
        const key = rowKey(table, row);
        if (pending.has(key)) continue; // local edit awaits push; do not clobber
        const localRow = localByKey.get(key);
        if (!localRow) {
          toApply.push(row);
        } else if (VERSIONED_TABLES.has(table)) {
          const remoteVersion = updatedAt(row);
          const localVersion = updatedAt(localRow);
          if (remoteVersion && (!localVersion || remoteVersion > localVersion)) toApply.push(row);
        }
        // Append-only tables: same id = same record; keep the local copy.
      }
      if (toApply.length > 0) this.local.applyRemoteRows(table, toApply);

      // Rows deleted on another device: present locally, absent remotely,
      // and not awaiting a local push.
      const toRemove = localRows
        .filter((row) => {
          const key = rowKey(table, row);
          return !remoteKeys.has(key) && !pending.has(key);
        })
        .map((row) => rowKey(table, row));
      if (toRemove.length > 0) this.local.removeLocalRows(table, toRemove);
    }

    // Curriculum: pull-only reference data. Empty server → keep local seed.
    for (const table of CURRICULUM_SYNC_TABLES) {
      const remoteRows = await this.remote.fetchAll(table);
      if (remoteRows.length > 0) this.local.applyRemoteRows(table, remoteRows);
    }
  }

  /* ------------------------------ orchestration ------------------------ */

  async syncNow(): Promise<void> {
    if (this.disposed) return;
    if (this.running) return this.running;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus({ state: 'offline' });
      return;
    }
    this.setStatus({ state: 'syncing', lastError: null });
    this.running = (async () => {
      try {
        await this.pushAll();
        await this.pullAll();
        const lastSyncedAt = new Date().toISOString();
        try {
          this.storage.setItem(`${STORAGE_PREFIX}.sync.${this.userId}`, lastSyncedAt);
        } catch {
          // non-fatal
        }
        this.setStatus({ state: 'synced', lastSyncedAt, lastError: null });
      } catch (error) {
        if (error instanceof SyncOfflineError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          this.setStatus({ state: 'offline' });
        } else {
          this.setStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private schedulePush(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (this.debounceHandle !== null) window.clearTimeout(this.debounceHandle);
    this.debounceHandle = window.setTimeout(() => {
      this.debounceHandle = null;
      void this.syncNow();
    }, 1500);
  }

  /** Begin background sync: after mutations, on reconnect, every minute. */
  start(): void {
    if (typeof window === 'undefined') return;
    this.onlineHandler = () => void this.syncNow();
    window.addEventListener('online', this.onlineHandler);
    this.intervalHandle = window.setInterval(() => {
      if (this.outbox.length > 0 || this.status.state === 'offline' || this.status.state === 'error') {
        void this.syncNow();
      }
    }, 60_000);
    void this.syncNow();
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceHandle !== null) window.clearTimeout(this.debounceHandle);
    if (this.intervalHandle !== null) window.clearInterval(this.intervalHandle);
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
    this.listeners.clear();
  }
}
