import { beforeEach, describe, expect, it } from 'vitest';
import { LocalAuthClient } from '@/services/auth/localAuth';
import { MemoryStorage, STORAGE_PREFIX } from '@/services/local/storage';

const SESSION_KEY = `${STORAGE_PREFIX}.session`;

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('local session persistence', () => {
  it('starts a workspace and restores it on a fresh client (reload)', async () => {
    const first = new LocalAuthClient(storage);
    const user = await first.startLocalWorkspace('Mahin');

    // A new client instance is what the app builds after a page reload.
    const afterReload = new LocalAuthClient(storage);
    await expect(afterReload.getSession()).resolves.toEqual(user);
    expect(user.displayName).toBe('Mahin');
  });

  it('does not create a second identity when a workspace already exists', async () => {
    const client = new LocalAuthClient(storage);
    const first = await client.startLocalWorkspace('Mahin');
    const second = new LocalAuthClient(storage).startLocalWorkspace('Someone else');
    await expect(second).resolves.toEqual(first);
  });

  it('reads the legacy bare-user shape written by older builds', async () => {
    const legacy = { id: 'user-1', email: 'local@this-device', displayName: 'Student' };
    storage.setItem(SESSION_KEY, JSON.stringify(legacy));
    await expect(new LocalAuthClient(storage).getSession()).resolves.toEqual(legacy);
  });

  it('ignores a corrupt stored session instead of crashing', async () => {
    storage.setItem(SESSION_KEY, '{not json');
    await expect(new LocalAuthClient(storage).getSession()).resolves.toBeNull();
    storage.setItem(SESSION_KEY, JSON.stringify({ user: { id: 42 } }));
    await expect(new LocalAuthClient(storage).getSession()).resolves.toBeNull();
  });

  it('signs out by removing the stored session', async () => {
    const client = new LocalAuthClient(storage);
    await client.startLocalWorkspace('Mahin');
    await client.signOut();
    await expect(new LocalAuthClient(storage).getSession()).resolves.toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });
});
