/**
 * Practice questions and attempts.
 *
 * Accuracy is only reported when there is at least one graded attempt, and a
 * question is only "needs review" when the student said so or answered it
 * incorrectly. AI-generated questions are labelled as such everywhere.
 */
import type { PracticeAttempt, PracticeDifficulty, PracticeQuestion, PracticeSource } from '@/types/domain';
import { safePercent } from '@/domain/progress';

export const PRACTICE_SOURCE_LABELS: Record<PracticeSource, string> = {
  user: 'Your question',
  imported: 'Imported question',
  ai: 'AI-generated practice (not official)',
};

export const PRACTICE_DIFFICULTY_LABELS: Record<PracticeDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export interface PracticeSummary {
  questions: number;
  archived: number;
  attemptedQuestions: number;
  attempts: number;
  gradedAttempts: number;
  correct: number;
  incorrect: number;
  accuracyPercent: number | null;
  needsReview: boolean;
  flaggedQuestions: number;
  unseenQuestions: number;
  aiGenerated: number;
  byDifficulty: { difficulty: PracticeDifficulty; label: string; attempts: number; accuracyPercent: number | null }[];
  lastAttemptAt: string | null;
}

export function summarizePractice(questions: PracticeQuestion[], attempts: PracticeAttempt[]): PracticeSummary {
  const active = questions.filter((q) => !q.is_archived);
  const activeIds = new Set(active.map((q) => q.id));
  const relevantAttempts = attempts.filter((a) => activeIds.has(a.practice_question_id));
  const graded = relevantAttempts.filter((a) => a.is_correct !== null);
  const correct = graded.filter((a) => a.is_correct === true).length;
  const attemptedQuestions = new Set(relevantAttempts.map((a) => a.practice_question_id)).size;
  const needsReview = relevantAttempts.some((a) => a.needs_review);
  const flaggedQuestions = new Set(
    relevantAttempts.filter((a) => a.needs_review || a.is_correct === false).map((a) => a.practice_question_id),
  ).size;
  const byDifficulty = (['easy', 'medium', 'hard'] as PracticeDifficulty[]).map((difficulty) => {
    const ids = new Set(active.filter((q) => q.difficulty === difficulty).map((q) => q.id));
    const gradedForDifficulty = graded.filter((a) => ids.has(a.practice_question_id));
    return {
      difficulty,
      label: PRACTICE_DIFFICULTY_LABELS[difficulty],
      attempts: gradedForDifficulty.length,
      accuracyPercent: safePercent(
        gradedForDifficulty.filter((a) => a.is_correct).length,
        gradedForDifficulty.length,
      ),
    };
  });
  const lastAttemptAt = relevantAttempts
    .map((a) => a.attempted_at)
    .sort()
    .at(-1) ?? null;
  return {
    questions: active.length,
    archived: questions.length - active.length,
    attemptedQuestions,
    attempts: relevantAttempts.length,
    gradedAttempts: graded.length,
    correct,
    incorrect: graded.length - correct,
    accuracyPercent: safePercent(correct, graded.length),
    needsReview,
    flaggedQuestions,
    unseenQuestions: active.length - attemptedQuestions,
    aiGenerated: active.filter((q) => q.source === 'ai').length,
    byDifficulty,
    lastAttemptAt,
  };
}

export interface ReviewCandidate {
  question: PracticeQuestion;
  reason: 'flagged' | 'incorrect' | 'unseen' | 'due';
  lastAttemptAt: string | null;
  attempts: number;
}

/**
 * Build a practice queue in a transparent order:
 * flagged → last answer wrong → never attempted → everything else.
 * No hidden spaced-repetition model and no invented "mastery" score.
 */
export function buildPracticeQueue(
  questions: PracticeQuestion[],
  attempts: PracticeAttempt[],
  limit = 10,
): ReviewCandidate[] {
  const active = questions.filter((q) => !q.is_archived);
  const byQuestion = new Map<string, PracticeAttempt[]>();
  for (const attempt of attempts) {
    const list = byQuestion.get(attempt.practice_question_id) ?? [];
    list.push(attempt);
    byQuestion.set(attempt.practice_question_id, list);
  }
  const described: ReviewCandidate[] = active.map((question) => {
    const list = (byQuestion.get(question.id) ?? []).sort((a, b) => (a.attempted_at < b.attempted_at ? 1 : -1));
    const latest = list[0];
    const reason: ReviewCandidate['reason'] = latest?.needs_review
      ? 'flagged'
      : latest?.is_correct === false
        ? 'incorrect'
        : list.length === 0
          ? 'unseen'
          : 'due';
    return { question, reason, lastAttemptAt: latest?.attempted_at ?? null, attempts: list.length };
  });
  const order: Record<ReviewCandidate['reason'], number> = { flagged: 0, incorrect: 1, unseen: 2, due: 3 };
  return described
    .sort(
      (a, b) =>
        order[a.reason] - order[b.reason] ||
        (a.lastAttemptAt ?? '').localeCompare(b.lastAttemptAt ?? '') ||
        a.question.created_at.localeCompare(b.question.created_at),
    )
    .slice(0, limit);
}

export function accuracyForQuestion(attempts: PracticeAttempt[], questionId: string): number | null {
  const graded = attempts.filter((a) => a.practice_question_id === questionId && a.is_correct !== null);
  return safePercent(graded.filter((a) => a.is_correct).length, graded.length);
}

/** AI-generated questions must never look official. */
export function sourceNotice(question: Pick<PracticeQuestion, 'source'>): string | null {
  if (question.source === 'ai') {
    return 'AI-generated practice question. Not an official board, coaching or admission question.';
  }
  if (question.source === 'imported') {
    return 'Imported question from a file you supplied. Accuracy is your responsibility.';
  }
  return null;
}
