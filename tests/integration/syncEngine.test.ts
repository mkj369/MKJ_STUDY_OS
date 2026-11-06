/**
 * Offline-first sync behaviour against a fake remote adapter.
 *
 * Covers: push of creates/updates/deletes, offline queueing + retry,
 * server-wins conflicts (stale local never overwrites newer server),
 * pull of other devices' rows, tombstone propagation (no resurrection),
 * coalescing, and curriculum pull-only semantics.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage } from '@/services/local/storage';
import { SyncEngine } from '@/services/sync/syncEngine';
import { Outbox, outboxKey } from '@/services/sync/outbox';
import { SYNC_TABLES, keyColumn, type RemoteAdapter } from '@/services/sync/types';
import { SyncOfflineError } from '@/services/sync/supabaseRemoteAdapter';
import type { Row } from '@/services/local/localDatabase';
import type { RepositoryTable } from '@/types/domain';

const USER = 'user-sync-1';

class FakeRemote implements RemoteAdapter {
  tables = new Map<string, Map<string, Row>>();
  offline = false;
  failTable: string | null = null;
  upserts: { table: string; key: string }[] = [];
  removes: { table: string; key: string }[] = [];

  private table(name: string): Map<string, Row> {
    let map = this.tables.get(name);
    if (!map) {
      map = new Map();
      this.tables.set(name, map);
    }
    return map;
  }

  private guard(table: string): void {
    if (this.offline) throw new SyncOfflineError();
    if (this.failTable === table) throw new Error(`boom on ${table}`);
  }

  seed(table: RepositoryTable, row: Row): void {
    this.table(table).set(String(row[keyColumn(table)]), { ...row });
  }

  async fetchRow(table: RepositoryTable, key: string): Promise<Row | null> {
    this.guard(table);
    return this.table(table).get(key) ?? null;
  }

  async upsert(table: RepositoryTable, row: Row): Promise<void> {
    this.guard(table);
    const key = String(row[keyColumn(table)]);
    this.upserts.push({ table, key });
    // Emulate the server touch trigger: writes get a fresh server timestamp.
    this.table(table).set(key, { ...row, updated_at: row['updated_at'] ?? new Date().toISOString() });
  }

  async remove(table: RepositoryTable, key: string): Promise<void> {
    this.guard(table);
    this.removes.push({ table, key });
    this.table(table).delete(key);
  }

  async fetchAll(table: RepositoryTable): Promise<Row[]> {
    this.guard(table);
    return [...this.table(table).values()];
  }
}

describe('SyncEngine', () => {
  let storage: MemoryStorage;
  let local: LocalRepository;
  let remote: FakeRemote;
  let engine: SyncEngine;

  beforeEach(() => {
    storage = new MemoryStorage();
    local = new LocalRepository(USER, storage);
    remote = new FakeRemote();
    engine = new SyncEngine(local, remote, storage, USER);
  });

  it('pushes local creates and updates, then clears the outbox', async () => {
    const subject = await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'Physics',
        custom_paper_label: null,
        status: 'active',
        color: '#111111',
        sort_order: 1,
        is_demo: false,
      }),
    );
    expect(engine.outbox.length).toBeGreaterThan(0);
    await engine.syncNow();
    expect(engine.getStatus().state).toBe('synced');
    expect(engine.outbox.length).toBe(0);
    expect(remote.tables.get('user_subjects')?.get(subject.id)?.['custom_name']).toBe('Physics');

    await engine.capture(() => local.update('user_subjects', subject.id, { custom_name: 'Physics 1st' }));
    await engine.syncNow();
    expect(remote.tables.get('user_subjects')?.get(subject.id)?.['custom_name']).toBe('Physics 1st');
    expect(engine.outbox.length).toBe(0);
  });

  it('queues while offline, persists the outbox, and retries successfully', async () => {
    remote.offline = true;
    const subject = await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'Offline subject',
        custom_paper_label: null,
        status: 'active',
        color: '#222222',
        sort_order: 1,
        is_demo: false,
      }),
    );
    await engine.syncNow();
    expect(engine.getStatus().state).toBe('offline');
    expect(engine.outbox.length).toBeGreaterThan(0);

    // Outbox survives an app restart (new engine over the same storage).
    const raw = storage.getItem(outboxKey(USER));
    expect(raw).toBeTruthy();
    const restarted = new SyncEngine(new LocalRepository(USER, storage), remote, storage, USER);
    expect(restarted.outbox.length).toBe(engine.outbox.length);

    remote.offline = false;
    await restarted.syncNow();
    expect(restarted.getStatus().state).toBe('synced');
    expect(remote.tables.get('user_subjects')?.get(subject.id)?.['custom_name']).toBe('Offline subject');
  });

  it('SERVER WINS: a stale local edit never overwrites a newer server row', async () => {
    // Local row synced at v1.
    const subject = await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'Version 1',
        custom_paper_label: null,
        status: 'active',
        color: '#333333',
        sort_order: 1,
        is_demo: false,
      }),
    );
    await engine.syncNow();

    // Another device saves a newer version.
    const serverRow = remote.tables.get('user_subjects')?.get(subject.id) as Row;
    remote.seed('user_subjects', { ...serverRow, custom_name: 'Version 2 (other device)', updated_at: '2099-01-01T00:00:00.000Z' });

    // This device edits its stale copy.
    await engine.capture(() => local.update('user_subjects', subject.id, { custom_name: 'Stale local edit' }));
    const upsertsBefore = remote.upserts.length;
    await engine.syncNow();

    // The stale write was never sent; local now holds the server version.
    expect(remote.upserts.length).toBe(upsertsBefore);
    const localRow = (await local.list('user_subjects')).find((row) => row.id === subject.id);
    expect(localRow?.custom_name).toBe('Version 2 (other device)');
    expect(remote.tables.get('user_subjects')?.get(subject.id)?.['custom_name']).toBe('Version 2 (other device)');
    expect(engine.getStatus().conflicts.length).toBe(1);
    expect(engine.getStatus().state).toBe('synced');
  });

  it('SERVER WINS on delete: newer server update survives a stale local delete', async () => {
    const subject = await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'Keep me',
        custom_paper_label: null,
        status: 'active',
        color: '#444444',
        sort_order: 1,
        is_demo: false,
      }),
    );
    await engine.syncNow();
    const serverRow = remote.tables.get('user_subjects')?.get(subject.id) as Row;
    remote.seed('user_subjects', { ...serverRow, custom_name: 'Newer on server', updated_at: '2099-01-01T00:00:00.000Z' });

    await engine.capture(() => local.remove('user_subjects', subject.id));
    await engine.syncNow();

    expect(remote.tables.get('user_subjects')?.get(subject.id)?.['custom_name']).toBe('Newer on server');
    const localRow = (await local.list('user_subjects')).find((row) => row.id === subject.id);
    expect(localRow?.custom_name).toBe('Newer on server');
  });

  it('pulls rows created on another device and removes rows deleted there', async () => {
    // Device B created a subject on the server.
    remote.seed('user_subjects', {
      id: 'remote-subject',
      user_id: USER,
      curriculum_subject_id: null,
      curriculum_version_id: null,
      custom_name: 'From device B',
      custom_paper_label: null,
      status: 'active',
      color: '#555555',
      sort_order: 1,
      is_demo: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    await engine.syncNow();
    expect((await local.list('user_subjects')).map((row) => row.custom_name)).toContain('From device B');

    // Device B deletes it; next pull removes it locally (no resurrection).
    await remote.remove('user_subjects', 'remote-subject');
    await engine.syncNow();
    expect((await local.list('user_subjects')).find((row) => row.id === 'remote-subject')).toBeUndefined();
  });

  it('does not clobber a pending local edit during pull', async () => {
    const subject = await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'Base',
        custom_paper_label: null,
        status: 'active',
        color: '#666666',
        sort_order: 1,
        is_demo: false,
      }),
    );
    await engine.syncNow();

    // Local edit pending while the remote fetch fails for pushes but pull works?
    // Simulate directly: enqueue edit, then pull with the server still on old version.
    await engine.capture(() => local.update('user_subjects', subject.id, { custom_name: 'Local pending' }));
    // Pull must skip the pending key even though the server version is older.
    await (engine as unknown as { pullAll(): Promise<void> }).pullAll();
    const localRow = (await local.list('user_subjects')).find((row) => row.id === subject.id);
    expect(localRow?.custom_name).toBe('Local pending');
  });

  it('coalesces repeated edits and collapses local-only create+delete', async () => {
    const outbox = new Outbox(storage, USER);
    outbox.enqueue({ table: 'notes', key: 'n1', kind: 'upsert', payload: { id: 'n1', title: 'v1' }, baseUpdatedAt: null, queuedAt: 't1' });
    outbox.enqueue({ table: 'notes', key: 'n1', kind: 'upsert', payload: { id: 'n1', title: 'v2' }, baseUpdatedAt: 'ignored', queuedAt: 't2' });
    expect(outbox.length).toBe(1);
    expect(outbox.list()[0]?.payload?.['title']).toBe('v2');
    expect(outbox.list()[0]?.baseUpdatedAt).toBeNull();

    outbox.enqueue({ table: 'notes', key: 'n1', kind: 'delete', payload: null, baseUpdatedAt: null, queuedAt: 't3' });
    expect(outbox.length).toBe(0); // never pushed → nothing to tell the server
  });

  it('captures demo removal as per-row deletes and pushes them', async () => {
    await engine.capture(() => local.seedDemoWorkspace());
    await engine.syncNow();
    const seededSubjects = remote.tables.get('user_subjects')?.size ?? 0;
    expect(seededSubjects).toBeGreaterThan(0);

    await engine.capture(() => local.removeDemoData());
    await engine.syncNow();
    expect(engine.outbox.length).toBe(0);
    expect(remote.tables.get('user_subjects')?.size ?? 0).toBe(0);
    expect(remote.tables.get('user_chapters')?.size ?? 0).toBe(0);
  });

  it('keeps the local curriculum seed when the server has none, and merges when it has rows', async () => {
    const before = await local.listCurriculum();
    expect(before.versions.length).toBeGreaterThan(0);
    await engine.syncNow();
    const afterEmpty = await local.listCurriculum();
    expect(afterEmpty.versions.length).toBe(before.versions.length);

    remote.seed('curriculum_versions', {
      id: 'remote-version',
      authority: 'NCTB',
      country: 'BD',
      education_level: 'HSC',
      class_grade: '11-12',
      stream: 'Science',
      academic_year: '2026',
      version_label: 'remote',
      title: 'Remote verified structure',
      source_url: null,
      scope: 'structure_only',
      source_checked_at: null,
      source_note: null,
      verification_status: 'needs_verification',
      is_demo: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    await engine.syncNow();
    const afterRemote = await local.listCurriculum();
    expect(afterRemote.versions.some((version) => version.id === 'remote-version')).toBe(true);
    // Curriculum is never pushed.
    expect(remote.upserts.some((entry) => entry.table.startsWith('curriculum_'))).toBe(false);
  });

  it('reports errors without losing queued ops, and recovers on retry', async () => {
    await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'Retry me',
        custom_paper_label: null,
        status: 'active',
        color: '#777777',
        sort_order: 1,
        is_demo: false,
      }),
    );
    remote.failTable = 'user_subjects';
    await engine.syncNow();
    expect(engine.getStatus().state).toBe('error');
    expect(engine.outbox.length).toBeGreaterThan(0);

    remote.failTable = null;
    await engine.syncNow();
    expect(engine.getStatus().state).toBe('synced');
    expect(engine.outbox.length).toBe(0);
  });

  it('read-only captures are silent: no status events, no queued ops (no refetch loop)', async () => {
    await engine.capture(() => local.getProfile()); // auto-creates profile → 1 op
    await engine.capture(() => local.listAllUserData()); // first read auto-creates preferences
    await engine.syncNow();
    const events: unknown[] = [];
    const unsubscribe = engine.subscribe((status) => events.push(status));
    const before = events.length;
    await engine.capture(() => local.listAllUserData()); // pure read now
    await engine.capture(() => local.list('user_subjects'));
    expect(events.length).toBe(before); // subscribe fires once, capture stays silent
    expect(engine.outbox.length).toBe(0);
    unsubscribe();
  });

  it('after a push the local row adopts the server version for the next edit base', async () => {
    const subject = await engine.capture(() =>
      local.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: 'First edit',
        custom_paper_label: null,
        status: 'active',
        color: '#888888',
        sort_order: 1,
        is_demo: false,
      }),
    );
    // Server touch trigger will stamp a much newer updated_at on write.
    const originalUpsert = remote.upsert.bind(remote);
    remote.upsert = async (table, row) => {
      await originalUpsert(table, { ...row, updated_at: '2099-06-01T00:00:00.000Z' });
    };
    await engine.syncNow();
    const localRow = (await local.list('user_subjects')).find((row) => row.id === subject.id);
    expect(localRow?.updated_at).toBe('2099-06-01T00:00:00.000Z');

    // A second edit from this device must NOT be treated as a conflict.
    await engine.capture(() => local.update('user_subjects', subject.id, { custom_name: 'Second edit' }));
    await engine.syncNow();
    expect(engine.getStatus().conflicts.length).toBe(0);
    expect(remote.tables.get('user_subjects')?.get(subject.id)?.['custom_name']).toBe('Second edit');
  });

  it('sync table list stays within repository tables and uses correct key columns', () => {
    expect(keyColumn('user_preferences')).toBe('user_id');
    expect(keyColumn('community_profiles')).toBe('user_id');
    expect(keyColumn('reminder_preferences')).toBe('user_id');
    expect(keyColumn('profiles')).toBe('id');
    expect(keyColumn('user_chapters')).toBe('id');
    expect(SYNC_TABLES).toContain('study_targets');
    expect(SYNC_TABLES).not.toContain('audit_events');
    expect(SYNC_TABLES).not.toContain('reminder_events');
  });
});
