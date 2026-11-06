/**
 * RemoteAdapter backed by Supabase (RLS-scoped, anon key only).
 *
 * Local stamping adds created_at/updated_at to every row, and legacy local
 * reminder_preferences carry a synthetic id. Those columns do not exist on
 * every server table, so they are stripped per table before upsert.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RepositoryTable } from '@/types/domain';
import type { Row } from '@/services/local/localDatabase';
import { keyColumn, type RemoteAdapter } from './types';

const STRIP_COLUMNS: Partial<Record<RepositoryTable, string[]>> = {
  reminder_preferences: ['id', 'created_at'],
  user_preferences: ['created_at'],
  focus_sessions: ['updated_at'],
  weekly_summaries: ['updated_at'],
  practice_attempts: ['updated_at'],
};

function serverPayload(table: RepositoryTable, row: Row): Row {
  const strip = STRIP_COLUMNS[table];
  if (!strip) return { ...row };
  const next = { ...row };
  for (const column of strip) delete next[column];
  return next;
}

export class SyncOfflineError extends Error {
  constructor(message = 'You appear to be offline.') {
    super(message);
    this.name = 'SyncOfflineError';
  }
}

function isNetworkError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return /fetch|network|timeout|abort|Failed to fetch|Load failed/i.test(message) || error.code === 'ECONNABORTED';
}

export class SupabaseRemoteAdapter implements RemoteAdapter {
  private readonly client: SupabaseClient;
  private readonly userId: string;

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async fetchRow(table: RepositoryTable, key: string): Promise<Row | null> {
    const result = await this.client.from(table).select('*').eq(keyColumn(table), key).limit(1);
    if (result.error) {
      if (isNetworkError(result.error)) throw new SyncOfflineError();
      throw new Error(`Sync read failed (${table}): ${result.error.message}`);
    }
    return (result.data?.[0] as Row | undefined) ?? null;
  }

  async upsert(table: RepositoryTable, row: Row): Promise<void> {
    const result = await this.client.from(table).upsert(serverPayload(table, row), { onConflict: keyColumn(table) });
    if (result.error) {
      if (isNetworkError(result.error)) throw new SyncOfflineError();
      throw new Error(`Sync write failed (${table}): ${result.error.message}`);
    }
  }

  async remove(table: RepositoryTable, key: string): Promise<void> {
    const result = await this.client.from(table).delete().eq(keyColumn(table), key);
    if (result.error) {
      if (isNetworkError(result.error)) throw new SyncOfflineError();
      throw new Error(`Sync delete failed (${table}): ${result.error.message}`);
    }
  }

  async fetchAll(table: RepositoryTable): Promise<Row[]> {
    let query = this.client.from(table).select('*');
    // RLS lets users read OTHER users' shared community rows; the cache must
    // only ever contain the signed-in user's own row.
    if (table === 'community_profiles') query = query.eq('user_id', this.userId);
    if (table === 'profiles') query = query.eq('id', this.userId);
    const result = await query;
    if (result.error) {
      if (isNetworkError(result.error)) throw new SyncOfflineError();
      throw new Error(`Sync pull failed (${table}): ${result.error.message}`);
    }
    return (result.data ?? []) as Row[];
  }
}
