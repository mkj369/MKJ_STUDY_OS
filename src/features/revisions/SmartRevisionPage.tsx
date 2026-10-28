import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, FilterBar, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { revisionSchema, type RevisionValues } from '@/domain/schemas';
import { suggestNextReviewDate } from '@/domain/progress';
import { buildRevisionQueue } from '@/domain/revisions';
import { CONFIDENCE_LABELS, REVISION_METHOD_LABELS } from '@/domain/revisions';
import { REVISION_METHODS, type RevisionSession } from '@/types/domain';
import { formatDate } from '@/domain/dates';
import { errorMessage } from '@/utils/errors';

const METHOD_OPTIONS = REVISION_METHODS.map((method) => ({
  value: method,
  label: REVISION_METHOD_LABELS[method] ?? method,
}));

type Bucket = 'overdue' | 'today' | 'this_week' | 'later';

const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  this_week: 'Due this week',
  later: 'Later',
};

function SmartRevisionContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [bucket, setBucket] = useState<Bucket | 'all'>('all');
  const [dialog, setDialog] = useState<{ editing: RevisionSession | null; chapterId?: string; subjectId?: string } | null>(null);

  const revisions = data?.bundle.revisions ?? [];
  const queue = useMemo(() => {
    if (!data) return [];
    return buildRevisionQueue(
      data.view.subjects.flatMap((subject) =>
        subject.chapters.map((chapter) => ({
          userChapterId: chapter.chapter.id,
          userSubjectId: subject.subject.id,
          chapterTitle: chapter.title,
          subjectName: subject.label,
          revisions: chapter.context.revisions,
        })),
      ),
      data.view.today,
    );
  }, [data]);

  if (!data) return null;
  const { bundle, view } = data;
  const today = view.today;
  const history = [...revisions].sort((a, b) => (a.revised_at < b.revised_at ? 1 : -1));
  const visible = bucket === 'all' ? queue : queue.filter((entry) => entry.bucket === bucket);
  const dueToday = queue.filter((entry) => entry.bucket === 'overdue' || entry.bucket === 'today');
  const difficult = [
    ...bundle.difficulties
      .filter((difficulty) => difficulty.status !== 'resolved')
      .map((difficulty) => ({
        key: `difficulty-${difficulty.id}`,
        title: difficulty.topic_name,
        reason: difficulty.reason ?? 'Logged as difficult.',
        chapterId: difficulty.user_chapter_id,
        severity: difficulty.severity,
      })),
    ...bundle.topics
      .filter((topic) => topic.status === 'needs_revision')
      .map((topic) => ({
        key: `topic-${topic.id}`,
        title: topic.custom_title ?? 'Topic marked for revision',
        reason: 'Topic status: needs revision.',
        chapterId: topic.user_chapter_id,
        severity: 'medium' as const,
      })),
  ];

  const chapterOptionsFor = (subjectId: string) =>
    view.subjects.find((subject) => subject.subject.id === subjectId)?.chapters.map((chapter) => ({
      value: chapter.chapter.id,
      label: chapter.title,
    })) ?? [];

  const saveRevision = async (values: RevisionValues) => {
    const chapterId = values.user_chapter_id || null;
    const nextReview = values.next_review_date ?? suggestNextReviewDate(values.revised_at, values.confidence_rating);
    const payload = {
      user_subject_id: values.user_subject_id,
      user_chapter_id: chapterId,
      revised_at: values.revised_at,
      method: values.method,
      confidence_rating: values.confidence_rating,
      questions_attempted: values.questions_attempted,
      questions_correct: values.questions_correct,
      next_review_date: nextReview,
      notes: values.notes ? values.notes : null,
    };
    if (dialog?.editing) {
      await mutate((repo) => repo.update('revision_sessions', dialog.editing!.id, payload));
      await notify('Revision updated.');
    } else {
      await mutate((repo) => repo.create('revision_sessions', { ...payload, is_demo: false }));
      await notify(`Revision logged. Next review suggested for ${nextReview}.`);
    }
    setDialog(null);
  };

  const removeRevision = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('revision_sessions', id));
      await notify('Revision removed.', 'medium');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Smart revision"
        description="A transparent spacing baseline: your recall rating sets the next review date. A revision count is a count of revisions, never a mastery score."
      />

      <div className="grid grid--stats">
        <StatCard label="Revisions logged" value={revisions.length} hint="Across every chapter" />
        <StatCard
          label="Due today or overdue"
          value={dueToday.length}
          hint={dueToday.length === 0 ? 'Nothing due from your records' : 'Chapters with a recorded next review date'}
        />
        <StatCard
          label="Chapters with a review date"
          value={queue.length}
          hint={`${view.totals.chapters} chapter(s) tracked`}
        />
        <StatCard label="Needs revision" value={difficult.length} hint="Difficulties and topics you flagged" />
      </div>

      <SectionCard
        title="Revision due today"
        hint="Only chapters with a recorded next review date appear here. A chapter with no revision is not overdue."
      >
        <FilterBar label="Filter revisions by bucket">
          {(['all', 'overdue', 'today', 'this_week', 'later'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn btn--sm ${bucket === value ? 'btn--primary' : 'btn--ghost'}`}
              aria-pressed={bucket === value}
              onClick={() => setBucket(value)}
            >
              {value === 'all' ? 'All' : BUCKET_LABELS[value]}
            </button>
          ))}
        </FilterBar>
        {visible.length === 0 ? (
          <EmptyState
            title="Nothing in this bucket"
            message="Log a revision from any chapter and a next review date is suggested from your confidence rating."
          />
        ) : (
          <ul className="list">
            {visible.map((entry) => {
              const subject = view.subjectById.get(entry.userSubjectId);
              return (
                <li key={entry.userChapterId} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {entry.chapterTitle}{' '}
                      <Badge tone={entry.bucket === 'overdue' ? 'danger' : entry.bucket === 'today' ? 'warn' : 'neutral'}>
                        {BUCKET_LABELS[entry.bucket]}
                      </Badge>
                    </div>
                    <div className="list-row__meta">
                      <span>{entry.subjectName}</span>
                      <span>{entry.summary.count} revision(s)</span>
                      <span>last {entry.summary.lastDate ? formatDate(entry.summary.lastDate) : 'not recorded'}</span>
                      <span>
                        next {entry.summary.nextDate ? formatDate(entry.summary.nextDate) : 'not set'} (
                        {entry.summary.nextDateSource})
                      </span>
                      <span>
                        confidence {entry.summary.lastConfidence ?? '—'}/5
                        {entry.summary.lastConfidence ? ` · ${CONFIDENCE_LABELS[entry.summary.lastConfidence] ?? ''}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="list-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() =>
                        setDialog({
                          editing: null,
                          chapterId: entry.userChapterId,
                          subjectId: subject?.subject.id ?? entry.userSubjectId,
                        })
                      }
                    >
                      Log revision
                    </button>
                    {/* Was labelled just "Chapter"; two different labels for
                        the same destination inside one page read like different
                        features. The link is now named after what it opens. */}
                    <Link
                      to={`/chapters/${entry.userChapterId}`}
                      className="btn btn--ghost btn--sm"
                      aria-label={`Open chapter ${entry.chapterTitle}`}
                    >
                      Open chapter
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Notice tone="neutral">
          Spacing baseline: confidence 1–2 → review tomorrow, 3 → in 3 days, 4 → in 7 days, 5 → in 14 days. You can
          always override the date when you log a revision.
        </Notice>
      </SectionCard>

      <SectionCard title="Difficult topics" hint="Taken from your difficulty log and topics marked “needs revision”.">
        {difficult.length === 0 ? (
          <p className="small muted">Nothing is flagged. That is a record of no flags, not proof of mastery.</p>
        ) : (
          <ul className="list">
            {difficult.map((item) => (
              <li key={item.key} className="list-row">
                <div className="list-row__main">
                  <div className="list-row__title">{item.title}</div>
                  <div className="list-row__meta">
                    <span>{item.reason}</span>
                    {item.chapterId ? <span>{view.phase2.chapterTitles[item.chapterId] ?? 'Chapter not in your workspace'}</span> : null}
                    <Badge tone={item.severity === 'high' ? 'danger' : item.severity === 'low' ? 'neutral' : 'warn'}>
                      {item.severity}
                    </Badge>
                  </div>
                </div>
                <div className="list-row__actions">
                  {item.chapterId ? (
                    <Link to={`/chapters/${item.chapterId}`} className="btn btn--secondary btn--sm">
                      Open chapter
                    </Link>
                  ) : null}
                  <Link to="/difficulties" className="btn btn--ghost btn--sm">
                    Difficulty log
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Revision history"
        hint="Every record, newest first, with recall results where you entered them."
        action={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ editing: null })}>
            Log revision
          </button>
        }
      >
        {history.length === 0 ? (
          <p className="small muted">No revisions recorded yet.</p>
        ) : (
          <ul className="list">
            {history.slice(0, 30).map((revision) => {
              const attempted = revision.questions_attempted;
              const correct = revision.questions_correct;
              return (
                <li key={revision.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {revision.user_chapter_id
                        ? view.phase2.chapterTitles[revision.user_chapter_id] ?? 'Chapter'
                        : 'Subject revision'}{' '}
                      <Badge tone="info">{REVISION_METHOD_LABELS[revision.method] ?? revision.method}</Badge>
                    </div>
                    <div className="list-row__meta">
                      <span>{formatDate(revision.revised_at)}</span>
                      <span>confidence {revision.confidence_rating}/5</span>
                      {attempted !== null ? <span>{correct ?? 0}/{attempted} correct</span> : <span>no recall test recorded</span>}
                      <span>next {revision.next_review_date ? formatDate(revision.next_review_date) : 'not set'}</span>
                      {revision.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    </div>
                    {revision.notes ? <p className="tiny muted">{revision.notes}</p> : null}
                  </div>
                  <div className="list-row__actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setDialog({ editing: revision })}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton
                      label="Delete"
                      header="Delete this revision?"
                      message="The revision record is removed. Your study sessions stay."
                      onConfirm={() => removeRevision(revision.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="tiny muted">
          Revision count is not mastery. The app keeps the count, the recall rating and any test result separate so one
          number is never presented as the whole picture.
        </p>
      </SectionCard>

      {dialog ? (
        <RecordDialog<RevisionValues>
          title={dialog.editing ? 'Edit revision' : 'Log a revision'}
          description="Your recall rating sets a suggested next date; you can override it below."
          fields={[
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              options: view.subjects.map((subject) => ({ value: subject.subject.id, label: subject.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              options: (values) => (values.user_subject_id ? chapterOptionsFor(String(values.user_subject_id)) : []),
            },
            { name: 'revised_at', label: 'Revision date', type: 'date' },
            { name: 'method', label: 'Method', type: 'select', options: METHOD_OPTIONS },
            {
              name: 'confidence_rating',
              label: 'How well could you recall it?',
              type: 'select',
              options: [1, 2, 3, 4, 5].map((value) => ({
                value: String(value),
                label: `${value} — ${CONFIDENCE_LABELS[value]}`,
              })),
            },
            { name: 'questions_attempted', label: 'Questions attempted', type: 'number', optional: true, min: 0 },
            { name: 'questions_correct', label: 'Questions correct', type: 'number', optional: true, min: 0 },
            {
              name: 'next_review_date',
              label: 'Next review date',
              type: 'date',
              optional: true,
              help: 'Leave blank to use the suggested date from your recall rating.',
            },
            { name: 'notes', label: 'Notes', type: 'textarea', optional: true, rows: 3 },
          ]}
          schema={revisionSchema}
          defaultValues={{
            user_subject_id:
              dialog.editing?.user_subject_id ?? dialog.subjectId ?? view.subjects[0]?.subject.id ?? '',
            user_chapter_id: dialog.editing?.user_chapter_id ?? dialog.chapterId ?? '',
            revised_at: dialog.editing?.revised_at ?? today,
            method: dialog.editing?.method ?? 'recall',
            confidence_rating: dialog.editing?.confidence_rating ?? 3,
            questions_attempted: dialog.editing?.questions_attempted ?? '',
            questions_correct: dialog.editing?.questions_correct ?? '',
            next_review_date: dialog.editing?.next_review_date ?? '',
            notes: dialog.editing?.notes ?? '',
          }}
          submitLabel={dialog.editing ? 'Save revision' : 'Log revision'}
          onSubmit={saveRevision}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

export function SmartRevisionPage() {
  return <WorkspaceGate>{() => <SmartRevisionContent />}</WorkspaceGate>;
}
