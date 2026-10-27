import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, warningOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { mistakeSchema, type MistakeValues } from '@/domain/schemas';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { MistakeLog } from '@/types/domain';
import { MISTAKE_CATEGORIES } from '@/types/domain';

export const MISTAKE_LABELS: Record<string, string> = {
  concept_gap: 'Concept gap',
  formula_recall: 'Formula recall',
  calculation: 'Calculation',
  careless_error: 'Careless error',
  time_management: 'Time management',
  question_interpretation: 'Question interpretation',
  incomplete_answer: 'Incomplete answer',
  other: 'Other',
};

const CATEGORY_OPTIONS = MISTAKE_CATEGORIES.map((value) => ({ value, label: MISTAKE_LABELS[value] ?? value }));

function MistakesContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MistakeLog | null>(null);

  if (!data) return null;
  const { view, bundle } = data;
  const mistakes = [...bundle.mistakes].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  const unresolved = mistakes.filter((m) => !m.is_resolved);
  const byCategory = MISTAKE_CATEGORIES.map((category) => ({
    category,
    count: mistakes.filter((m) => m.category === category).length,
  })).filter((entry) => entry.count > 0);

  const save = async (values: MistakeValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    if (editing) {
      await mutate((repo) =>
        repo.update('mistake_logs', editing.id, {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          category: values.category,
          question_ref: emptyToNull(values.question_ref),
          what_went_wrong: values.what_went_wrong,
          correction: emptyToNull(values.correction),
          occurred_at: values.occurred_at,
          is_resolved: values.is_resolved,
        }),
      );
      await notify('Mistake updated.');
    } else {
      await mutate((repo) =>
        repo.create('mistake_logs', {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          exam_result_id: null,
          category: values.category,
          question_ref: emptyToNull(values.question_ref),
          what_went_wrong: values.what_went_wrong,
          correction: emptyToNull(values.correction),
          occurred_at: values.occurred_at,
          is_resolved: values.is_resolved,
          is_demo: false,
        }),
      );
      await notify('Mistake logged.');
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const toggleResolved = async (mistake: MistakeLog) => {
    try {
      await mutate((repo) => repo.update('mistake_logs', mistake.id, { is_resolved: !mistake.is_resolved }));
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const remove = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('mistake_logs', id));
      await notify('Mistake deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Mistake Log"
        description="Specific errors with the correction you learned. Categories help you see patterns — they are not a judgement."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> Log mistake
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Logged mistakes" value={mistakes.length} hint="From practice, tests and exams" />
        <StatCard label="Unresolved" value={unresolved.length} hint="Not yet marked corrected" />
        <StatCard label="Resolved" value={mistakes.length - unresolved.length} hint="Correction recorded" />
        <StatCard label="Categories used" value={byCategory.length} hint="Patterns you actually recorded" />
      </div>

      <div style={{ height: 16 }} />

      {byCategory.length > 0 ? (
        <SectionCard title="Mistake pattern" hint="Counts from your recorded entries only">
          <div className="chip-row">
            {byCategory.map((entry) => (
              <Badge key={entry.category} tone="neutral">
                {MISTAKE_LABELS[entry.category]}: {entry.count}
              </Badge>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <div style={{ height: 16 }} />

      <SectionCard title="Mistakes" hint={`${mistakes.length} record(s)`}>
        {mistakes.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={warningOutline} aria-hidden="true" />}
            title="No mistakes logged"
            message="When a question goes wrong, log what happened and the corrected idea. That is how a mistake becomes useful."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
                Log a mistake
              </button>
            }
          />
        ) : (
          <div className="list">
            {mistakes.map((mistake) => {
              const subject = view.subjectById.get(mistake.user_subject_id);
              const chapter = mistake.user_chapter_id ? view.chapterById.get(mistake.user_chapter_id) : null;
              return (
                <div className="list-row" key={mistake.id}>
                  <label className="checkbox" style={{ padding: 0, marginTop: 2 }}>
                    <input
                      type="checkbox"
                      checked={mistake.is_resolved}
                      onChange={() => void toggleResolved(mistake)}
                      aria-label={`Mark mistake resolved: ${mistake.what_went_wrong.slice(0, 40)}`}
                    />
                  </label>
                  <div className="list-row__main">
                    <div className="list-row__title">{MISTAKE_LABELS[mistake.category] ?? mistake.category}</div>
                    <p className="small">{mistake.what_went_wrong}</p>
                    {mistake.correction ? <p className="tiny muted">Correction: {mistake.correction}</p> : null}
                    <div className="list-row__meta">
                      <span>{mistake.occurred_at}</span>
                      <span>{subject?.label ?? 'Subject removed'}</span>
                      {chapter ? <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link> : null}
                      {mistake.question_ref ? <span>{mistake.question_ref}</span> : null}
                    </div>
                  </div>
                  <div className="list-row__actions">
                    <Badge tone={mistake.is_resolved ? 'good' : 'warn'}>
                      {mistake.is_resolved ? 'Corrected' : 'Open'}
                    </Badge>
                    {mistake.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setEditing(mistake);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => remove(mistake.id)} label="Delete" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 12 }} />
      <Notice tone="neutral">
        A logged mistake is evidence, not a failure. Unresolved mistakes raise “needs practice” for that
        chapter, with this entry named as the reason.
      </Notice>

      {dialogOpen ? (
        <RecordDialog<MistakeValues>
          title={editing ? 'Edit mistake' : 'Log a mistake'}
          schema={mistakeSchema}
          defaultValues={{
            user_subject_id: editing?.user_subject_id ?? view.subjects[0]?.subject.id ?? '',
            user_chapter_id: editing?.user_chapter_id ?? '',
            category: editing?.category ?? 'concept_gap',
            question_ref: editing?.question_ref ?? '',
            what_went_wrong: editing?.what_went_wrong ?? '',
            correction: editing?.correction ?? '',
            occurred_at: editing?.occurred_at ?? view.today,
            is_resolved: editing?.is_resolved ?? false,
          }}
          submitLabel={editing ? 'Save changes' : 'Log mistake'}
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
            { name: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS },
            { name: 'what_went_wrong', label: 'What went wrong?', type: 'textarea', rows: 3 },
            { name: 'correction', label: 'Corrected idea / method', type: 'textarea', rows: 3, optional: true },
            { name: 'question_ref', label: 'Question reference', type: 'text', optional: true, placeholder: 'Board 2023 Q4(b)' },
            { name: 'occurred_at', label: 'Date', type: 'date' },
            { name: 'is_resolved', label: 'I have corrected this', type: 'checkbox' },
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

export function MistakesPage() {
  return <WorkspaceGate>{() => <MistakesContent />}</WorkspaceGate>;
}
