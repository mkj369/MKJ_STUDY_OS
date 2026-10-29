import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage } from '@/services/local/storage';
import { OFFICIAL_CHAPTERS, OFFICIAL_SUBJECTS, OFFICIAL_VERSIONS } from '@/services/seed/officialCurriculum';

/**
 * Importing the same paper twice must not duplicate a single row, and importing
 * one paper must not drag in another. Both are easy to break with a careless
 * `filter` and both are invisible until a student's chapter count doubles, so
 * they are pinned here against the real repository rather than a mock.
 */

const USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let storage: MemoryStorage;
let repo: LocalRepository;

beforeEach(() => {
  storage = new MemoryStorage();
  repo = new LocalRepository(USER, storage);
});

const scienceVersion = OFFICIAL_VERSIONS.find(
  (version) => version.education_level === 'HSC' && version.stream === 'Science' && !version.is_demo,
)!;

function paper(name: string, label: string) {
  const subject = OFFICIAL_SUBJECTS.find(
    (candidate) =>
      candidate.curriculum_version_id === scienceVersion.id &&
      candidate.name === name &&
      candidate.paper_label === label,
  );
  expect(subject, `${name} ${label} must exist`).toBeTruthy();
  return {
    subject: subject!,
    chapters: OFFICIAL_CHAPTERS.filter((chapter) => chapter.curriculum_subject_id === subject!.id),
  };
}

const physics2 = paper('Physics', '2nd Paper');
const physics1 = paper('Physics', '1st Paper');

describe('curriculum import idempotency', () => {
  it('creates the chapters once and skips them on a second run', async () => {
    const ids = physics2.chapters.map((chapter) => chapter.id);

    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    const first = await repo.addChaptersFromCurriculum(scienceVersion.id, physics2.subject.id, ids);
    expect(first.created).toBe(15);
    expect(first.skipped).toBe(0);

    // Same call again: the exact thing that happens when the button is pressed
    // twice, or a slow request is retried.
    const second = await repo.addChaptersFromCurriculum(scienceVersion.id, physics2.subject.id, ids);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(15);

    const subjects = await repo.list('user_subjects');
    const mine = (await repo.list('user_chapters')).filter(
      (chapter) => chapter.user_subject_id === subjects[0].id,
    );
    expect(mine).toHaveLength(15);
  });

  it('leaves the student with 15 chapters, not 30, after a reload re-runs the seed', async () => {
    const ids = physics2.chapters.map((chapter) => chapter.id);
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    await repo.addChaptersFromCurriculum(scienceVersion.id, physics2.subject.id, ids);

    // A new repository on the same storage is an app restart.
    const restarted = new LocalRepository(USER, storage);
    await restarted.addChaptersFromCurriculum(scienceVersion.id, physics2.subject.id, ids);

    const subjects = await restarted.list('user_subjects');
    const chapters = (await restarted.list('user_chapters')).filter(
      (chapter) => chapter.user_subject_id === subjects[0].id,
    );
    expect(chapters).toHaveLength(15);
    expect(new Set(chapters.map((chapter) => chapter.curriculum_chapter_id)).size).toBe(15);
  });

  it('does not attach the other paper\'s chapters when one paper is imported', async () => {
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    await repo.addChaptersFromCurriculum(
      scienceVersion.id,
      physics2.subject.id,
      physics2.chapters.map((chapter) => chapter.id),
    );

    const subjects = await repo.list('user_subjects');
    const chapters = (await repo.list('user_chapters')).filter(
      (chapter) => chapter.user_subject_id === subjects[0].id,
    );
    const firstPaperIds = new Set(physics1.chapters.map((chapter) => chapter.id));
    expect(chapters.some((chapter) => firstPaperIds.has(chapter.curriculum_chapter_id ?? ''))).toBe(false);
  });

  it('refuses to import chapters for a paper that was never adopted', async () => {
    // Nothing to attach to: the repository must say so instead of inventing a
    // subject, because a silent subject is exactly how a stray paper appears.
    await expect(
      repo.addChaptersFromCurriculum(
        scienceVersion.id,
        physics2.subject.id,
        physics2.chapters.map((chapter) => chapter.id),
      ),
    ).rejects.toThrow(/add the subject first/i);
    expect(await repo.list('user_chapters')).toHaveLength(0);
  });

  it('keeps checklist ticks when the same paper is imported again', async () => {
    const ids = physics2.chapters.map((chapter) => chapter.id);
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    await repo.addChaptersFromCurriculum(scienceVersion.id, physics2.subject.id, ids);

    const subjects = await repo.list('user_subjects');
    const [chapter] = (await repo.list('user_chapters')).filter(
      (row) => row.user_subject_id === subjects[0].id,
    );
    const items = await repo.ensureChecklistDefaults(chapter.id);
    await repo.setChecklistProgress(chapter.id, items[0].id, true);

    await repo.addChaptersFromCurriculum(scienceVersion.id, physics2.subject.id, ids);

    const progress = await repo.list('chapter_checklist_progress');
    expect(progress.filter((row) => row.is_done)).toHaveLength(1);
    // And it is still attached to a chapter that still exists.
    const chapterIds = new Set((await repo.list('user_chapters')).map((row) => row.id));
    expect(chapterIds.has(chapter.id)).toBe(true);
  });

  it('adopting the same subject twice does not create a second subject row', async () => {
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    const subjects = await repo.list('user_subjects');
    expect(subjects).toHaveLength(1);
    expect(subjects[0].curriculum_subject_id).toBe(physics2.subject.id);
  });

  it('keeps 1st and 2nd Paper as two separate subjects with separate chapters', async () => {
    await repo.adoptCurriculumSubject(scienceVersion.id, physics1.subject.id);
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    const subjects = await repo.list('user_subjects');
    expect(subjects).toHaveLength(2);

    const byId = new Map(subjects.map((subject) => [subject.curriculum_subject_id, subject]));
    const first = byId.get(physics1.subject.id)!;
    const second = byId.get(physics2.subject.id)!;
    expect(first.id).not.toBe(second.id);

    // Physics 1st Paper has no official chapters, so importing the 2nd Paper's
    // list must not give the 1st Paper any.
    await repo.addChaptersFromCurriculum(
      scienceVersion.id,
      physics2.subject.id,
      physics2.chapters.map((chapter) => chapter.id),
    );
    const chapters = await repo.list('user_chapters');
    expect(chapters.filter((chapter) => chapter.user_subject_id === first.id)).toHaveLength(0);
    expect(chapters.filter((chapter) => chapter.user_subject_id === second.id)).toHaveLength(15);
  });
});

describe('imported rows keep their provenance', () => {
  it('stores the curriculum chapter id so the source survives in the workspace', async () => {
    await repo.adoptCurriculumSubject(scienceVersion.id, physics2.subject.id);
    await repo.addChaptersFromCurriculum(
      scienceVersion.id,
      physics2.subject.id,
      physics2.chapters.map((chapter) => chapter.id),
    );
    const imported = await repo.list('user_chapters');
    expect(imported).toHaveLength(15);
    // Every imported row points back at a real curriculum row, which is where the
    // source URL and verification status live.
    const curriculumIds = new Set(OFFICIAL_CHAPTERS.map((chapter) => chapter.id));
    for (const chapter of imported) {
      expect(chapter.curriculum_chapter_id).toBeTruthy();
      expect(curriculumIds.has(chapter.curriculum_chapter_id!)).toBe(true);
      expect(chapter.curriculum_version_id).toBe(scienceVersion.id);
    }
  });
});
