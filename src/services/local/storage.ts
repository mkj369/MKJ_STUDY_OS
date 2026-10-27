export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

export function getDefaultStorage(): KeyValueStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__mkj_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // Private mode / storage disabled: fall back to memory for this session.
  }
  return new MemoryStorage();
}

export const STORAGE_PREFIX = 'mkj.studyos.v1';
