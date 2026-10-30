import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, EmptyState, FilterBar, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import {
  PRACTICE_DIFFICULTY_LABELS,
  PRACTICE_SOURCE_LABELS,
  accuracyForQuestion,
  buildPracticeQueue,
  sourceNotice,
  summarizePractice,
} from '@/domain/practice';
import { practiceAttemptSchema, practiceQuestionSchema, type PracticeAttemptValues, type PracticeQuestionValues } from '@/domain/schemas';
import { PRACTICE_DIFFICULTIES, PRACTICE_SOURCES, type PracticeQuestion } from '@/types/domain';
import { formatDate } from '@/domain/dates';
import { emptyToNull, errorMessage } from '@/utils/errors';

const DIFFICULTY_OPTIONS = PRACTICE_DIFFICULTIES.map((difficulty) => ({
  value: difficulty,
  label: PRACTICE_DIFFICULTY_LABELS[difficulty],
}));
const SOURCE_OPTIONS = PRACTICE_SOURCES.map((source) => ({ value: source, label: PRACTICE_SOURCE_LABELS[source] }));

function PracticeContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [questionDialog, setQuestionDialog] = useState<{ editing: PracticeQuestion | null } | null>(null);
  const [attemptDialog, setAttemptDialog] = useState<PracticeQuestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const openedFromLink = useRef<string | null>(null);

  const questionsSource = data?.bundle.practiceQuestions;
  const attemptsSource = data?.bundle.practiceAttempts;
  const questions = useMemo(() => questionsSource ?? [], [questionsSource]);
  const attempts = useMemo(() => attemptsSource ?? [], [attemptsSource]);
  const summary = useMemo(() => summarizePractice(questions, attempts), [questions, attempts]);
  const queue = useMemo(() => buildPracticeQueue(questions, attempts, 12), [questions, attempts]);

  const linkedQuestionId = searchParams.get('question');

  /**
   * Arriving from the mistake book (or any other screen) with `?question=<id>`
   * opens that question's attempt form once. The parameter is then removed, so a
   * reload or Back does not re-open the dialog unexpectedly.
   */
  useEffect(() => {
    if (!data || !linkedQuestionId || openedFromLink.current === linkedQuestionId) return;
    const target = data.bundle.practiceQuestions.find(
      (question) => question.id === linkedQuestionId && !question.is_archived,
    );
    openedFromLink.current = linkedQuestionId;
    if (target) setAttemptDialog(target);
    else notify('That practice question is no longer available.', 'warning');
    const next = new URLSearchParams(searchParams);
    next.delete('question');
    setSearchParams(next, { replace: true });
  }, [data, linkedQuestionId, notify, searchParams, setSearchParams]);

  if (!data) return null;
  const { scoped: bundle, view } = data;

  const chapterOptions = (subjectId: string) =>
    view.subjects.find((subject) => subject.subject.id === subjectId)?.chapters.map((chapter) => ({
      value: chapter.chapter.id,
      label: chapter.title,
    })) ?? [];

  const filtered = questions
    .filter((question) => !question.is_archived)
    .filter((question) => !subjectFilter || question.user_subject_id === subjectFilter)
    .filter((question) => !difficultyFilter || question.difficulty === difficultyFilter)
    .filter((question) => !sourceFilter || question.source === sourceFilter)
    .filter((question) => !onlyReview || queue.some((candidate) => candidate.question.id === question.id && candidate.reason !== 'due'))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const saveQuestion = async (values: PracticeQuestionValues) => {
    const chapterId = values.user_chapter_id || null;
    const payload = {
      question_text: values.question_text,
      answer_text: emptyToNull(values.answer_text),
      explanation: emptyToNull(values.explanation),
      source: values.source,
      difficulty: values.difficulty,
      user_subject_id: values.user_subject_id || null,
      user_chapter_id: chapterId,
      tags: values.tags,
      is_archived: questionDialog?.editing?.is_archived ?? false,
    };
    if (questionDialog?.editing) {
      await mutate((repo) => repo.update('practice_questions', questionDialog.editing!.id, payload));
      await notify('Question updated.');
    } else {
      await mutate((repo) => repo.create('practice_questions', { ...payload, is_demo: false }));
      await notify('Question added.');
    }
    setQuestionDialog(null);
  };

  const saveAttempt = async (values: PracticeAttemptValues) => {
    if (!attemptDialog) return;
    try {
      await mutate((repo) =>
        repo.create('practice_attempts', {
          practice_question_id: attemptDialog.id,
          answer_given: emptyToNull(values.answer_given),
          is_correct: values.is_correct,
          needs_review: values.needs_review,
          time_spent_minutes: values.time_spent_minutes,
          notes: emptyToNull(values.notes),
          attempted_at: new Date().toISOString(),
          is_demo: false,
        }),
      );
      await notify(values.is_correct ? 'Attempt saved: correct.' : 'Attempt saved. It stays in your review queue.');
      setAttemptDialog(null);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
      throw error;
    }
  };

  const toggleReview = async (question: PracticeQuestion, needsReview: boolean) => {
    const latest = attempts.find((attempt) => attempt.practice_question_id === question.id);
    setBusy(question.id);
    try {
      if (latest) {
        await mutate((repo) => repo.update('practice_attempts', latest.id, { needs_review: needsReview }));
      } else {
        await mutate((repo) =>
          repo.create('practice_attempts', {
            practice_question_id: question.id,
            attempted_at: new Date().toISOString(),
            answer_given: null,
            is_correct: null,
            needs_review: needsReview,
            time_spent_minutes: null,
            notes: 'Marked before attempting.',
            is_demo: false,
          }),
        );
      }
      await notify(needsReview ? 'Marked for review.' : 'Review flag cleared.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const archiveQuestion = async (question: PracticeQuestion, archived: boolean) => {
    try {
      await mutate((repo) => repo.update('practice_questions', question.id, { is_archived: archived }));
      await notify(archived ? 'Question archived.' : 'Question restored.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Question practice"
        description="Your own questions, imported ones from files you supplied, and AI-generated practice clearly labelled. Official board or admission questions are never invented."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setQuestionDialog({ editing: null })}>
            Add question
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Questions" value={summary.questions} hint={`${summary.unseenQuestions} never attempted`} />
        <StatCard label="Attempts" value={summary.attempts} hint={`${summary.gradedAttempts} graded`} />
        <StatCard
          label="Accuracy"
          value={summary.accuracyPercent === null ? 'Not recorded' : `${summary.accuracyPercent}%`}
          hint={summary.gradedAttempts === 0 ? 'Grade an attempt to see accuracy' : `${summary.correct}/${summary.gradedAttempts} correct`}
        />
        <StatCard label="Needs review" value={summary.flaggedQuestions} hint={`${summary.aiGenerated} AI-generated question(s)`} />
      </div>

      {summary.questions === 0 ? (
        <SectionCard title="Start your question bank" hint="Nothing is pre-filled: every question is yours, imported, or clearly labelled AI practice.">
          <EmptyState
            title="No question yet"
            message="Add your own question, or import a set from a file you trust. Accuracy stays “not recorded” until you grade an attempt."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setQuestionDialog({ editing: null })}>
                Add your first question
              </button>
            }
          />
        </SectionCard>
      ) : null}

      {summary.questions > 0 ? (
      <SectionCard title="Practice queue" hint="Flagged → answered incorrectly → never attempted → everything else.">
        {queue.length === 0 ? (
          <EmptyState
            title="Nothing queued right now"
            message="Every question has been attempted and none is flagged for review. Add a question or flag one to see it here."
          />
        ) : (
          <ul className="list">
            {queue.map((candidate) => {
              const notice = sourceNotice(candidate.question);
              return (
                <li key={candidate.question.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {candidate.question.question_text}{' '}
                      <Badge tone={candidate.reason === 'flagged' ? 'warn' : candidate.reason === 'incorrect' ? 'danger' : 'neutral'}>
                        {candidate.reason}
                      </Badge>
                    </div>
                    <div className="list-row__meta">
                      <span>{PRACTICE_DIFFICULTY_LABELS[candidate.question.difficulty]}</span>
                      <span>{PRACTICE_SOURCE_LABELS[candidate.question.source]}</span>
                      <span>
                        {candidate.question.user_chapter_id
                          ? view.phase2.chapterTitles[candidate.question.user_chapter_id] ?? 'Chapter'
                          : 'No chapter'}
                      </span>
                      <span>{candidate.attempts} attempt(s)</span>
                    </div>
                    {notice ? <p className="tiny muted">{notice}</p> : null}
                    <details>
                      <summary className="tiny muted">Show the stored answer</summary>
                      <p className="small">{candidate.question.answer_text ?? 'No answer stored.'}</p>
                      {candidate.question.explanation ? (
                        <p className="tiny muted">Explanation: {candidate.question.explanation}</p>
                      ) : null}
                    </details>
                  </div>
                  <div className="list-row__actions">
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setAttemptDialog(candidate.question)}>
                      Record attempt
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy === candidate.question.id}
                      onClick={() => void toggleReview(candidate.question, candidate.reason !== 'flagged')}
                    >
                      {candidate.reason === 'flagged' ? 'Clear flag' : 'Flag'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      ) : null}

      {summary.questions > 0 ? (
      <SectionCard
        title="All questions"
        hint="Search-free list of what you have; the filters narrow by subject, difficulty and origin."
      >
        <FilterBar>
            <select className="input input--inline" aria-label="Filter by subject" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="">All subjects</option>
              {view.subjects.map((subject) => (
                <option key={subject.subject.id} value={subject.subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
            <select className="input input--inline" aria-label="Filter by difficulty" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}>
              <option value="">Any difficulty</option>
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="input input--inline" aria-label="Filter by origin" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">Any origin</option>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="field field--checkbox">
              <input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} />
              <span>Needs review only</span>
            </label>
        </FilterBar>
        {filtered.length === 0 ? (
          <p className="small muted">No question matches these filters.</p>
        ) : (
          <ul className="list">
            {filtered.map((question) => {
              const accuracy = accuracyForQuestion(attempts, question.id);
              const related = attempts.filter((attempt) => attempt.practice_question_id === question.id);
              return (
                <li key={question.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">{question.question_text}</div>
                    <div className="list-row__meta">
                      <span>{PRACTICE_SOURCE_LABELS[question.source]}</span>
                      <span>{PRACTICE_DIFFICULTY_LABELS[question.difficulty]}</span>
                      <span>{related.length} attempt(s)</span>
                      <span>{accuracy === null ? 'accuracy not recorded' : `${accuracy}% correct`}</span>
                      {question.tags.length > 0 ? <span>tags: {question.tags.join(', ')}</span> : null}
                      {question.is_archived ? <Badge tone="neutral">Archived</Badge> : null}
                      {question.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    </div>
                    {sourceNotice(question) ? <p className="tiny muted">{sourceNotice(question)}</p> : null}
                    {related.length > 0 ? (
                      <p className="tiny muted">
                        Last attempt {formatDate(related[0]?.attempted_at.slice(0, 10) ?? view.today)} ·{' '}
                        {related[0]?.is_correct === true ? 'correct' : related[0]?.is_correct === false ? 'incorrect' : 'ungraded'}
                      </p>
                    ) : null}
                  </div>
                  <div className="list-row__actions">
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setAttemptDialog(question)}>
                      Attempt
                    </button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setQuestionDialog({ editing: question })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void archiveQuestion(question, !question.is_archived)}
                    >
                      {question.is_archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      ) : null}

      <SectionCard title="Accuracy by difficulty" hint="Only graded attempts are counted; ungraded attempts are ignored rather than assumed wrong.">
        {summary.gradedAttempts === 0 ? (
          <EmptyState
            title="No graded attempts yet"
            message="Three empty bars would suggest three zero scores. Until one attempt is graded, accuracy is simply not recorded."
          />
        ) : (
        <div className="bars">
          {summary.byDifficulty.map((row) => (
            <div key={row.difficulty} className="bar">
              <span>{row.label}</span>
              <div className="bar__track">
                <div className="bar__fill" style={{ width: `${row.accuracyPercent ?? 0}%` }} />
              </div>
              <span className="mono-num tiny">
                {row.accuracyPercent === null ? 'not recorded' : `${row.accuracyPercent}% · ${row.attempts} graded`}
              </span>
            </div>
          ))}
        </div>
        )}
        {bundle.practiceAttempts.some((attempt) => attempt.needs_review) ? (
          <Notice tone="warn" title="Flagged attempts">
            {summary.flaggedQuestions} question(s) are flagged or were answered incorrectly. They stay at the top of the
            queue until you clear them.
          </Notice>
        ) : null}
      </SectionCard>

      <Notice tone="neutral">
        A question you wrote, an imported question and an AI-generated question are all labelled. None of them is an
        official exam question unless you recorded a source that says so.
      </Notice>

      {questionDialog ? (
        <RecordDialog<PracticeQuestionValues>
          title={questionDialog.editing ? 'Edit question' : 'Add a practice question'}
          description="Write the question as you want to be tested. The stored answer is hidden behind a disclosure."
          fields={[
            { name: 'question_text', label: 'Question', type: 'textarea', rows: 3 },
            { name: 'answer_text', label: 'Expected answer', type: 'textarea', optional: true, rows: 3 },
            { name: 'explanation', label: 'Explanation', type: 'textarea', optional: true, rows: 2 },
            { name: 'source', label: 'Origin', type: 'select', options: SOURCE_OPTIONS, help: 'AI-generated questions are labelled everywhere they appear.' },
            { name: 'difficulty', label: 'Difficulty', type: 'select', options: DIFFICULTY_OPTIONS },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              options: view.subjects.map((subject) => ({ value: subject.subject.id, label: subject.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              options: (values) => (values.user_subject_id ? chapterOptions(String(values.user_subject_id)) : []),
            },
            { name: 'tags', label: 'Tags', type: 'text', optional: true, placeholder: 'comma separated, up to 10' },
          ]}
          schema={practiceQuestionSchema}
          defaultValues={{
            question_text: questionDialog.editing?.question_text ?? '',
            answer_text: questionDialog.editing?.answer_text ?? '',
            explanation: questionDialog.editing?.explanation ?? '',
            source: questionDialog.editing?.source ?? 'user',
            difficulty: questionDialog.editing?.difficulty ?? 'medium',
            user_subject_id: questionDialog.editing?.user_subject_id ?? '',
            user_chapter_id: questionDialog.editing?.user_chapter_id ?? '',
            tags: questionDialog.editing?.tags.join(', ') ?? '',
          }}
          submitLabel={questionDialog.editing ? 'Save question' : 'Add question'}
          onSubmit={saveQuestion}
          onClose={() => setQuestionDialog(null)}
        />
      ) : null}

      {attemptDialog ? (
        <RecordDialog<PracticeAttemptValues>
          title="Record an attempt"
          description={`${attemptDialog.question_text.slice(0, 160)}${sourceNotice(attemptDialog) ? ` — ${sourceNotice(attemptDialog)}` : ''}`}
          fields={[
            { name: 'answer_given', label: 'Your answer', type: 'textarea', optional: true, rows: 3 },
            { name: 'is_correct', label: 'Was it correct?', type: 'checkbox' },
            { name: 'needs_review', label: 'Flag for review', type: 'checkbox' },
            { name: 'time_spent_minutes', label: 'Time spent (minutes)', type: 'number', optional: true, min: 0, max: 600 },
            { name: 'notes', label: 'Notes', type: 'textarea', optional: true, rows: 2 },
          ]}
          schema={practiceAttemptSchema}
          defaultValues={{
            practice_question_id: attemptDialog.id,
            answer_given: '',
            is_correct: false,
            needs_review: false,
            time_spent_minutes: '',
            notes: '',
          }}
          submitLabel="Save attempt"
          onSubmit={saveAttempt}
          onClose={() => setAttemptDialog(null)}
        />
      ) : null}
    </>
  );
}

export function PracticePage() {
  return <WorkspaceGate>{() => <PracticeContent />}</WorkspaceGate>;
}
