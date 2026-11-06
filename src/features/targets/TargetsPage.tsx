/**
 * Weekly & monthly targets. Two independent systems on one screen — tabs keep
 * them separate. Progress is computed live from chapters, checklist ticks,
 * lectures and study minutes; editing a record updates every target at once.
 */
import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { addOutline, createOutline, flagOutline } from 'ionicons/icons';
import { useMutate, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, ProgressBar, SectionCard, StatCard } from '@/components/ui/Page';
import { PageSkeleton } from '@/components/ui/BrandLoader';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { studyTargetSchema, type StudyTargetValues } from '@/domain/schemas';
import {
  TARGET_METRICS,
  TARGET_METRIC_LABELS,
  currentPeriodStart,
  type TargetPeriod,
} from '@/domain/targets';
import type { TargetView } from '@/features/shared/selectors';
import type { StudyTarget } from '@/types/domain';
import { errorMessage } from '@/utils/errors';

const STATE_TONES = { active: 'info', completed: 'good', overdue: 'danger', upcoming: 'neutral' } as const;
const STATE_LABELS = { active: 'Active', completed: 'Completed', overdue: 'Overdue', upcoming: 'Upcoming' } as const;

function TargetCard({ view, onEdit }: { view: TargetView; onEdit: (target: StudyTarget) => void }) {
  const { target, progress, subjectLabel } = view;
  const mutate = useMutate();
  const notify = useNotify();

  const remove = async () => {
    try {
      await mutate((repo) => repo.remove('study_targets', target.id));
      await notify('Target removed. Your study records are untouched.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <div className="target-card">
      <div className="target-card__head">
        <div style={{ minWidth: 0 }}>
          <div className="target-card__title">{target.title}</div>
          <div className="target-card__meta">
            {TARGET_METRIC_LABELS[target.metric]}
            {subjectLabel ? ` · ${subjectLabel}` : ' · all subjects'} · {progress.window.start} → {progress.window.end}
          </div>
        </div>
        <Badge tone={STATE_TONES[progress.state]}>{STATE_LABELS[progress.state]}</Badge>
      </div>
      <div style={{ marginTop: 10 }}>
        <ProgressBar
          percent={progress.percent}
          done={progress.current}
          total={progress.goal}
          label={`${target.title} progress`}
          tone={progress.state === 'overdue' ? 'danger' : 'default'}
        />
      </div>
      {target.notes ? <p className="small muted" style={{ margin: '6px 0 0' }}>{target.notes}</p> : null}
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        {progress.state === 'active' && progress.remaining > 0 ? (
          <span className="tiny muted">{progress.remaining} to go by {progress.window.end}</span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(target)} aria-label={`Edit ${target.title}`}>
          <IonIcon icon={createOutline} aria-hidden="true" /> Edit
        </button>
        <ConfirmDeleteButton
          label="Remove"
          header={`Remove “${target.title}”?`}
          message="Only the goal is removed. Chapters, lectures, sessions and checklist history stay exactly as they are."
          onConfirm={remove}
        />
      </div>
    </div>
  );
}

function TargetsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [period, setPeriod] = useState<TargetPeriod>('weekly');
  const [dialog, setDialog] = useState<{ editing: StudyTarget | null } | null>(null);

  if (!data) return <PageSkeleton />;
  const { view } = data;
  const targets = view.targets.filter((t) => t.target.period_type === period);
  const summary = {
    total: targets.length,
    completed: targets.filter((t) => t.progress.state === 'completed').length,
    overdue: targets.filter((t) => t.progress.state === 'overdue').length,
    active: targets.filter((t) => t.progress.state === 'active').length,
  };

  const save = async (values: StudyTargetValues) => {
    try {
      const payload = {
        title: values.title,
        period_type: values.period_type,
        metric: values.metric,
        target_value: values.target_value,
        user_subject_id: values.user_subject_id ? values.user_subject_id : null,
        notes: values.notes ?? null,
      };
      if (dialog?.editing) {
        await mutate((repo) => repo.update('study_targets', dialog.editing!.id, payload));
        await notify('Target updated.');
      } else {
        await mutate((repo) =>
          repo.create('study_targets', {
            ...payload,
            period_start: currentPeriodStart(values.period_type, view.today),
            chapter_ids: [],
            is_demo: false,
          }),
        );
        await notify('Target created. Progress updates automatically from your records.');
      }
      setDialog(null);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Study targets"
        description="Weekly and monthly goals, measured from what you actually record. Overdue goals stay visible — nothing is silently dropped."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ editing: null })}>
            <IonIcon icon={addOutline} aria-hidden="true" /> New target
          </button>
        }
      />

      <div className="chip-row" role="tablist" aria-label="Target period" style={{ marginBottom: 12 }}>
        {(['weekly', 'monthly'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={period === value}
            className={`preset-chip ${period === value ? 'is-selected' : ''}`}
            onClick={() => setPeriod(value)}
          >
            {value === 'weekly' ? 'Weekly (Sun–Sat)' : 'Monthly'}
          </button>
        ))}
      </div>

      <div className="grid grid--stats">
        <StatCard label={`${period === 'weekly' ? 'This week' : 'This month'}: targets`} value={String(summary.total)} />
        <StatCard label="Completed" value={String(summary.completed)} />
        <StatCard label="Active" value={String(summary.active)} />
        <StatCard label="Overdue" value={String(summary.overdue)} />
      </div>

      {targets.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<IonIcon icon={flagOutline} aria-hidden="true" />}
            title={`No ${period} targets yet`}
            message="Examples: “Finish 2 physics chapters this week”, “450 study minutes this week”, “Complete 6 lectures this month”. Progress counts itself from your records."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ editing: null })}>
                Create a {period} target
              </button>
            }
          />
        </SectionCard>
      ) : (
        <div>
          {targets.map((targetView) => (
            <TargetCard key={targetView.target.id} view={targetView} onEdit={(target) => setDialog({ editing: target })} />
          ))}
        </div>
      )}

      <Notice tone="info" title="How counting works">
        Chapters = chapters complete right now in the goal's scope. Checklist items and lectures count only records
        dated inside the window. Minutes come from logged study sessions. Weeks run Sunday to Saturday.
      </Notice>

      {dialog ? (
        <RecordDialog<StudyTargetValues>
          title={dialog.editing ? 'Edit target' : `New ${period} target`}
          description="Pick what to measure and a realistic number. You can edit it any time."
          schema={studyTargetSchema}
          defaultValues={
            dialog.editing
              ? {
                  title: dialog.editing.title,
                  period_type: dialog.editing.period_type,
                  metric: dialog.editing.metric,
                  target_value: dialog.editing.target_value,
                  user_subject_id: dialog.editing.user_subject_id ?? '',
                  notes: dialog.editing.notes ?? '',
                }
              : { title: '', period_type: period, metric: 'minutes', target_value: 300, user_subject_id: '', notes: '' }
          }
          submitLabel={dialog.editing ? 'Save changes' : 'Create target'}
          fields={[
            { name: 'title', label: 'Target name', type: 'text', placeholder: 'e.g. Finish 2 physics chapters' },
            {
              name: 'period_type',
              label: 'Period',
              type: 'select',
              options: [
                { value: 'weekly', label: 'Weekly (Sunday–Saturday)' },
                { value: 'monthly', label: 'Monthly (calendar month)' },
              ],
            },
            {
              name: 'metric',
              label: 'Measure',
              type: 'select',
              options: TARGET_METRICS.map((value) => ({ value, label: TARGET_METRIC_LABELS[value] })),
            },
            { name: 'target_value', label: 'Goal number', type: 'number', min: 1, inputMode: 'numeric' },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              options: [
                { value: '', label: 'All subjects' },
                ...view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
              ],
            },
            { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, optional: true },
          ]}
          onSubmit={save}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

export function TargetsPage() {
  return <WorkspaceGate>{() => <TargetsContent />}</WorkspaceGate>;
}
