import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage } from '@/services/local/storage';
import { RepositoryError } from '@/services/repository';
import type { NewRow } from '@/services/repository';
import { DEMO_CURRICULUM } from '@/services/seed/demoCurriculum';
import { DEFAULT_CHECKLIST } from '@/services/seed/checklistDefaults';

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

async function createSubject(repo: LocalRepository, name = 'Physics'): Promise<string> {
  const subject = await repo.create('user_subjects', {
    custom_name: name,
    status: 'active',
    color: '#1d4ed8',
    sort_order: 1,
    is_demo: false,
  } as NewRow<'user_subjects'>);
  return subject.id;
}

async function createChapter(repo: LocalRepository, subjectId: string, title = 'Motion'): Promise<string> {
  const chapter = await repo.create('user_chapters', {
    user_subject_id: subjectId,
    custom_title: title,
    status: 'not_recorded',
    lecture_target_count: null,
    is_demo: false,
  } as NewRow<'user_chapters'>);
  return chapter.id;
}

describe('per-user isolation (local mode)', () => {
  it('never shows one user rows to another', async () => {
    const subjectId = await createSubject(repoA);
    const chapterId = await createChapter(repoA, subjectId);
    await repoA.create('lecture_records', {
      user_subject_id: subjectId,
      user_chapter_id: chapterId,
      title: 'Private lecture',
      lecture_date: '2026-10-27',
      source: 'live',
      is_completed: true,
      is_demo: false,
    } as NewRow<'lecture_records'>);

    expect(await repoB.list('user_subjects')).toHaveLength(0);
    expect(await repoB.list('user_chapters')).toHaveLength(0);
    expect(await repoB.list('lecture_records')).toHaveLength(0);
    expect(await repoA.list('lecture_records')).toHaveLength(1);
  });

  it('cannot delete another user rows by id', async () => {
    const subjectId = await createSubject(repoA);
    // Local mode fails loudly (cloud mode is a silent no-op under RLS).
    await expect(repoB.remove('user_subjects', subjectId)).rejects.toMatchObject({ code: 'forbidden' });
    expect(await repoA.list('user_subjects')).toHaveLength(1);
  });

  it('gives each user their own profile and reminder preferences', async () => {
    const profileA = await repoA.getProfile();
    const profileB = await repoB.getProfile();
    expect(profileA.id).toBe(USER_A);
    expect(profileB.id).toBe(USER_B);
    const prefsA = await repoA.getReminderPreferences();
    const prefsB = await repoB.getReminderPreferences();
    expect(prefsA.user_id).toBe(USER_A);
    expect(prefsB.user_id).toBe(USER_B);
  });

  it('shares read-only curriculum data between users', async () => {
    const curriculumA = await repoA.listCurriculum();
    const curriculumB = await repoB.listCurriculum();
    expect(curriculumA.versions).toHaveLength(curriculumB.versions.length);
    // Demo rows and the official SSC/HSC subject structures coexist; the demo
    // one is not necessarily first any more.
    expect(curriculumA.versions.some((version) => version.is_demo)).toBe(true);
    expect(curriculumA.versions.filter((version) => !version.is_demo)).toHaveLength(6);
  });

  it('rejects writes to curriculum tables', async () => {
    await expect(
      repoA.create('curriculum_versions', {} as NewRow<'curriculum_versions'>),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('history-safe deletes', () => {
  it('keeps lecture records when their chapter is deleted, unlinked', async () => {
    const subjectId = await createSubject(repoA);
    const chapterId = await createChapter(repoA, subjectId);
    const lecture = await repoA.create('lecture_records', {
      user_subject_id: subjectId,
      user_chapter_id: chapterId,
      title: 'Keep me',
      lecture_date: '2026-10-27',
      source: 'live',
      is_completed: true,
      is_demo: false,
    } as NewRow<'lecture_records'>);

    await repoA.remove('user_chapters', chapterId);

    const lectures = await repoA.list('lecture_records');
    expect(lectures).toHaveLength(1);
    expect(lectures[0]?.id).toBe(lecture.id);
    expect(lectures[0]?.user_chapter_id).toBeNull();
  });

  it('removes checklist items with their chapter', async () => {
    const subjectId = await createSubject(repoA);
    const chapterId = await createChapter(repoA, subjectId);
    const items = await repoA.ensureChecklistDefaults(chapterId);
    expect(items.length).toBeGreaterThan(0);
    await repoA.setChecklistProgress(chapterId, items[0]!.id, true);

    await repoA.remove('user_chapters', chapterId);

    expect(await repoA.list('chapter_checklist_items')).toHaveLength(0);
    expect(await repoA.list('chapter_checklist_progress')).toHaveLength(0);
  });

  it('refuses to delete a subject that still has records', async () => {
    const subjectId = await createSubject(repoA);
    const chapterId = await createChapter(repoA, subjectId);
    await repoA.create('study_sessions', {
      user_subject_id: subjectId,
      user_chapter_id: chapterId,
      activity_type: 'practice',
      session_date: '2026-10-27',
      duration_minutes: 30,
      is_demo: false,
    } as NewRow<'study_sessions'>);

    await expect(repoA.remove('user_subjects', subjectId)).rejects.toMatchObject({
      code: 'subject_has_records',
    });
    // Nothing was deleted.
    expect(await repoA.list('user_subjects')).toHaveLength(1);
    expect(await repoA.list('user_chapters')).toHaveLength(1);
    expect(await repoA.list('study_sessions')).toHaveLength(1);
  });

  it('deletes an empty subject together with its chapters', async () => {
    const subjectId = await createSubject(repoA);
    await createChapter(repoA, subjectId);
    await repoA.remove('user_subjects', subjectId);
    expect(await repoA.list('user_subjects')).toHaveLength(0);
    expect(await repoA.list('user_chapters')).toHaveLength(0);
  });
});

describe('checklist behaviour', () => {
  it('creates defaults once and toggles progress idempotently', async () => {
    const subjectId = await createSubject(repoA);
    const chapterId = await createChapter(repoA, subjectId);
    const first = await repoA.ensureChecklistDefaults(chapterId);
    const second = await repoA.ensureChecklistDefaults(chapterId);
    expect(second).toHaveLength(first.length);

    const item = first[0]!;
    const done = await repoA.setChecklistProgress(chapterId, item.id, true);
    expect(done.is_done).toBe(true);
    expect(done.completed_at).not.toBeNull();
    const toggled = await repoA.setChecklistProgress(chapterId, item.id, true);
    expect(toggled.id).toBe(done.id);
    expect(await repoA.list('chapter_checklist_progress')).toHaveLength(1);
    const cleared = await repoA.setChecklistProgress(chapterId, item.id, false);
    expect(cleared.completed_at).toBeNull();
  });

  it('rejects progress for an unknown item', async () => {
    await expect(
      repoA.setChecklistProgress('chapter', '00000000-0000-4000-8000-000000000999', true),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('curriculum adoption', () => {
  it('adopts a subject once and then returns the existing row', async () => {
    const version = DEMO_CURRICULUM.version;
    const subject = DEMO_CURRICULUM.subjects[0]!;
    const first = await repoA.adoptCurriculumSubject(version.id, subject.id);
    const second = await repoA.adoptCurriculumSubject(version.id, subject.id);
    expect(second.id).toBe(first.id);
    expect(await repoA.list('user_subjects')).toHaveLength(1);
  });

  it('puts an adopted subject in the class it was adopted for', async () => {
    /*
     * The regression this pins: adoption used to write no class at all, so the
     * copy was immediately invisible on every class-scoped screen and the
     * student saw "No subjects yet" right after adding Physics.
     */
    const version = DEMO_CURRICULUM.version;
    const subject = DEMO_CURRICULUM.subjects[0]!;
    const adopted = await repoA.adoptCurriculumSubject(version.id, subject.id, 11);
    expect(adopted.class_level).toBe(11);

    const rows = await repoA.list('user_subjects');
    expect(rows.filter((row) => row.class_level === 11)).toHaveLength(1);
  });

  it('moves a re-adopted subject instead of duplicating it', async () => {
    const version = DEMO_CURRICULUM.version;
    const subject = DEMO_CURRICULUM.subjects[0]!;
    const first = await repoA.adoptCurriculumSubject(version.id, subject.id, 11);
    const again = await repoA.adoptCurriculumSubject(version.id, subject.id, 12);
    expect(again.id).toBe(first.id);
    expect(again.class_level).toBe(12);
    expect(await repoA.list('user_subjects')).toHaveLength(1);
  });

  it('numbers a new subject after the ones already in its class', async () => {
    await repoA.createPersonalSubject({ classLevel: 9, name: 'Physics' });
    await repoA.createPersonalSubject({ classLevel: 9, name: 'Chemistry' });
    const otherClass = await repoA.createPersonalSubject({ classLevel: 10, name: 'Physics' });
    const rows = await repoA.list('user_subjects');
    const inClass9 = rows.filter((row) => row.class_level === 9);
    expect(inClass9.map((row) => row.sort_order)).toEqual([1, 2]);
    // A same-named subject in another class is not a duplicate.
    expect(otherClass.class_level).toBe(10);
    await expect(repoA.createPersonalSubject({ classLevel: 9, name: 'physics' })).rejects.toMatchObject({
      code: 'duplicate',
    });
  });

  it('adds selected chapters, skips duplicates, and supports rollback', async () => {
    const version = DEMO_CURRICULUM.version;
    const subject = DEMO_CURRICULUM.subjects[0]!;
    await repoA.adoptCurriculumSubject(version.id, subject.id);
    const chapterIds = DEMO_CURRICULUM.chapters
      .filter((chapter) => chapter.curriculum_subject_id === subject.id)
      .map((chapter) => chapter.id);
    expect(chapterIds.length).toBeGreaterThan(0);

    const first = await repoA.addChaptersFromCurriculum(version.id, subject.id, chapterIds);
    expect(first.created).toBe(chapterIds.length);
    expect(first.skipped).toBe(0);
    // Each new chapter gets the standard checklist.
    expect(await repoA.list('chapter_checklist_items')).toHaveLength(chapterIds.length * DEFAULT_CHECKLIST.length);

    const again = await repoA.addChaptersFromCurriculum(version.id, subject.id, chapterIds);
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(chapterIds.length);

    const removed = await repoA.rollbackImport(first.importBatchId);
    expect(removed).toBe(chapterIds.length);
    expect(await repoA.list('user_chapters')).toHaveLength(0);
    // The subject survives an import rollback.
    expect(await repoA.list('user_subjects')).toHaveLength(1);
  });

  it('requires the subject before chapters can be added', async () => {
    await expect(
      repoA.addChaptersFromCurriculum(DEMO_CURRICULUM.version.id, DEMO_CURRICULUM.subjects[0]!.id, []),
    ).rejects.toMatchObject({ code: 'subject_missing' });
  });
});

describe('demo workspace', () => {
  it('marks every demo row as demo and can remove all of them', async () => {
    const keptSubject = await createSubject(repoA, 'My own subject');
    const result = await repoA.seedDemoWorkspace();
    expect(result.createdSubjects).toBeGreaterThan(0);
    expect(result.createdChapters).toBeGreaterThan(0);
    expect(await repoA.hasDemoData()).toBe(true);

    const subjects = await repoA.list('user_subjects');
    expect(subjects.some((s) => s.is_demo && s.custom_name === null)).toBe(true);
    expect(subjects.some((s) => !s.is_demo && s.custom_name === 'My own subject')).toBe(true);

    const removal = await repoA.removeDemoData();
    expect(removal.removed).toBeGreaterThan(0);
    expect(await repoA.hasDemoData()).toBe(false);
    const remaining = await repoA.list('user_subjects');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(keptSubject);
    // Demo logs are gone too.
    expect(await repoA.list('lecture_records')).toHaveLength(0);
    expect(await repoA.list('study_sessions')).toHaveLength(0);
    expect(await repoA.list('exam_results')).toHaveLength(0);
  });

  it('does not load demo data twice', async () => {
    await repoA.seedDemoWorkspace();
    await expect(repoA.seedDemoWorkspace()).rejects.toMatchObject({ code: 'demo_exists' });
  });

  it('is isolated per user', async () => {
    await repoA.seedDemoWorkspace();
    expect(await repoB.hasDemoData()).toBe(false);
    expect(await repoB.list('user_subjects')).toHaveLength(0);
  });
});

describe('export and purge', () => {
  it('exports every table plus the profile and demo flag', async () => {
    await createSubject(repoA);
    const exported = (await repoA.exportAll()) as unknown as {
      tables: Record<string, unknown[]>;
      profile: { id: string };
      mode: string;
      demo_active: boolean;
    };
    expect(exported.mode).toBe('local');
    expect(exported.profile.id).toBe(USER_A);
    expect(exported.demo_active).toBe(false);
    expect(exported.tables.user_subjects).toHaveLength(1);
    expect(exported.tables.curriculum_versions).toBeDefined();
  });

  it('removes user records one table at a time (settings purge)', async () => {
    await createSubject(repoA);
    for (const table of ['user_subjects'] as const) {
      for (const row of await repoA.list(table)) await repoA.remove(table, row.id);
    }
    expect(await repoA.list('user_subjects')).toHaveLength(0);
    expect((await repoA.getProfile()).id).toBe(USER_A);
  });
});

describe('reminders persistence', () => {
  it('stores preferences and event status transitions', async () => {
    const prefs = await repoA.getReminderPreferences();
    expect(prefs.channel).toBe('in_app');
    const updated = await repoA.saveReminderPreferences({ reminders_enabled: false, max_per_day: 1 });
    expect(updated.reminders_enabled).toBe(false);
    expect(updated.max_per_day).toBe(1);

    const [event] = await repoA.saveReminderEvents([
      {
        reminder_key: 'task_due:abc:2026-10-27',
        reminder_type: 'task_due',
        scheduled_for: '2026-10-27T02:00:00.000Z',
        title: 'Due today',
        body: 'Test',
        status: 'scheduled',
        channel: 'in_app',
        related_entity_type: 'study_task',
        related_entity_id: 'abc',
        error_message: null,
      },
    ]);
    expect(event?.status).toBe('scheduled');
    const sent = await repoA.updateReminderEventStatus(event!.id, 'sent');
    expect(sent.status).toBe('sent');
    // The UI only says "sent (confirmed)" when the platform reported success.
    const failed = await repoA.updateReminderEventStatus(event!.id, 'failed', 'web build cannot schedule');
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('web build cannot schedule');
    expect(await repoB.list('reminder_events')).toHaveLength(0);
  });
});
