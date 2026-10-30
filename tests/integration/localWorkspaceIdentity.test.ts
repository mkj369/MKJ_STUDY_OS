import { describe, expect, it } from 'vitest';
import { LocalAuthClient } from '@/services/auth/localAuth';
import { MemoryStorage, STORAGE_PREFIX } from '@/services/local/storage';

/**
 * Regression tests for the v1.0 release blocker found in the audit.
 *
 * The bug: `startLocalWorkspace()` minted a brand-new UUID whenever no session
 * was present. Signing out removes the session but deliberately keeps the study
 * records (they are the student's work). The next "Start on this device" then
 * created a *different* identity, so every row on disk still belonged to the old
 * id and the app rendered an empty workspace. Nothing was deleted — the data was
 * simply unreachable, and the student had no way to tell the difference between
 * "my work vanished" and "I never entered anything".
 *
 * The fix: the device workspace has one stable, persisted identity. Starting
 * again adopts the existing record instead of inventing a new one.
 */

const ACCOUNT_KEY = `${STORAGE_PREFIX}.localAccount`;

function client(storage = new MemoryStorage()) {
  return { auth: new LocalAuthClient(storage), storage };
}

describe('device workspace identity', () => {
  it('keeps the same id after sign-out and starting the workspace again', async () => {
    const { auth, storage } = client();

    const first = await auth.startLocalWorkspace('Mahin');
    await auth.signOut();
    expect(await auth.getSession()).toBeNull();

    const second = await auth.startLocalWorkspace('Mahin');
    expect(second.id).toBe(first.id);
    expect(storage.getItem(ACCOUNT_KEY)).toBeTruthy();
  });

  it('does not mint a new id even when the name changes on the second start', async () => {
    const { auth } = client();
    const first = await auth.startLocalWorkspace('Mahin');
    await auth.signOut();
    const second = await auth.startLocalWorkspace('Rafi');
    // Same workspace, updated greeting. Two ids here would orphan every record.
    expect(second.id).toBe(first.id);
  });

  it('recovers the identity from the account record even if the session key was lost', async () => {
    const { auth, storage } = client();
    const first = await auth.startLocalWorkspace('Mahin');

    // Simulate a WebView that dropped only the session key (or a crash between
    // the two writes): the durable account record must still identify the owner.
    storage.removeItem(`${STORAGE_PREFIX}.session`);
    expect(await auth.getSession()).toBeNull();

    const second = await auth.startLocalWorkspace('Mahin');
    expect(second.id).toBe(first.id);
  });

  it('reports whether an existing workspace would be resumed, so the UI can warn', async () => {
    const { auth, storage } = client();

    expect(await auth.hasLocalAccount()).toBe(false);

    const first = await auth.startLocalWorkspace('Mahin');
    expect(await auth.hasLocalAccount()).toBe(true);

    await auth.signOut();
    // The session is gone but the workspace still exists on this device.
    expect(await auth.hasLocalAccount()).toBe(true);

    const resumed = await auth.startLocalWorkspace('Mahin');
    expect(resumed.id).toBe(first.id);
    expect(storage.getItem(`${STORAGE_PREFIX}.session`)).toBeTruthy();
  });

  it('never merges two different device workspaces into one identity', async () => {
    /*
     * Two independent stores represent two different devices/installations.
     * Each must keep its own id: there is no path by which one workspace adopts
     * another's records.
     */
    const deviceA = client();
    const deviceB = client();

    const a = await deviceA.auth.startLocalWorkspace('A');
    const b = await deviceB.auth.startLocalWorkspace('B');

    expect(a.id).not.toBe(b.id);
    expect(await deviceA.auth.hasLocalAccount()).toBe(true);
    expect(await deviceB.auth.hasLocalAccount()).toBe(true);
  });
});

describe('recovering a workspace created before the fix', () => {
  /*
   * A device that already ran the buggy build has study rows but no account
   * record. The rows name their owner, so the workspace can be reopened instead
   * of abandoned. These tests build that exact on-disk state by hand.
   */
  function seedDatabase(storage: MemoryStorage, owners: string[]) {
    const tables: Record<string, unknown[]> = { profiles: [] };
    owners.forEach((owner, index) => {
      tables.profiles!.push({ id: owner, active_class: 11 });
      tables.user_subjects = [
        ...((tables.user_subjects as unknown[]) ?? []),
        { id: `s-${index}`, user_id: owner, name: 'Physics' },
      ];
    });
    // Give the second owner more work, to prove the choice is not arbitrary order.
    if (owners.length > 1) {
      tables.user_chapters = [
        { id: 'c-1', user_id: owners[1], title: 'One' },
        { id: 'c-2', user_id: owners[1], title: 'Two' },
      ];
    }
    storage.setItem(`${STORAGE_PREFIX}.db`, JSON.stringify({ version: 2, tables }));
  }

  it('adopts the existing owner instead of inventing an empty workspace', async () => {
    const storage = new MemoryStorage();
    seedDatabase(storage, ['legacy-owner']);

    const user = await new LocalAuthClient(storage).startLocalWorkspace('Mahin');
    expect(user.id).toBe('legacy-owner');
  });

  it('picks the workspace holding the most work when a buggy build left several', async () => {
    const storage = new MemoryStorage();
    seedDatabase(storage, ['quiet-owner', 'busy-owner']);

    const user = await new LocalAuthClient(storage).startLocalWorkspace('Mahin');
    expect(user.id).toBe('busy-owner');
  });

  it('never deletes or merges the rows belonging to another owner', async () => {
    const storage = new MemoryStorage();
    seedDatabase(storage, ['quiet-owner', 'busy-owner']);

    await new LocalAuthClient(storage).startLocalWorkspace('Mahin');
    const tables = JSON.parse(storage.getItem(`${STORAGE_PREFIX}.db`) as string).tables;
    const owners = new Set(tables.user_subjects.map((row: { user_id: string }) => row.user_id));
    expect(owners).toEqual(new Set(['quiet-owner', 'busy-owner']));
  });

  it('still starts a brand-new workspace when the device holds no records at all', async () => {
    const storage = new MemoryStorage();
    const client = new LocalAuthClient(storage);
    expect(await client.hasLocalAccount()).toBe(false);
    const user = await client.startLocalWorkspace('Mahin');
    expect(user.id).toMatch(/^[0-9a-f-]{36}$|^local-/);
  });
});
