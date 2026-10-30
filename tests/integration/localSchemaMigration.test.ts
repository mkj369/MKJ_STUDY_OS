import { describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage, STORAGE_PREFIX } from '@/services/local/storage';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DB_KEY = `${STORAGE_PREFIX}.db`;

/**
 * A phone that has been through an app update keeps its storage. The local
 * document store therefore has to upgrade an older blob in place: add the
 * columns later releases read, bump the version, and never drop a row.
 */
describe('local schema migration', () => {
  it('upgrades a version 1 store without losing rows', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      DB_KEY,
      JSON.stringify({
        version: 1,
        tables: {
          profiles: [
            {
              id: USER,
              display_name: 'Mahin',
              locale: 'en',
              timezone: 'Asia/Dhaka',
              academic_level: 'HSC',
              study_windows: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          user_subjects: [
            {
              id: 'subject-1',
              user_id: USER,
              custom_name: 'Physics',
              status: 'active',
              color: '#38BDF8',
              sort_order: 1,
              is_demo: false,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      }),
    );

    const repo = new LocalRepository(USER, storage);
    const profile = await repo.getProfile();
    const subjects = await repo.list('user_subjects');

    // The student's own data is untouched…
    expect(profile.display_name).toBe('Mahin');
    expect(subjects.map((subject) => subject.custom_name)).toEqual(['Physics']);
    // …and the columns later releases rely on now exist.
    expect(profile.active_class).toBeNull();
    expect(profile.active_group).toBeNull();
    expect(profile.theme_mode).toBe('system');
    expect(subjects[0]?.class_level).toBeNull();

    // The upgrade was written back once, so the next launch starts at v2.
    const stored = JSON.parse(storage.getItem(DB_KEY) ?? '{}') as { version?: number };
    expect(stored.version).toBe(2);
  });

  it('leaves a store from a newer version alone', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      DB_KEY,
      JSON.stringify({
        version: 7,
        tables: {
          profiles: [
            {
              id: USER,
              display_name: 'Future',
              locale: 'en',
              timezone: 'Asia/Dhaka',
              academic_level: 'HSC',
              study_windows: null,
              active_class: 11,
              active_group: 'science',
              onboarded_at: '2026-01-01T00:00:00.000Z',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      }),
    );

    const repo = new LocalRepository(USER, storage);
    const profile = await repo.getProfile();
    expect(profile.display_name).toBe('Future');
    expect(profile.active_class).toBe(11);

    // A newer schema is not rewritten into an older shape.
    const stored = JSON.parse(storage.getItem(DB_KEY) ?? '{}') as { version?: number };
    expect(stored.version).toBe(7);
  });
});
