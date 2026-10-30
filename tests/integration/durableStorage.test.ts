import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createDurableStorage } from '@/services/local/durableStorage';
import { MemoryStorage, STORAGE_PREFIX } from '@/services/local/storage';

/**
 * The mirror is the safety net for a WebView store that can be evicted. These
 * tests drive the real IndexedDB API (fake-indexeddb), not a stub of it, so the
 * copy-back path is exercised end to end.
 */

const KEY = `${STORAGE_PREFIX}.db`;

describe('durable storage mirror', () => {
  beforeEach(async () => {
    // Delete the database between tests so each starts from an empty mirror.
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('mkj-studyos');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it('writes through to IndexedDB and restores a key the primary store lost', async () => {
    const primary = new MemoryStorage();
    const storage = createDurableStorage(primary);

    storage.setItem(KEY, '{"version":2,"tables":{}}');
    await storage.flush();

    // Simulate the WebView clearing its synchronous store (storage pressure).
    primary.removeItem(KEY);
    expect(primary.getItem(KEY)).toBeNull();

    const result = await storage.hydrate();
    expect(result.restored).toContain(KEY);
    expect(primary.getItem(KEY)).toBe('{"version":2,"tables":{}}');
  });

  it('never overwrites a newer primary value with the mirror', async () => {
    const primary = new MemoryStorage();
    const storage = createDurableStorage(primary);

    storage.setItem(KEY, 'newer');
    await storage.flush();

    // The mirror is now older than what the primary store holds.
    primary.setItem(KEY, 'newest');
    await storage.hydrate();

    expect(primary.getItem(KEY)).toBe('newest');
  });

  it('removes a key from both stores', async () => {
    const primary = new MemoryStorage();
    const storage = createDurableStorage(primary);

    storage.setItem(KEY, 'value');
    await storage.flush();
    storage.removeItem(KEY);
    await storage.flush();

    expect(primary.getItem(KEY)).toBeNull();
    const result = await storage.hydrate();
    expect(result.restored).not.toContain(KEY);
  });

  it('reports whether writes will survive a restart', () => {
    // The in-memory fallback (private mode) cannot survive anything.
    expect(createDurableStorage(new MemoryStorage()).durable).toBe(false);

    // A real key/value store (what localStorage looks like to this layer) can.
    const map = new Map<string, string>();
    const webStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    };
    expect(createDurableStorage(webStorage).durable).toBe(true);
  });
});
