import { getDefaultStorage, MemoryStorage, type KeyValueStorage, STORAGE_PREFIX } from './storage';

/**
 * Durable wrapper around the synchronous key/value store.
 *
 * Why this exists: everything in the repository layer is synchronous, and the
 * only synchronous store available in a WebView is localStorage. That store is
 * capped (a few megabytes) and can be evicted under storage pressure, which for
 * a study app means losing a term's records. So every write is also mirrored,
 * asynchronously, into IndexedDB — a much larger, transactional store in the same
 * private app sandbox.
 *
 * The contract stays simple:
 *   * reads always come from the synchronous store (fast, no await);
 *   * writes go to both;
 *   * at boot, if the synchronous store lost a key but the mirror still has it,
 *     the mirror is copied back before React renders (`hydrateDurableStorage`).
 *
 * Nothing leaves the device. The mirror is not a backup in the cloud sense.
 */

const DB_NAME = 'mkj-studyos';
const DB_VERSION = 1;
const OBJECT_STORE = 'kv';
const MIRRORED_PREFIX = STORAGE_PREFIX;

interface MirrorRecord {
  value: string;
  savedAt: string;
}

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(OBJECT_STORE, mode);
      const request = action(transaction.objectStore(OBJECT_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

async function mirrorWrite(key: string, value: string | null): Promise<void> {
  if (!indexedDbAvailable() || !key.startsWith(MIRRORED_PREFIX)) return;
  try {
    if (value === null) {
      await withStore('readwrite', (store) => store.delete(key));
    } else {
      const record: MirrorRecord = { value, savedAt: new Date().toISOString() };
      await withStore('readwrite', (store) => store.put(record, key));
    }
  } catch {
    // IndexedDB can be unavailable (private mode, quota). The synchronous store
    // still holds the data for this session; nothing is reported as synced.
  }
}

export interface DurableStorage extends KeyValueStorage {
  /** True when writes survive a restart. False for the in-memory fallback. */
  readonly durable: boolean;
  /** Copy any mirrored key the synchronous store has lost back into it. */
  hydrate(): Promise<{ restored: string[] }>;
  /** Flush pending mirror writes (used by tests and by page-hide handlers). */
  flush(): Promise<void>;
}

export function createDurableStorage(base: KeyValueStorage = getDefaultStorage()): DurableStorage {
  const pending = new Set<Promise<void>>();

  const track = (work: Promise<void>) => {
    pending.add(work);
    void work.finally(() => pending.delete(work));
  };

  return {
    durable: !(base instanceof MemoryStorage),
    getItem: (key) => base.getItem(key),
    setItem: (key, value) => {
      base.setItem(key, value);
      track(mirrorWrite(key, value));
    },
    removeItem: (key) => {
      base.removeItem(key);
      track(mirrorWrite(key, null));
    },
    async hydrate() {
      const restored: string[] = [];
      if (!indexedDbAvailable()) return { restored };
      let keys: IDBValidKey[] = [];
      try {
        keys = await withStore('readonly', (store) => store.getAllKeys());
      } catch {
        return { restored };
      }
      for (const key of keys) {
        if (typeof key !== 'string' || !key.startsWith(MIRRORED_PREFIX)) continue;
        if (base.getItem(key) !== null) continue;
        try {
          const record = await withStore<MirrorRecord | undefined>('readonly', (store) => store.get(key));
          if (record && typeof record.value === 'string') {
            base.setItem(key, record.value);
            restored.push(key);
          }
        } catch {
          // Leave the key missing rather than restoring a partial record.
        }
      }
      return { restored };
    },
    async flush() {
      await Promise.allSettled([...pending]);
    },
  };
}

let singleton: DurableStorage | null = null;

/** The store the app uses. One instance, so hydration and writes agree. */
export function getDurableStorage(): DurableStorage {
  if (!singleton) singleton = createDurableStorage();
  return singleton;
}

/**
 * Restore the synchronous store from the IndexedDB mirror. Called once in
 * `main.tsx`, before React renders, so the first read already sees the data.
 */
export async function hydrateDurableStorage(): Promise<{ restored: string[]; durable: boolean }> {
  const storage = getDurableStorage();
  const result = await storage.hydrate();
  return { ...result, durable: storage.durable };
}
