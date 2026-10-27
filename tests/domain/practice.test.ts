import { describe, expect, it } from 'vitest';
import {
  accuracyForQuestion,
  buildPracticeQueue,
  sourceNotice,
  summarizePractice,
} from '@/domain/practice';
import { day, makeAttempt, makeQuestion, TODAY } from '../fixtures/factories';

describe('practice summary', () => {
  it('reports no accuracy until something is graded', () => {
    const summary = summarizePractice([makeQuestion()], []);
    expect(summary).toMatchObject({
      questions: 1,
      attempts: 0,
      gradedAttempts: 0,
      accuracyPercent: null,
      unseenQuestions: 1,
      needsReview: false,
    });
  });

  it('computes accuracy from graded attempts only', () => {
    const question = makeQuestion({ id: 'q1' });
    const summary = summarizePractice(
      [question],
      [
        makeAttempt({ practice_question_id: 'q1', is_correct: true }),
        makeAttempt({ practice_question_id: 'q1', is_correct: false }),
        makeAttempt({ practice_question_id: 'q1', is_correct: true }),
      ],
    );
    expect(summary).toMatchObject({ attempts: 3, gradedAttempts: 3, correct: 2, incorrect: 1, accuracyPercent: 67 });
  });

  it('ignores archived questions and their attempts', () => {
    const summary = summarizePractice(
      [makeQuestion({ id: 'q1', is_archived: true }), makeQuestion({ id: 'q2' })],
      [makeAttempt({ practice_question_id: 'q1', is_correct: false, needs_review: true })],
    );
    expect(summary).toMatchObject({ questions: 1, archived: 1, attempts: 0, flaggedQuestions: 0 });
    expect(summary.needsReview).toBe(false);
  });

  it('separates AI-generated questions from your own', () => {
    const summary = summarizePractice([makeQuestion({ source: 'ai' }), makeQuestion({ source: 'user' })], []);
    expect(summary.aiGenerated).toBe(1);
  });

  it('breaks accuracy down by difficulty', () => {
    const summary = summarizePractice(
      [makeQuestion({ id: 'q1', difficulty: 'hard' }), makeQuestion({ id: 'q2', difficulty: 'easy' })],
      [
        makeAttempt({ practice_question_id: 'q1', is_correct: false }),
        makeAttempt({ practice_question_id: 'q2', is_correct: true }),
      ],
    );
    expect(summary.byDifficulty.find((row) => row.difficulty === 'hard')).toMatchObject({ attempts: 1, accuracyPercent: 0 });
    expect(summary.byDifficulty.find((row) => row.difficulty === 'easy')).toMatchObject({ attempts: 1, accuracyPercent: 100 });
    expect(summary.byDifficulty.find((row) => row.difficulty === 'medium')).toMatchObject({ attempts: 0, accuracyPercent: null });
  });
});

describe('practice queue', () => {
  it('orders flagged, then wrong, then unseen, then the rest', () => {
    const questions = [
      makeQuestion({ id: 'unseen' }),
      makeQuestion({ id: 'wrong' }),
      makeQuestion({ id: 'flagged' }),
      makeQuestion({ id: 'right' }),
    ];
    const attempts = [
      makeAttempt({ practice_question_id: 'flagged', needs_review: true, is_correct: true }),
      makeAttempt({ practice_question_id: 'wrong', is_correct: false }),
      makeAttempt({ practice_question_id: 'right', is_correct: true }),
    ];
    const queue = buildPracticeQueue(questions, attempts);
    expect(queue.map((item) => item.question.id)).toEqual(['flagged', 'wrong', 'unseen', 'right']);
  });

  it('handles a question id typo safely', () => {
    const queue = buildPracticeQueue(
      [makeQuestion({ id: 'q1' })],
      [makeAttempt({ practice_question_id: 'missing', is_correct: false })],
    );
    expect(queue[0]?.reason).toBe('unseen');
  });

  it('caps the queue', () => {
    const questions = Array.from({ length: 20 }, (_, index) => makeQuestion({ id: `q${index}` }));
    expect(buildPracticeQueue(questions, [], 5)).toHaveLength(5);
  });

  it('uses the latest attempt to decide the reason', () => {
    const question = makeQuestion({ id: 'q1' });
    const queue = buildPracticeQueue(
      [question],
      [
        makeAttempt({ practice_question_id: 'q1', is_correct: false, attempted_at: `${day(-5)}T10:00:00.000Z` }),
        makeAttempt({ practice_question_id: 'q1', is_correct: true, attempted_at: `${TODAY}T10:00:00.000Z` }),
      ],
    );
    expect(queue[0]?.reason).toBe('due');
  });
});

describe('labels', () => {
  it('never lets an AI question look official', () => {
    expect(sourceNotice({ source: 'ai' })).toContain('Not an official');
    expect(sourceNotice({ source: 'imported' })).toContain('Accuracy is your responsibility');
    expect(sourceNotice({ source: 'user' })).toBeNull();
  });

  it('computes per-question accuracy', () => {
    const attempts = [
      makeAttempt({ practice_question_id: 'q1', is_correct: true }),
      makeAttempt({ practice_question_id: 'q1', is_correct: false }),
      makeAttempt({ practice_question_id: 'q2', is_correct: true }),
    ];
    expect(accuracyForQuestion(attempts, 'q1')).toBe(50);
    expect(accuracyForQuestion(attempts, 'q2')).toBe(100);
    expect(accuracyForQuestion(attempts, 'q3')).toBeNull();
  });
});
