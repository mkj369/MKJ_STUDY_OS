import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { addOutline, schoolOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { examSchema, type ExamValues } from '@/domain/schemas';
import { examPercent } from '@/domain/progress';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { ExamResult } from '@/types/domain';
import { EXAM_TYPES } from '@/types/domain';

const EXAM_TYPE_LABELS: Record<string, string> = {
  school: 'School / college',
  coaching: 'Coaching',
  board: 'Board',
  admission: 'Admission',
  mock: 'Mock',
  other: 'Other',
};
const EXAM_TYPE_OPTIONS = EXAM_TYPES.map((value) => ({ value, label: EXAM_TYPE_LABELS[value] ?? value }));

function ExamsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExamResult | null>(null);

  if (!data) return null;
  const { view, scoped: bundle } = data;
  const exams = [...bundle.exams].sort((a, b) => (a.exam_date < b.exam_date ? 1 : -1));

  const save = async (values: ExamValues) => {
    const payload = {
      exam_name: values.exam_name,
      exam_type: values.exam_type,
      exam_date: values.exam_date,
      user_subject_id: values.user_subject_id || null,
      coverage_note: emptyToNull(values.coverage_note),
      marks_obtained: values.marks_obtained,
      total_marks: values.total_marks,
      duration_minutes: values.duration_minutes,
      source: emptyToNull(values.source),
      analysis: emptyToNull(values.analysis),
      strengths: emptyToNull(values.strengths),
      weak_areas: emptyToNull(values.weak_areas),
    };
    if (editing) {
      await mutate((repo) => repo.update('exam_results', editing.id, payload));
      await notify('Exam result updated.');
    } else {
      await mutate((repo) => repo.create('exam_results', { ...payload, is_demo: false }));
      await notify('Exam result saved.');
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const remove = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('exam_results', id));
      await notify('Exam result deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const summary = view.examSummary;
  const bestExam = exams.reduce<ExamResult | null>((best, exam) => {
    const percent = examPercent(exam);
    if (percent === null) return best;
    const bestPercent = best ? examPercent(best) : null;
    return bestPercent === null || percent > bestPercent ? exam : best;
  }, null);

  return (
    <>
      <PageHeader
        title="Exams & Results"
        description="Only what you enter. Percentages are computed from your marks; the app does not predict future results."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> Add result
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Results recorded" value={summary.count} hint="Only exams with valid marks" />
        <StatCard label="Average" value={summary.averagePercent !== null ? `${summary.averagePercent}%` : '—'} hint="Simple mean of entered results" />
        <StatCard label="Latest" value={summary.latestPercent !== null ? `${summary.latestPercent}%` : '—'} hint={summary.latestDate ?? 'No result yet'} />
        <StatCard
          label="Trend"
          value={summary.trend === 'unknown' ? '—' : summary.trend}
          hint={
            summary.trend === 'improving'
              ? 'Latest is at least 5 points above the previous result'
              : summary.trend === 'declining'
                ? 'Latest is at least 5 points below the previous result'
                : 'Needs at least two results to compare'
          }
        />
      </div>

      <div style={{ height: 16 }} />

      <Notice tone="warn" title="Marks are sensitive data.">
        Results are visible only to your account. The app never presents a predicted mark or rank, and a single
        result does not define your ability.
      </Notice>

      <div style={{ height: 16 }} />

      <SectionCard title="Results" hint={`${exams.length} record(s)`}>
        {exams.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={schoolOutline} aria-hidden="true" />}
            title="No exam results yet"
            message="Add a class test, coaching exam or board result. Enter the real total marks so percentages are correct."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
                Add a result
              </button>
            }
          />
        ) : (
          <div className="list">
            {exams.map((exam) => {
              const percent = examPercent(exam);
              const subject = exam.user_subject_id ? view.subjectById.get(exam.user_subject_id) : null;
              return (
                <div className="list-row" key={exam.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">{exam.exam_name}</div>
                    <div className="list-row__meta">
                      <span>{exam.exam_date}</span>
                      <span>{EXAM_TYPE_LABELS[exam.exam_type] ?? exam.exam_type}</span>
                      {subject ? <span>{subject.label}</span> : <span>General</span>}
                      <span>
                        {exam.marks_obtained} / {exam.total_marks}
                      </span>
                      {exam.coverage_note ? <span>{exam.coverage_note}</span> : null}
                    </div>
                    {exam.analysis ? <p className="tiny muted">{exam.analysis}</p> : null}
                    {exam.weak_areas ? <p className="tiny">Weak areas: {exam.weak_areas}</p> : null}
                  </div>
                  <div className="list-row__actions">
                    <Badge tone={percent === null ? 'neutral' : percent < 50 ? 'danger' : percent >= 80 ? 'good' : 'warn'}>
                      {percent !== null ? `${percent}%` : 'Not recorded'}
                    </Badge>
                    {exam.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setEditing(exam);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => remove(exam.id)} label="Delete" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Belongs to this list, so it stays inside the card instead of
            floating below it as an orphaned line. */}
        {bestExam ? (
          <p className="tiny muted" style={{ marginTop: 'var(--mkj-space-3)' }}>
            Highest recorded result: {bestExam.exam_name} ({examPercent(bestExam)}%). A single result is a
            data point, not a rank.
          </p>
        ) : null}
      </SectionCard>

      {dialogOpen ? (
        <RecordDialog<ExamValues>
          title={editing ? 'Edit exam result' : 'Add exam result'}
          schema={examSchema}
          defaultValues={{
            exam_name: editing?.exam_name ?? '',
            exam_type: editing?.exam_type ?? 'school',
            exam_date: editing?.exam_date ?? view.today,
            user_subject_id: editing?.user_subject_id ?? '',
            coverage_note: editing?.coverage_note ?? '',
            marks_obtained: editing?.marks_obtained ?? '',
            total_marks: editing?.total_marks ?? 100,
            duration_minutes: editing?.duration_minutes ?? '',
            source: editing?.source ?? '',
            analysis: editing?.analysis ?? '',
            strengths: editing?.strengths ?? '',
            weak_areas: editing?.weak_areas ?? '',
          }}
          submitLabel={editing ? 'Save changes' : 'Add result'}
          fields={[
            { name: 'exam_name', label: 'Exam name', type: 'text', placeholder: 'e.g. Half-yearly Physics' },
            { name: 'exam_type', label: 'Exam type', type: 'select', options: EXAM_TYPE_OPTIONS },
            { name: 'exam_date', label: 'Date', type: 'date' },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              placeholder: 'General / multiple subjects',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            { name: 'coverage_note', label: 'Chapters covered', type: 'text', optional: true },
            { name: 'marks_obtained', label: 'Marks obtained', type: 'number', inputMode: 'decimal' },
            { name: 'total_marks', label: 'Total marks', type: 'number', inputMode: 'decimal', help: 'Required. Must be above zero.' },
            { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', optional: true, inputMode: 'numeric' },
            { name: 'source', label: 'Source', type: 'text', optional: true, placeholder: 'College, coaching, board…' },
            { name: 'strengths', label: 'What went well', type: 'text', optional: true },
            { name: 'weak_areas', label: 'Weak areas', type: 'text', optional: true },
            { name: 'analysis', label: 'Your analysis', type: 'textarea', rows: 3, optional: true },
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

export function ExamsPage() {
  return <WorkspaceGate>{() => <ExamsContent />}</WorkspaceGate>;
}
