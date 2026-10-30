import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, informationCircleOutline, refreshOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { revisionSchema, type RevisionValues } from '@/domain/schemas';
import { suggestNextReviewDate } from '@/domain/progress';
import { CONFIDENCE_LABELS, REVISION_METHOD_LABELS } from '@/domain/revisions';
import { addDaysISO } from '@/domain/dates';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { RevisionSession } from '@/types/domain';
import { REVISION_METHODS } from '@/types/domain';

const METHOD_OPTIONS = REVISION_METHODS.map((value) => ({ value, label: REVISION_METHOD_LABELS[value] ?? value }));
const CONFIDENCE_OPTIONS = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} — ${CONFIDENCE_LABELS[value]}` }));

function RevisionsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevisionSession | null>(null);

  if (!data) return null;
  const { view, scoped: bundle } = data;
  const queue = view.revisionQueue;
  const dueNow = queue.filter((q) => q.bucket === 'overdue' || q.bucket === 'today');
  const upcoming = queue.filter((q) => q.bucket === 'this_week');
  const later = queue.filter((q) => q.bucket === 'later');
  const history = [...bundle.revisions].sort((a, b) => (a.revised_at < b.revised_at ? 1 : -1));

  const saveRevision = async (values: RevisionValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    const nextReview =
      values.next_review_date ?? suggestNextReviewDate(values.revised_at, values.confidence_rating);
    if (editing) {
      await mutate((repo) =>
        repo.update('revision_sessions', editing.id, {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          revised_at: values.revised_at,
          method: values.method,
          confidence_rating: values.confidence_rating,
          questions_attempted: values.questions_attempted,
          questions_correct: values.questions_correct,
          next_review_date: nextReview,
          notes: emptyToNull(values.notes),
        }),
      );
      await notify('Revision updated.');
    } else {
      await mutate((repo) =>
        repo.create('revision_sessions', {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          revised_at: values.revised_at,
          method: values.method,
          confidence_rating: values.confidence_rating,
          questions_attempted: values.questions_attempted,
          questions_correct: values.questions_correct,
          next_review_date: nextReview,
          notes: emptyToNull(values.notes),
          is_demo: false,
        }),
      );
      await notify(`Revision logged. Next review suggested for ${nextReview}.`);
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const deleteRevision = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('revision_sessions', id));
      await notify('Revision deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const dueBadge = (bucket: string, daysUntil: number) => {
    if (bucket === 'overdue') return <Badge tone="danger">{Math.abs(daysUntil)} day(s) overdue</Badge>;
    if (bucket === 'today') return <Badge tone="warn">Due today</Badge>;
    if (bucket === 'this_week') return <Badge tone="info">Due in {daysUntil} day(s)</Badge>;
    return <Badge tone="neutral">Later</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Revision Planner"
        description="A transparent baseline schedule: confidence 1–2 → next day, 3 → 3 days, 4 → 7 days, 5 → 14 days. Your own dates always win."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> Log revision
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Revisions due now" value={dueNow.length} hint="Overdue or due today" />
        <StatCard label="Due this week" value={upcoming.length} hint="Next seven days" />
        <StatCard label="Revisions logged" value={history.length} hint="Recorded review evidence only" />
        <StatCard
          label="Average confidence"
          value={
            history.length > 0
              ? Math.round((history.reduce((sum, r) => sum + r.confidence_rating, 0) / history.length) * 10) / 10
              : '—'
          }
          hint="Your own recall rating, not a score"
        />
      </div>

      <div style={{ height: 16 }} />

      <Notice tone="neutral" icon={<IonIcon icon={informationCircleOutline} />} title="Logging a revision does not prove it worked.">
        The app shows recall confidence and question results separately. A revision counts as evidence that you
        reviewed something — not that you mastered it.
      </Notice>

      <div style={{ height: 16 }} />

      <div className="grid grid--two">
        <SectionCard title="Due now" hint="Sorted by the review date you recorded">
          {dueNow.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={refreshOutline} aria-hidden="true" />}
              title="Nothing is recorded as due"
              message="Chapters without a revision record are not listed as due — the app will not guess."
            />
          ) : (
            <div className="list">
              {dueNow.map((entry) => (
                <div className="list-row" key={entry.userChapterId}>
                  <div className="list-row__main">
                    <div className="list-row__title">
                      <Link to={`/chapters/${entry.userChapterId}`} style={{ color: 'inherit' }}>
                        {entry.chapterTitle}
                      </Link>
                    </div>
                    <div className="list-row__meta">
                      <span>{entry.subjectName}</span>
                      <span>next {entry.summary.nextDate}</span>
                      <span>confidence {entry.summary.lastConfidence}/5</span>
                      <span>{entry.summary.count} revision(s)</span>
                    </div>
                  </div>
                  {dueBadge(entry.bucket, entry.daysUntilDue)}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Coming up" hint="Due within the next seven days">
          {upcoming.length === 0 ? (
            <p className="small muted">No revision scheduled in the next seven days.</p>
          ) : (
            <div className="list">
              {upcoming.map((entry) => (
                <div className="list-row" key={entry.userChapterId}>
                  <div className="list-row__main">
                    <div className="list-row__title">{entry.chapterTitle}</div>
                    <div className="list-row__meta">
                      <span>{entry.subjectName}</span>
                      <span>{entry.summary.nextDate}</span>
                    </div>
                  </div>
                  {dueBadge(entry.bucket, entry.daysUntilDue)}
                </div>
              ))}
            </div>
          )}
          {later.length > 0 ? (
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {later.length} chapter(s) have review dates further out.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <div style={{ height: 16 }} />

      <SectionCard title="Revision history" hint={`${history.length} record(s)`}>
        {history.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={refreshOutline} aria-hidden="true" />}
            title="No revisions recorded"
            message="Log your first revision. Use active recall where possible, and rate how easily you recalled it."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
                Log a revision
              </button>
            }
          />
        ) : (
          <div className="list">
            {history.map((revision) => {
              const subject = view.subjectById.get(revision.user_subject_id);
              const chapter = revision.user_chapter_id ? view.chapterById.get(revision.user_chapter_id) : null;
              return (
                <div className="list-row" key={revision.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {chapter?.title ?? 'Chapter not linked'} · {REVISION_METHOD_LABELS[revision.method] ?? revision.method}
                    </div>
                    <div className="list-row__meta">
                      <span>{revision.revised_at}</span>
                      <span>{subject?.label ?? 'Subject removed'}</span>
                      <span>confidence {revision.confidence_rating}/5</span>
                      {revision.questions_attempted !== null ? (
                        <span>
                          {revision.questions_correct ?? 0}/{revision.questions_attempted} questions
                        </span>
                      ) : null}
                      <span>next {revision.next_review_date ?? 'not set'}</span>
                    </div>
                    {revision.notes ? <p className="tiny muted">{revision.notes}</p> : null}
                  </div>
                  <div className="list-row__actions">
                    {revision.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setEditing(revision);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => deleteRevision(revision.id)} label="Delete" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {dialogOpen ? (
        <RecordDialog<RevisionValues>
          title={editing ? 'Edit revision' : 'Log a revision'}
          description="Leave “next review” empty to use the transparent baseline schedule from your confidence rating."
          schema={revisionSchema}
          defaultValues={{
            user_subject_id: editing?.user_subject_id ?? view.subjects[0]?.subject.id ?? '',
            user_chapter_id: editing?.user_chapter_id ?? '',
            revised_at: editing?.revised_at ?? view.today,
            method: editing?.method ?? 'recall',
            confidence_rating: editing?.confidence_rating ?? 3,
            questions_attempted: editing?.questions_attempted ?? '',
            questions_correct: editing?.questions_correct ?? '',
            next_review_date: editing?.next_review_date ?? '',
            notes: editing?.notes ?? '',
          }}
          submitLabel={editing ? 'Save changes' : 'Log revision'}
          fields={[
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              placeholder: 'No chapter',
              options: (values) => {
                const subject = view.subjectById.get(String(values['user_subject_id'] ?? ''));
                return (subject?.chapters ?? []).map((c) => ({ value: c.chapter.id, label: c.title }));
              },
            },
            { name: 'revised_at', label: 'Revision date', type: 'date' },
            { name: 'method', label: 'Method', type: 'select', options: METHOD_OPTIONS },
            {
              name: 'confidence_rating',
              label: 'How easily did you recall it?',
              type: 'select',
              options: CONFIDENCE_OPTIONS,
              help: 'This drives the suggested next review date. It is not an exam score.',
            },
            { name: 'questions_attempted', label: 'Questions attempted', type: 'number', optional: true, inputMode: 'numeric' },
            { name: 'questions_correct', label: 'Questions correct', type: 'number', optional: true, inputMode: 'numeric' },
            {
              name: 'next_review_date',
              label: 'Next review date',
              type: 'date',
              optional: true,
              help: `Suggested: ${suggestNextReviewDate(addDaysISO(view.today, 0), 3)} for confidence 3. Leave blank to use the suggestion.`,
            },
            { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, optional: true },
          ]}
          onSubmit={saveRevision}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

export function RevisionsPage() {
  return <WorkspaceGate>{() => <RevisionsContent />}</WorkspaceGate>;
}
