import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage } from '@/services/local/storage';
import { DEMO_CHAPTERS, DEMO_SUBJECT_IDS, DEMO_VERSION_ID } from '@/services/seed/demoCurriculum';
import { OFFICIAL_SUBJECTS, OFFICIAL_VERSIONS } from '@/services/seed/officialCurriculum';
import type { NewRow } from '@/services/repository';

/**
 * The curriculum seed runs again on every app start, and will run again every
 * time official data is corrected. That must never cost a student their work.
 *
 * These tests adopt real curriculum rows, record progress against them, then
 * rebuild the repository on the same storage — which re-runs the whole seed —
 * and assert the progress is untouched and still linked.
 */

const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let storage: MemoryStorage;
let repo: LocalRepository;

beforeEach(() => {
  storage = new MemoryStorage();
  repo = new LocalRepository(USER, storage);
});

/** A fresh repository on the same storage == an app restart re-running the seed. */
function restart(): LocalRepository {
  return new LocalRepository(USER, storage);
}

describe('curriculum metadata updates preserve progress', () => {
  it('keeps chapter status and checklist ticks across a reseed', async () => {
    await repo.adoptCurriculumSubject(DEMO_VERSION_ID, DEMO_SUBJECT_IDS.physics1);
    const physicsChapters = DEMO_CHAPTERS.filter((c) => c.curriculum_subject_id === DEMO_SUBJECT_IDS.physics1);
    const result = await repo.addChaptersFromCurriculum(
      DEMO_VERSION_ID,
      DEMO_SUBJECT_IDS.physics1,
      physicsChapters.map((c) => c.id),
    );
    expect(result.created).toBe(physicsChapters.length);

    const chapters = await repo.list('user_chapters');
    const target = chapters[0]!;
    await repo.update('user_chapters', target.id, { status: 'complete' });
    const items = (await repo.list('chapter_checklist_items')).filter(
      (item) => item.user_chapter_id === chapters[1]!.id,
    );
    expect(items.length).toBeGreaterThan(0);
    await repo.setChecklistProgress(chapters[1]!.id, items[0]!.id, true, 'read it twice');

    const before = await repo.list('user_chapters');
    const checklistBefore = await repo.list('chapter_checklist_progress');

    const after = restart();
    const chaptersAfter = await after.list('user_chapters');
    const checklistAfter = await after.list('chapter_checklist_progress');

    expect(chaptersAfter).toHaveLength(before.length);
    expect(chaptersAfter.find((c) => c.id === target.id)?.status).toBe('complete');
    expect(chaptersAfter.find((c) => c.id === target.id)?.curriculum_chapter_id).toBe(target.curriculum_chapter_id);
    expect(checklistAfter).toEqual(checklistBefore);
    expect(checklistAfter.some((row) => row.is_done && row.note === 'read it twice')).toBe(true);
  });

  it('keeps an adopted official subject attached by id after a reseed', async () => {
    const subject = OFFICIAL_SUBJECTS.find((s) => s.name === 'Physics' && s.is_compulsory === false)!;
    const version = OFFICIAL_VERSIONS.find((v) => v.id === subject.curriculum_version_id)!;

    const adopted = await repo.adoptCurriculumSubject(version.id, subject.id);
    expect(adopted.curriculum_subject_id).toBe(subject.id);

    const after = restart();
    const adoptedAfter = (await after.list('user_subjects')).find((s) => s.id === adopted.id);
    expect(adoptedAfter?.curriculum_subject_id).toBe(subject.id);
    expect(adoptedAfter?.curriculum_version_id).toBe(version.id);

    // The reference row itself is still there, still short of `verified`, now
    // carrying the 14 chapters read from the printed contents page. A reseed
    // attaches them; it never drops the student's link to the subject.
    const curriculum = await after.listCurriculum();
    const referenceSubject = curriculum.subjects.find((s) => s.id === subject.id);
    expect(referenceSubject?.verification_status).toBe('partially_verified');
    expect(referenceSubject?.source_document).toContain('সূচিপত্র');
    const chapters = curriculum.chapters.filter((c) => c.curriculum_subject_id === subject.id);
    expect(chapters).toHaveLength(14);
    expect(chapters.every((c) => c.source_url && c.verification_status !== 'verified')).toBe(true);
  });

  it('never duplicates curriculum rows when the seed runs repeatedly', async () => {
    const first = await repo.listCurriculum();
    restart();
    restart();
    const third = await repo.listCurriculum();
    expect(third.versions).toHaveLength(first.versions.length);
    expect(third.subjects).toHaveLength(first.subjects.length);
    expect(third.chapters).toHaveLength(first.chapters.length);
    expect(new Set(third.subjects.map((s) => s.id)).size).toBe(third.subjects.length);
  });

  it('leaves user-created chapters and notes untouched', async () => {
    const subject = await repo.create('user_subjects', {
      custom_name: 'My subject',
      status: 'active',
      color: '#1d4ed8',
      sort_order: 1,
      is_demo: false,
    } as NewRow<'user_subjects'>);
    const chapter = await repo.create('user_chapters', {
      user_subject_id: subject.id,
      custom_title: 'My own chapter',
      status: 'in_progress',
      lecture_target_count: 10,
      is_demo: false,
    } as NewRow<'user_chapters'>);
    await repo.create('notes', {
      user_chapter_id: chapter.id,
      kind: 'note',
      title: 'Important',
      body: 'Do not lose me',
      tags: [],
      is_pinned: false,
      is_demo: false,
    } as unknown as NewRow<'notes'>);

    const after = restart();
    expect((await after.list('user_chapters')).find((c) => c.id === chapter.id)?.custom_title).toBe('My own chapter');
    expect((await after.list('notes')).some((n) => n.title === 'Important')).toBe(true);
  });
});
