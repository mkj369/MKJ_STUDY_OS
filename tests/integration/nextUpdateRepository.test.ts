import { describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage, STORAGE_PREFIX } from '@/services/local/storage';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeRepo(storage = new MemoryStorage()) {
  return { repo: new LocalRepository(USER, storage), storage };
}

describe('lecture checklists (local repository)', () => {
  it('creates defaults once, never duplicates, and tracks completion', async () => {
    const { repo } = makeRepo();
    const subject = await repo.create('user_subjects', {
      curriculum_subject_id: null,
      curriculum_version_id: null,
      custom_name: 'Physics',
      custom_paper_label: null,
      status: 'active',
      color: '#0f5132',
      sort_order: 1,
      is_demo: false,
    });
    const lecture = await repo.create('lecture_records', {
      user_subject_id: subject.id,
      user_chapter_id: null,
      title: 'Vectors 1',
      lecture_number: 1,
      source: 'recorded',
      platform: null,
      instructor: null,
      lecture_date: '2026-11-01',
      duration_minutes: 40,
      is_completed: false,
      notes: null,
      follow_up: null,
      is_demo: false,
    });

    const first = await repo.ensureLectureChecklistDefaults(lecture.id);
    expect(first.length).toBe(5);
    const again = await repo.ensureLectureChecklistDefaults(lecture.id);
    expect(again.map((i) => i.id)).toEqual(first.map((i) => i.id));

    const item = first[0]!;
    await repo.update('lecture_checklist_items', item.id, {
      is_done: true,
      completed_at: new Date().toISOString(),
    });
    const saved = (await repo.list('lecture_checklist_items')).find((i) => i.id === item.id);
    expect(saved?.is_done).toBe(true);

    // Persists across repository instances (app restart).
    const { repo: restarted } = makeRepo((repo as unknown as { db: { storage: MemoryStorage } }).db.storage);
    const afterRestart = await restarted.list('lecture_checklist_items');
    expect(afterRestart.find((i) => i.id === item.id)?.is_done).toBe(true);
  });

  it('deleting a lecture cascades its checklist (mirrors the SQL FK)', async () => {
    const { repo } = makeRepo();
    const subject = await repo.create('user_subjects', {
      curriculum_subject_id: null,
      curriculum_version_id: null,
      custom_name: 'Chemistry',
      custom_paper_label: null,
      status: 'active',
      color: '#0f5132',
      sort_order: 1,
      is_demo: false,
    });
    const lecture = await repo.create('lecture_records', {
      user_subject_id: subject.id,
      user_chapter_id: null,
      title: 'Bonding',
      lecture_number: null,
      source: 'live',
      platform: null,
      instructor: null,
      lecture_date: '2026-11-01',
      duration_minutes: null,
      is_completed: false,
      notes: null,
      follow_up: null,
      is_demo: false,
    });
    await repo.ensureLectureChecklistDefaults(lecture.id);
    await repo.remove('lecture_records', lecture.id);
    expect(await repo.list('lecture_checklist_items')).toHaveLength(0);
  });

  it('renaming a lecture keeps its checklist intact', async () => {
    const { repo } = makeRepo();
    const subject = await repo.create('user_subjects', {
      curriculum_subject_id: null,
      curriculum_version_id: null,
      custom_name: 'Math',
      custom_paper_label: null,
      status: 'active',
      color: '#0f5132',
      sort_order: 1,
      is_demo: false,
    });
    const lecture = await repo.create('lecture_records', {
      user_subject_id: subject.id,
      user_chapter_id: null,
      title: 'Old title',
      lecture_number: null,
      source: 'live',
      platform: null,
      instructor: null,
      lecture_date: '2026-11-01',
      duration_minutes: null,
      is_completed: false,
      notes: null,
      follow_up: null,
      is_demo: false,
    });
    const items = await repo.ensureLectureChecklistDefaults(lecture.id);
    await repo.update('lecture_records', lecture.id, { title: 'New title' });
    const after = await repo.list('lecture_checklist_items');
    expect(after.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });
});

describe('study targets (local repository)', () => {
  it('creates, edits and deletes targets; bundle carries them', async () => {
    const { repo } = makeRepo();
    const target = await repo.create('study_targets', {
      title: '3 lectures this week',
      period_type: 'weekly',
      period_start: '2026-11-04',
      metric: 'lectures',
      target_value: 3,
      user_subject_id: null,
      chapter_ids: [],
      notes: null,
      is_demo: false,
    });
    let bundle = await repo.listAllUserData();
    expect(bundle.studyTargets).toHaveLength(1);

    await repo.update('study_targets', target.id, { target_value: 5, title: '5 lectures this week' });
    bundle = await repo.listAllUserData();
    expect(bundle.studyTargets[0]?.target_value).toBe(5);

    await repo.remove('study_targets', target.id);
    bundle = await repo.listAllUserData();
    expect(bundle.studyTargets).toHaveLength(0);
  });

  it('deleting a subject unlinks its targets instead of deleting them', async () => {
    const { repo } = makeRepo();
    const subject = await repo.create('user_subjects', {
      curriculum_subject_id: null,
      curriculum_version_id: null,
      custom_name: 'Physics',
      custom_paper_label: null,
      status: 'active',
      color: '#0f5132',
      sort_order: 1,
      is_demo: false,
    });
    const target = await repo.create('study_targets', {
      title: 'Physics minutes',
      period_type: 'monthly',
      period_start: '2026-11-01',
      metric: 'minutes',
      target_value: 600,
      user_subject_id: subject.id,
      chapter_ids: [],
      notes: null,
      is_demo: false,
    });
    await repo.remove('user_subjects', subject.id);
    const survivors = await repo.list('study_targets');
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.id).toBe(target.id);
    expect(survivors[0]?.user_subject_id).toBeNull();
  });
});

