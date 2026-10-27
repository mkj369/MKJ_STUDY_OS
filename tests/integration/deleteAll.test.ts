import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage } from '@/services/local/storage';
import { USER_OWNED_TABLES } from '@/types/domain';

/**
 * "Delete all my records" used to walk the tables in declaration order, so it hit
 * `user_subjects` before the records that reference it and failed with
 * `subject_has_records` — leaving a half-deleted workspace. The repository now owns
 * the dependency order.
 */

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let storage: MemoryStorage;
let repoA: LocalRepository;
let repoB: LocalRepository;

beforeEach(() => {
  storage = new MemoryStorage();
  repoA = new LocalRepository(USER_A, storage);
  repoB = new LocalRepository(USER_B, storage);
});

describe('deleteAllUserData', () => {
  it('empties a seeded workspace without foreign-key errors', async () => {
    await repoA.seedDemoWorkspace();
    expect((await repoA.list('study_sessions')).length).toBeGreaterThan(0);

    const result = await repoA.deleteAllUserData();
    expect(result.deleted).toBeGreaterThan(0);

    for (const table of USER_OWNED_TABLES) {
      if (table === 'profiles' || table === 'audit_events') continue;
      expect(await repoA.list(table), table).toHaveLength(0);
    }
    // The profile is the account, not academic data.
    const profile = await repoA.getProfile();
    expect(profile).not.toBeNull();
  });

  it('keeps the curriculum reference data', async () => {
    await repoA.seedDemoWorkspace();
    await repoA.deleteAllUserData();
    const curriculum = await repoA.listCurriculum();
    expect(curriculum.versions.length).toBeGreaterThan(0);
    expect(curriculum.subjects.length).toBeGreaterThan(0);
    expect(curriculum.chapters.length).toBeGreaterThan(0);
  });

  it('never touches another student’s workspace', async () => {
    await repoA.seedDemoWorkspace();
    await repoB.seedDemoWorkspace();
    await repoA.deleteAllUserData();

    expect(await repoA.list('study_sessions')).toHaveLength(0);
    expect((await repoB.list('study_sessions')).length).toBeGreaterThan(0);
    expect((await repoB.list('user_subjects')).length).toBeGreaterThan(0);
  });
});
