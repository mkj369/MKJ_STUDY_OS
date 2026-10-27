import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '@/services/supabase/supabaseRepository';
import { RepositoryError } from '@/services/repository';
import type { NewRow } from '@/services/repository';

/**
 * Permission failures in cloud mode must reach the student as a plain sentence,
 * never as raw Postgres text, and must be distinguishable from a missing link.
 *
 * The hosted database is unavailable here, so this drives the real
 * SupabaseRepository with a fake client that returns exactly the error shapes
 * PostgREST returns for an RLS rejection, a duplicate and a foreign-key failure.
 */

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Result = { data: unknown[] | null; error: { message: string; code: string } | null };

function clientReturning(result: Result): SupabaseClient {
  const chain: Record<string, unknown> = {};
  const settle = () => Promise.resolve(result);
  Object.assign(chain, {
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: settle,
    single: settle,
    then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
      settle().then(resolve, reject),
  });
  return { from: () => chain } as unknown as SupabaseClient;
}

const repository = (result: Result) =>
  new SupabaseRepository(clientReturning(result), USER);

const mistake = {
  user_subject_id: '11111111-1111-4111-8111-111111111111',
  user_chapter_id: null,
  exam_result_id: null,
  practice_question_id: '22222222-2222-4222-8222-222222222222',
  category: 'concept_gap',
  question_ref: null,
  what_went_wrong: 'Sign error',
  attempted_answer: null,
  correction: null,
  occurred_at: '2026-10-27',
  is_resolved: false,
  is_demo: false,
} as NewRow<'mistake_logs'>;

describe('cloud permission failures', () => {
  it('turns an RLS rejection while linking a mistake into a readable message', async () => {
    const repo = repository({
      data: null,
      error: {
        message: 'new row violates row-level security policy for table "mistake_logs"',
        code: '42501',
      },
    });

    const failure = await repo.create('mistake_logs', mistake).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryError);
    expect((failure as RepositoryError).code).toBe('forbidden');
    expect((failure as RepositoryError).message).toBe(
      'Saving mistake_logs: your account does not have access to that record.',
    );
    // No SQL, no policy name, no table internals in the user-facing text.
    expect((failure as RepositoryError).message).not.toMatch(/row-level security|42501|policy/);
  });

  it('reports a rejected update and delete as permission failures too', async () => {
    const result: Result = {
      data: null,
      error: { message: 'permission denied for table notes', code: '42501' },
    };
    await expect(repository(result).update('notes', 'id-1', { title: 'x' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(repository(result).remove('notes', 'id-1')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('distinguishes a cross-user link (foreign key) from a permission failure', async () => {
    const repo = repository({
      data: null,
      error: {
        message:
          'insert or update on table "mistake_logs" violates foreign key constraint "mistake_logs_practice_question_fk"',
        code: '23503',
      },
    });

    await expect(repo.create('mistake_logs', mistake)).rejects.toMatchObject({
      code: 'foreign_key',
      message: expect.stringContaining('a linked record is missing or already deleted'),
    });
  });

  it('maps a duplicate to a plain "already exists" message', async () => {
    const repo = repository({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "user_subjects_curriculum_unique"', code: '23505' },
    });

    await expect(
      repo.create('user_subjects', { custom_name: null, status: 'active', color: '#000', sort_order: 1, is_demo: false } as NewRow<'user_subjects'>),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('keeps an unknown failure readable but does not swallow the provider code', async () => {
    const repo = repository({ data: null, error: { message: 'upstream timeout', code: '57014' } });
    await expect(repo.list('notes')).rejects.toMatchObject({
      code: '57014',
      message: 'Loading notes: upstream timeout',
    });
  });
});