describe('preferences & community (local repository)', () => {
  it('preferences default to system theme and persist changes', async () => {
    const { repo, storage } = makeRepo();
    const prefs = await repo.getUserPreferences();
    expect(prefs.theme).toBe('system');
    await repo.saveUserPreferences({ theme: 'dark' });
    const restarted = new LocalRepository(USER, storage);
    expect((await restarted.getUserPreferences()).theme).toBe('dark');
  });

  it('community profile is absent by default, upserts by user, and can be removed', async () => {
    const { repo } = makeRepo();
    expect(await repo.getCommunityProfile()).toBeNull();
    const snapshot = {
      pseudonym: 'Quiet Falcon',
      academic_track: 'hsc' as const,
      study_group: 'Science',
      sharing_enabled: true,
      share_academic_info: true,
      overall_percent: 40,
      chapters_completed: 4,
      chapters_total: 10,
      weekly_minutes: 120,
      snapshot_at: new Date().toISOString(),
    };
    await repo.saveCommunityProfile(snapshot);
    await repo.saveCommunityProfile({ ...snapshot, overall_percent: 55 });
    const rows = await repo.list('community_profiles');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.overall_percent).toBe(55);
    // Local mode has no other students to show.
    expect(await repo.listSharedCommunityProfiles()).toEqual([]);
    await repo.deleteCommunityProfile();
    expect(await repo.getCommunityProfile()).toBeNull();
  });

  it("another local user cannot see the first user's targets or community row", async () => {
    const storage = new MemoryStorage();
    const repoA = new LocalRepository(USER, storage);
    const repoB = new LocalRepository('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', storage);
    await repoA.create('study_targets', {
      title: 'Private goal',
      period_type: 'weekly',
      period_start: '2026-11-04',
      metric: 'minutes',
      target_value: 60,
      user_subject_id: null,
      chapter_ids: [],
      notes: null,
      is_demo: false,
    });
    expect(await repoB.list('study_targets')).toHaveLength(0);
    expect(await repoB.getCommunityProfile()).toBeNull();
  });
});

describe('v1 → next-update upgrade safety', () => {
  it('backfills new profile columns on read without touching existing records', async () => {
    const storage = new MemoryStorage();
    // Simulate storage written by the previous release: no new columns/tables.
    const v1Shape = {
      version: 1,
      tables: {
        profiles: [
          {
            id: USER,
            display_name: 'Existing Student',
            locale: 'en',
            timezone: 'Asia/Dhaka',
            academic_level: 'HSC',
            study_windows: { '1': 90 },
            onboarded_at: '2026-09-01T00:00:00.000Z',
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
          },
        ],
        user_subjects: [
          {
            id: 'subj-1',
            user_id: USER,
            curriculum_subject_id: null,
            curriculum_version_id: null,
            custom_name: 'Physics',
            custom_paper_label: null,
            status: 'active',
            color: '#0f5132',
            sort_order: 1,
            is_demo: false,
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
          },
        ],
        user_chapters: [
          {
            id: 'chap-1',
            user_id: USER,
            user_subject_id: 'subj-1',
            curriculum_chapter_id: null,
            curriculum_version_id: null,
            custom_title: 'Motion',
            status: 'in_progress',
            lecture_target_count: 4,
            import_batch_id: null,
            is_demo: false,
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
          },
        ],
        chapter_checklist_items: [
          {
            id: 'item-1',
            user_id: USER,
            user_chapter_id: 'chap-1',
            kind: 'reading',
            label: 'Main book reading',
            sort_order: 1,
            is_archived: false,
            created_at: '2026-09-01T00:00:00.000Z',
          },
        ],
        chapter_checklist_progress: [
          {
            id: 'prog-1',
            user_id: USER,
            checklist_item_id: 'item-1',
            is_done: true,
            completed_at: '2026-10-01T00:00:00.000Z',
            note: null,
            updated_at: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    };
    storage.setItem(`${STORAGE_PREFIX}.db`, JSON.stringify(v1Shape));

    const repo = new LocalRepository(USER, storage);
    const bundle = await repo.listAllUserData();

    // Old data intact.
    expect(bundle.profile.display_name).toBe('Existing Student');
    expect(bundle.subjects).toHaveLength(1);
    expect(bundle.chapters[0]?.custom_title).toBe('Motion');
    expect(bundle.checklistProgress[0]?.is_done).toBe(true);
    // New columns backfilled with honest nulls, new tables empty.
    expect(bundle.profile.academic_track).toBeNull();
    expect(bundle.profile.setup_completed_at).toBeNull();
    expect(bundle.studyTargets).toEqual([]);
    expect(bundle.lectureChecklist).toEqual([]);
    expect(bundle.userPreferences.theme).toBe('system');
    // And a write after upgrade keeps the old rows.
    await repo.updateProfile({ academic_track: 'hsc', setup_completed_at: new Date().toISOString() });
    const after = await repo.getProfile();
    expect(after.academic_track).toBe('hsc');
    expect(after.display_name).toBe('Existing Student');
    expect((await repo.list('chapter_checklist_progress'))[0]?.is_done).toBe(true);
  });
});
