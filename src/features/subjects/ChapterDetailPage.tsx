import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, arrowBackOutline, refreshOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import {
  Badge,
  EmptyState,
  Notice,
  PageHeader,
  ProgressBar,
  SectionCard,
  StatusBadge,
} from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { checklistItemSchema, userChapterSchema, type ChapterFormValues } from '@/domain/schemas';
import { chapterStatusLabel } from '@/domain/progress';
import { formatDate } from '@/domain/dates';
import { CHECKLIST_KIND_LABELS } from '@/services/seed/checklistDefaults';
import { errorMessage } from '@/utils/errors';
import type { ChapterChecklistItem, ChecklistKind } from '@/types/domain';
import type { DateOnly } from '@/types/domain';

const STATUS_OPTIONS = [
  { value: 'not_recorded', label: 'Not recorded (let the app derive it)' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'needs_practice', label: 'Needs practice' },
  { value: 'needs_revision', label: 'Needs revision' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

const KIND_OPTIONS = Object.entries(CHECKLIST_KIND_LABELS).map(([value, label]) => ({ value, label }));

function ChapterContent() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  if (!data) return null;
  const { view, bundle } = data;
  const chapterView = chapterId ? view.chapterById.get(chapterId) : undefined;
  if (!chapterView) {
    return (
      <>
        <PageHeader title="Chapter not found" />
        <SectionCard>
          <EmptyState
            icon={<IonIcon icon={refreshOutline} aria-hidden="true" />}
            title="This chapter is missing"
            message="It may have been removed, or it belongs to another account. Nothing was inferred from the missing record."
            action={
              <Link to="/subjects" className="btn btn--primary btn--sm">
                Back to subjects
              </Link>
            }
          />
        </SectionCard>
      </>
    );
  }
  const subject = view.subjectById.get(chapterView.chapter.user_subject_id);
  const progress = chapterView.progress;
  const items = chapterView.checklist;

  const toggleItem = async (item: ChapterChecklistItem, checked: boolean) => {
    setSavingItem(item.id);
    try {
      await mutate((repo) => repo.setChecklistProgress(chapterView.chapter.id, item.id, checked));
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSavingItem(null);
    }
  };

  const resetChecklist = async () => {
    setResetting(true);
    try {
      await mutate(async (repo) => {
        for (const entry of items) {
          if (entry.progress?.is_done) {
            await repo.setChecklistProgress(chapterView.chapter.id, entry.item.id, false);
          }
        }
      });
      await notify('Checklist reset. Past lectures, sessions and revisions are unchanged.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setResetting(false);
    }
  };

  const saveChapter = async (values: ChapterFormValues) => {
    await mutate((repo) =>
      repo.update('user_chapters', chapterView.chapter.id, {
        custom_title: values.title,
        lecture_target_count: values.lecture_target_count ?? null,
        status: values.status,
      }),
    );
    setEditOpen(false);
    await notify('Chapter updated.');
  };

  const addChecklistItem = async (values: { user_chapter_id: string; kind: ChecklistKind; label: string }) => {
    await mutate((repo) =>
      repo.create('chapter_checklist_items', {
        user_chapter_id: chapterView.chapter.id,
        kind: values.kind,
        label: values.label,
        sort_order: items.length + 1,
        is_archived: false,
      }),
    );
    setAddItemOpen(false);
    await notify('Checklist item added.');
  };

  const archiveItem = async (item: ChapterChecklistItem) => {
    try {
      await mutate((repo) => repo.update('chapter_checklist_items', item.id, { is_archived: true }));
      await notify('Item archived. Its history stays in the database.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const deleteChapter = async () => {
    try {
      await mutate((repo) => repo.remove('user_chapters', chapterView.chapter.id));
      await notify('Chapter removed. Related records were kept and unlinked.', 'warning');
      navigate('/subjects');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const relatedLectures = bundle.lectures.filter((l) => l.user_chapter_id === chapterView.chapter.id);
  const relatedRevisions = bundle.revisions.filter((r) => r.user_chapter_id === chapterView.chapter.id);
  const relatedSessions = bundle.sessions.filter((s) => s.user_chapter_id === chapterView.chapter.id);
  const relatedDifficulties = bundle.difficulties.filter((d) => d.user_chapter_id === chapterView.chapter.id);

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <Link to="/subjects" className="btn btn--ghost btn--sm">
          <IonIcon icon={arrowBackOutline} aria-hidden="true" /> Subjects
        </Link>
      </div>
      <PageHeader
        title={chapterView.title}
        description={`${subject?.label ?? 'Subject'}${chapterView.number ? ` · chapter ${chapterView.number}` : ''} · ${
          progress.statusExplanation
        }`}
        actions={
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditOpen(true)}>
              Edit chapter
            </button>
            <ConfirmDeleteButton
              label="Delete chapter"
              header="Delete this chapter?"
              message="The chapter and its checklist are removed. Lectures, sessions, revisions, difficulties and results stay in your account but lose this chapter link."
              onConfirm={deleteChapter}
            />
          </>
        }
      />

      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <StatusBadge status={progress.status} />
        {progress.declaredStatus !== 'not_recorded' ? (
          <Badge tone="info">Your label: {chapterStatusLabel(progress.declaredStatus)}</Badge>
        ) : null}
        {progress.derivedStatus !== progress.status ? (
          <Badge tone="neutral">Derived: {chapterStatusLabel(progress.derivedStatus)}</Badge>
        ) : null}
        <Link to="/lectures" className="btn btn--primary btn--sm">
          <IonIcon icon={addOutline} aria-hidden="true" /> Log lecture
        </Link>
        <Link to="/revisions" className="btn btn--secondary btn--sm">
          Log revision
        </Link>
        <Link to="/sessions" className="btn btn--secondary btn--sm">
          Log session
        </Link>
      </div>

      <div className="grid grid--two">
        <SectionCard
          title="Chapter checklist"
          hint="Independent learning components. Ticking them is not mastery."
          action={
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAddItemOpen(true)}>
              Add item
            </button>
          }
        >
          <ProgressBar
            percent={progress.checklist.percent}
            done={progress.checklist.done}
            total={progress.checklist.total}
            label="Checklist completion"
          />
          <div className="checklist" style={{ marginTop: 8 }}>
            {items.length === 0 ? (
              <p className="small muted">No checklist items. Add one, or reset the chapter defaults.</p>
            ) : (
              items.map((entry) => (
                <label className="checklist-item" key={entry.item.id}>
                  <input
                    type="checkbox"
                    checked={entry.progress?.is_done ?? false}
                    onChange={(event) => void toggleItem(entry.item, event.target.checked)}
                    disabled={savingItem === entry.item.id}
                    aria-label={`${entry.item.label}${entry.progress?.is_done ? ', completed' : ''}`}
                  />
                  <span className={`checklist-item__label ${entry.progress?.is_done ? 'is-done' : ''}`}>
                    {entry.item.label}
                    {entry.progress?.completed_at ? (
                      <span className="tiny muted">
                        {' · '}done{' '}
                        {formatDate(entry.progress.completed_at.slice(0, 10) as DateOnly)}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="link-button tiny"
                    onClick={(event) => {
                      event.preventDefault();
                      void archiveItem(entry.item);
                    }}
                  >
                    Archive
                  </button>
                </label>
              ))
            )}
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void resetChecklist()} disabled={resetting || progress.checklist.done === 0}>
              {resetting ? 'Resetting…' : 'Reset checklist'}
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Evidence & status" hint="Why this chapter shows what it shows">
          <div className="stack">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              <div>
                <div className="eyebrow">Lectures</div>
                <div className="strong">
                  {progress.lectures.completed}
                  {progress.lectures.target !== null ? ` / ${progress.lectures.target}` : ' completed'}
                </div>
                <div className="tiny muted">{progress.lectures.label}</div>
              </div>
              <div>
                <div className="eyebrow">Revisions</div>
                <div className="strong">{progress.revisions.count} logged</div>
                <div className="tiny muted">
                  {progress.revisions.nextDate
                    ? `Next ${progress.revisions.nextDate} (${progress.revisions.nextDateSource})`
                    : 'No review date recorded'}
                </div>
              </div>
              <div>
                <div className="eyebrow">Open difficulties</div>
                <div className="strong">{progress.openDifficulties}</div>
                <div className="tiny muted">{progress.resolvedDifficulties} resolved</div>
              </div>
              <div>
                <div className="eyebrow">Practice sessions</div>
                <div className="strong">{progress.practiceSessions}</div>
                <div className="tiny muted">
                  {progress.lastPracticeDate ? `Last ${progress.lastPracticeDate}` : 'No practice recorded'}
                </div>
              </div>
              <div>
                <div className="eyebrow">Latest exam</div>
                <div className="strong">
                  {progress.exams.latestPercent !== null ? `${progress.exams.latestPercent}%` : 'Not recorded'}
                </div>
                <div className="tiny muted">
                  {progress.exams.count} result(s) · average {progress.exams.averagePercent ?? '—'}%
                </div>
              </div>
              <div>
                <div className="eyebrow">Last activity</div>
                <div className="strong">{progress.lastActivityDate ?? 'Not recorded'}</div>
                <div className="tiny muted">Not proof of inactivity</div>
              </div>
            </div>

            <div className="divider" />
            <h3>Why this is flagged</h3>
            {progress.flags.length === 0 ? (
              <p className="small muted">No gap is supported by your recorded data for this chapter.</p>
            ) : (
              <div className="stack stack--tight">
                {progress.flags.map((flag) => (
                  <div className="notice notice--neutral" key={flag.code}>
                    <div>
                      <strong>
                        {flag.label}{' '}
                        <Badge tone={flag.severity === 'high' ? 'danger' : flag.severity === 'attention' ? 'warn' : 'neutral'}>
                          {flag.kind === 'missing_data' ? 'missing data' : 'evidence'}
                        </Badge>
                      </strong>
                      <div className="small">{flag.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Notice tone="neutral">
              Checklist completion, recorded activity and performance are three separate numbers here. None of
              them claims mastery on its own.
            </Notice>
          </div>
        </SectionCard>
      </div>

      <div style={{ height: 16 }} />

      <div className="grid grid--two">
        <SectionCard
          title="Lectures for this chapter"
          hint={`${relatedLectures.length} record(s)`}
          action={
            <Link to="/lectures" className="btn btn--ghost btn--sm">
              Open log
            </Link>
          }
        >
          {relatedLectures.length === 0 ? (
            <p className="small muted">No lectures recorded for this chapter.</p>
          ) : (
            <div className="list">
              {relatedLectures.slice(0, 6).map((lecture) => (
                <div className="list-row" key={lecture.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">{lecture.title}</div>
                    <div className="list-row__meta">
                      <span>{lecture.lecture_date}</span>
                      <span>{lecture.source}</span>
                      {lecture.duration_minutes ? <span>{lecture.duration_minutes} min</span> : null}
                    </div>
                  </div>
                  <Badge tone={lecture.is_completed ? 'good' : 'warn'}>
                    {lecture.is_completed ? 'Completed' : 'Not finished'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Revisions & difficulties" hint="Recorded review evidence">
          <div className="stack">
            {relatedRevisions.slice(0, 3).map((revision) => (
              <div className="list-row" key={revision.id}>
                <div className="list-row__main">
                  <div className="list-row__title">{revision.revised_at} · {revision.method}</div>
                  <div className="list-row__meta">
                    <span>confidence {revision.confidence_rating}/5</span>
                    {revision.next_review_date ? <span>next {revision.next_review_date}</span> : null}
                  </div>
                </div>
              </div>
            ))}
            {relatedSessions.length > 0 ? (
              <p className="tiny muted">{relatedSessions.length} study session(s) linked to this chapter.</p>
            ) : null}
            {relatedDifficulties.length > 0 ? (
              relatedDifficulties.map((difficulty) => (
                <div className="list-row" key={difficulty.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">{difficulty.topic_name}</div>
                    <div className="list-row__meta">
                      <span>{difficulty.severity} severity</span>
                      <span>{difficulty.status}</span>
                    </div>
                  </div>
                  <Badge tone={difficulty.status === 'resolved' ? 'good' : difficulty.severity === 'high' ? 'danger' : 'warn'}>
                    {difficulty.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="small muted">No difficult topics logged for this chapter.</p>
            )}
          </div>
        </SectionCard>
      </div>

      {editOpen ? (
        <RecordDialog<ChapterFormValues>
          title="Edit chapter"
          schema={userChapterSchema}
          defaultValues={{
            user_subject_id: chapterView.chapter.user_subject_id,
            title: chapterView.title,
            chapter_number: chapterView.number ?? '',
            lecture_target_count: chapterView.chapter.lecture_target_count ?? '',
            status: chapterView.chapter.status,
          }}
          submitLabel="Save chapter"
          fields={[
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            { name: 'title', label: 'Chapter title', type: 'text' },
            { name: 'chapter_number', label: 'Chapter number', type: 'text', optional: true },
            {
              name: 'lecture_target_count',
              label: 'Lecture target',
              type: 'number',
              optional: true,
              help: 'Only set this if you know the real number. Clear it to hide lecture percentage.',
            },
            { name: 'status', label: 'Your label', type: 'select', options: STATUS_OPTIONS },
          ]}
          onSubmit={saveChapter}
          onClose={() => setEditOpen(false)}
        />
      ) : null}

      {addItemOpen ? (
        <RecordDialog<{ user_chapter_id: string; kind: ChecklistKind; label: string }>
          title="Add checklist item"
          schema={checklistItemSchema}
          defaultValues={{ user_chapter_id: chapterView.chapter.id, kind: 'custom', label: '' }}
          submitLabel="Add item"
          fields={[
            { name: 'kind', label: 'Type', type: 'select', options: KIND_OPTIONS },
            { name: 'label', label: 'Label', type: 'text', placeholder: 'e.g. Solve 10 past-paper MCQs' },
          ]}
          onSubmit={addChecklistItem}
          onClose={() => setAddItemOpen(false)}
        />
      ) : null}
    </>
  );
}

export function ChapterDetailPage() {
  return <WorkspaceGate>{() => <ChapterContent />}</WorkspaceGate>;
}
