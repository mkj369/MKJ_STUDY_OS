/**
 * Persisted mutation queue. One op per (table, key): repeated edits coalesce
 * into the latest payload while keeping the ORIGINAL baseUpdatedAt, so the
 * conflict check still compares against the version the student started from.
 *
 * A delete after a local-only create (base null, never pushed) collapses to
 * nothing — the server never knew the row.
 */
import type { KeyValueStorage } from '@/services/local/storage';
import { STORAGE_PREFIX } from '@/services/local/storage';
import type { RepositoryTable } from '@/types/domain';
import type { OutboxOp } from './types';

export function outboxKey(userId: string): string {
  return `${STORAGE_PREFIX}.outbox.${userId}`;
}

export class Outbox {
  private readonly storage: KeyValueStorage;
  private readonly storageKey: string;
  private ops: OutboxOp[];

  constructor(storage: KeyValueStorage, userId: string) {
    this.storage = storage;
    this.storageKey = outboxKey(userId);
    this.ops = this.load();
  }

  private load(): OutboxOp[] {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (op): op is OutboxOp =>
          Boolean(op) &&
          typeof op === 'object' &&
          typeof (op as OutboxOp).table === 'string' &&
          typeof (op as OutboxOp).key === 'string' &&
          ((op as OutboxOp).kind === 'upsert' || (op as OutboxOp).kind === 'delete'),
      );
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.ops));
    } catch {
      // storage unavailable — ops stay in memory for this session
    }
  }

  get length(): number {
    return this.ops.length;
  }

  list(): readonly OutboxOp[] {
    return this.ops;
  }

  pendingKeys(table: RepositoryTable): Set<string> {
    return new Set(this.ops.filter((op) => op.table === table).map((op) => op.key));
  }

  enqueue(op: OutboxOp): void {
    const index = this.ops.findIndex((candidate) => candidate.table === op.table && candidate.key === op.key);
    if (index === -1) {
      this.ops.push(op);
    } else {
      const previous = this.ops[index] as OutboxOp;
      if (op.kind === 'delete' && previous.baseUpdatedAt === null) {
        // Created and deleted locally before any push: nothing to tell the server.
        this.ops.splice(index, 1);
      } else {
        this.ops[index] = { ...op, baseUpdatedAt: previous.baseUpdatedAt };
      }
    }
    this.save();
  }

  /** Remove the op at the head only if it is still the same object (no new edit raced in). */
  complete(op: OutboxOp): void {
    const index = this.ops.findIndex(
      (candidate) => candidate.table === op.table && candidate.key === op.key && candidate.queuedAt === op.queuedAt,
    );
    if (index >= 0) {
      this.ops.splice(index, 1);
      this.save();
    }
  }

  clear(): void {
    this.ops = [];
    this.save();
  }
}
