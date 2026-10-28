import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/services/local/localRepository';
import { MemoryStorage } from '@/services/local/storage';
import { RepositoryError } from '@/services/repository';
import type { NewRow } from '@/services/repository';

/**
 * The mistake ↔ practice-question link (migration 0005) in the local repository.
 *
 * Postgres enforces the link with a composite FK on (id, user_id). The local
 * repository has to mirror that: a link may only point at a question the same
 * student owns, and deleting the question must clear the link without deleting
 * the mistake.
 */

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let repoA: LocalRepository;
let repoB: LocalRepository;

beforeEach(() => {
  const storage = new MemoryStorage();
  repoA = new LocalRepository(USER_A, storage);
  repoB = new LocalRepository(USER_B, storage);
});

async function setupWorkspace(repo: LocalRepository) {
  const subject = await repo.create('user_subjects', {
    custom_name: 'Physics',
    status: 'active',
    color: '#1d4ed8',
    sort_order: 1,
    is_demo: false,
  } as NewRow<'user_subjects'>);
  const question = await repo.create('practice_questions', {
    user_subject_id: subject.id,
    user_chapter_id: null,
    question_text: 'A ball is thrown vertically upward. Find the maximum height.',
    answer_text: null,
    explanation: null,
    is_demo: false,
  } as NewRow<'practice_questions'>);
  return { subject, question };
}

function mistakeFor(subjectId: string, questionId: string | null, text = 'Used g instead of -g') {
  return {
    user_subject_id: subjectId,
    user_chapter_id: null,
    exam_result_id: null,
    practice_question_id: questionId,
    category: 'concept_gap',
    question_ref: null,
    what_went_wrong: text,
    attempted_answer: 'h = v²/g',
    correction: 'Sign of acceleration is negative on the way up.',
    occurred_at: '2026-10-27',
    is_resolved: false,
    is_demo: false,
  } as NewRow<'mistake_logs'>;
}

describe('mistake → practice question link', () => {
  it('stores and reads back a link to an owned question', async () => {
    const { subject, question } = await setupWorkspace(repoA);
    const mistake = await repoA.create('mistake_logs', mistakeFor(subject.id, question.id));
    expect(mistake.practice_question_id).toBe(question.id);

    const stored = await repoA.list('mistake_logs');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.practice_question_id).toBe(question.id);
  });

  it('keeps mistakes without a link valid', async () => {
    const { subject } = await setupWorkspace(repoA);
    const mistake = await repoA.create('mistake_logs', mistakeFor(subject.id, null));
    expect(mistake.practice_question_id).toBeNull();
  });

  it('rejects a link to another student’s question', async () => {
    const { subject, question } = await setupWorkspace(repoA);
    await expect(repoB.create('mistake_logs', mistakeFor(subject.id, question.id))).rejects.toBeInstanceOf(
      RepositoryError,
    );
    // ...and B never sees or stores the row.
    expect(await repoB.list('mistake_logs')).toHaveLength(0);
  });

  it('rejects a link to a question that does not exist, and leaves the row untouched', async () => {
    const { subject, question } = await setupWorkspace(repoA);
    const mistake = await repoA.create('mistake_logs', mistakeFor(subject.id, null));

    await expect(
      repoA.update('mistake_logs', mistake.id, { practice_question_id: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const [stored] = await repoA.list('mistake_logs');
    expect(stored?.practice_question_id).toBeNull();
    expect(stored?.what_went_wrong).toBe(mistake.what_went_wrong);

    const updated = await repoA.update('mistake_logs', mistake.id, { practice_question_id: question.id });
    expect(updated.practice_question_id).toBe(question.id);
  });

  it('clears the link but keeps the mistake when the question is deleted', async () => {
    const { subject, question } = await setupWorkspace(repoA);
    await repoA.create('mistake_logs', mistakeFor(subject.id, question.id));

    await repoA.remove('practice_questions', question.id);

    const stored = await repoA.list('mistake_logs');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.practice_question_id).toBeNull();
  });
});
