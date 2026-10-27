import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, alertCircleOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { difficultySchema, type DifficultyValues } from '@/domain/schemas';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { DifficultySeverity, DifficultyStatus, TopicDifficulty } from '@/types/domain';

const SEVERITY_OPTIONS: { value: DifficultySeverity; label: string }[] = [
  { value: 'low', label: 'Low — annoying but not blocking' },
  { value: 'medium', label: 'Medium — needs focused work' },
  { value: 'high', label: 'High — blocking progress' },
];
const STATUS_OPTIONS: { value: DifficultyStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'working', label: 'Working on it' },
  { value: 'resolved', label: 'Resolved' },
];

function DifficultiesContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TopicDifficulty | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');

  if (!data) return null;
  const { view, bundle } = data;
  const all = [...bundle.difficulties].sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 } as const;
    const statusRank = { open: 2, working: 1, resolved: 0 } as const;
    return statusRank[b.status] - statusRank[a.status] || rank[b.severity] - rank[a.severity];
  });
  const filtered = all.filter((d) =>
    filter === 'all' ? true : filter === 'resolved' ? d.status === 'resolved' : d.status !== 'resolved',
  );
  const open = all.filter((d) => d.status !== 'resolved');

  const save = async (values: DifficultyValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    const resolvedAt = values.status === 'resolved' ? new Date().toISOString() : null;
    if (editing) {
      await mutate((repo) =>
        repo.update('topic_difficulties', editing.id, {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          topic_name: values.topic_name,
          reason: emptyToNull(values.reason),
          severity: values.severity,
          status: values.status,
          source_ref: emptyToNull(values.source_ref),
          attempted_solution: emptyToNull(values.attempted_solution),
          corrected_concept: emptyToNull(values.corrected_concept),
          follow_up_date: values.follow_up_date ?? null,
          resolved_at: values.status === 'resolved' ? editing.resolved_at ?? resolvedAt : null,
        }),
      );
      await notify('Difficult topic updated.');
    } else {
      await mutate((repo) =>
        repo.create('topic_difficulties', {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          topic_name: values.topic_name,
          reason: emptyToNull(values.reason),
          severity: values.severity,
          status: values.status,
          source_ref: emptyToNull(values.source_ref),
          attempted_solution: emptyToNull(values.attempted_solution),
          corrected_concept: emptyToNull(values.corrected_concept),
          follow_up_date: values.follow_up_date ?? null,
          resolved_at: resolvedAt,
          is_demo: false,
        }),
      );
      await notify('Difficult topic logged. It will appear in gap explanations.');
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const setStatus = async (difficulty: TopicDifficulty, status: DifficultyStatus) => {
    try {
      await mutate((repo) =>
        repo.update('topic_difficulties', difficulty.id, {
          status,
          resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        }),
      );
      await notify(
        status === 'resolved'
          ? 'Marked resolved. If it comes back, reopen it — that is useful information.'
          : `Marked ${status}.`,
      );
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const remove = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('topic_difficulties', id));
      await notify('Entry deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Difficult Topics"
        description="Name the exact thing that is hard, why, and what you tried. These entries are the strongest evidence the app has."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> Log difficulty
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Open" value={open.length} hint="Not yet resolved" />
        <StatCard label="High severity open" value={open.filter((d) => d.severity === 'high').length} hint="Drives the highest attention score" />
        <StatCard label="Resolved" value={all.filter((d) => d.status === 'resolved').length} hint="Kept for your history" />
        <StatCard label="With a follow-up date" value={all.filter((d) => d.follow_up_date).length} hint="You chose these dates" />
      </div>

      <div style={{ height: 16 }} />

      <div className="segmented" role="group" aria-label="Filter difficult topics">
        {[
          { value: 'open', label: 'Open & working' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'all', label: 'All' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value as typeof filter)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div style={{ height: 12 }} />

      <SectionCard title="Log" hint={`${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={alertCircleOutline} aria-hidden="true" />}
            title={filter === 'resolved' ? 'Nothing resolved yet' : 'No difficult topics logged'}
            message="When something is confusing, log it here instead of hoping it disappears. It becomes evidence for your next study plan."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
                Log a difficulty
              </button>
            }
          />
        ) : (
          <div className="list">
            {filtered.map((difficulty) => {
              const subject = view.subjectById.get(difficulty.user_subject_id);
              const chapter = difficulty.user_chapter_id ? view.chapterById.get(difficulty.user_chapter_id) : null;
              return (
                <div className="list-row" key={difficulty.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">{difficulty.topic_name}</div>
                    <div className="list-row__meta">
                      <span>{subject?.label ?? 'Subject removed'}</span>
                      {chapter ? <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link> : null}
                      <span>{difficulty.severity} severity</span>
                      <span>logged {difficulty.created_at.slice(0, 10)}</span>
                      {difficulty.follow_up_date ? <span>follow-up {difficulty.follow_up_date}</span> : null}
                    </div>
                    {difficulty.reason ? <p className="small">Why: {difficulty.reason}</p> : null}
                    {difficulty.attempted_solution ? (
                      <p className="tiny muted">Tried: {difficulty.attempted_solution}</p>
                    ) : null}
                    {difficulty.corrected_concept ? (
                      <p className="tiny">Corrected idea: {difficulty.corrected_concept}</p>
                    ) : null}
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <Badge tone={difficulty.status === 'resolved' ? 'good' : difficulty.severity === 'high' ? 'danger' : 'warn'}>
                        {difficulty.status}
                      </Badge>
                      {difficulty.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    </div>
                  </div>
                  <div className="list-row__actions" style={{ flexWrap: 'wrap' }}>
                    {difficulty.status !== 'resolved' ? (
                      <>
                        {difficulty.status !== 'working' ? (
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void setStatus(difficulty, 'working')}>
                            Working
                          </button>
                        ) : null}
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => void setStatus(difficulty, 'resolved')}>
                          Resolve
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => void setStatus(difficulty, 'open')}>
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setEditing(difficulty);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => remove(difficulty.id)} label="Delete" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 12 }} />
      <Notice tone="neutral">
        Resolving a difficulty records that you think it is fixed. If it returns, reopening it is not failure —
        it is a clearer picture of what needs practice.
      </Notice>

      {dialogOpen ? (
        <RecordDialog<DifficultyValues>
          title={editing ? 'Edit difficult topic' : 'Log a difficult topic'}
          schema={difficultySchema}
          defaultValues={{
            user_subject_id: editing?.user_subject_id ?? view.subjects[0]?.subject.id ?? '',
            user_chapter_id: editing?.user_chapter_id ?? '',
            topic_name: editing?.topic_name ?? '',
            reason: editing?.reason ?? '',
            severity: editing?.severity ?? 'medium',
            status: editing?.status ?? 'open',
            source_ref: editing?.source_ref ?? '',
            attempted_solution: editing?.attempted_solution ?? '',
            corrected_concept: editing?.corrected_concept ?? '',
            follow_up_date: editing?.follow_up_date ?? '',
          }}
          submitLabel={editing ? 'Save changes' : 'Log difficulty'}
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
            { name: 'topic_name', label: 'Exact topic', type: 'text', placeholder: 'e.g. Projectile range derivation' },
            { name: 'reason', label: 'Why is it difficult?', type: 'textarea', rows: 3, optional: true },
            { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS },
            { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
            { name: 'source_ref', label: 'Question / source', type: 'text', optional: true },
            { name: 'attempted_solution', label: 'What have you tried?', type: 'textarea', rows: 2, optional: true },
            { name: 'corrected_concept', label: 'Corrected concept', type: 'textarea', rows: 2, optional: true },
            { name: 'follow_up_date', label: 'Follow-up date', type: 'date', optional: true },
          ]}
          onSubmit={save}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

export function DifficultiesPage() {
  return <WorkspaceGate>{() => <DifficultiesContent />}</WorkspaceGate>;
}
