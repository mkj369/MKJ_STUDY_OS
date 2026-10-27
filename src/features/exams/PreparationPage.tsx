import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { examTargetSchema, type ExamTargetValues } from '@/domain/schemas';
import { buildPreparationPlan } from '@/domain/preparation';
import { EXAM_TYPES, type ExamTarget } from '@/types/domain';
import { emptyToNull, errorMessage } from '@/utils/errors';

const EXAM_TYPE_LABELS: Record<string, string> = {
  school: 'School / college exam',
  board: 'Board exam',
  admission: 'Admission test',
  mock: 'Mock test',
  other: 'Other',
};

const TASK_PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function PreparationContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ editing: ExamTarget | null } | null>(null);
  const [accepting, setAccepting] = useState(false);

  const targets = data?.bundle.examTargets ?? [];
  const selected = targets.find((target) => target.id === selectedId) ?? targets[0] ?? null;

  const plan = useMemo(() => {
    if (!data || !selected) return null;
    const { bundle, view } = data;
    return buildPreparationPlan({
      target: selected,
      today: view.today,
      chapters: view.subjects.flatMap((subject) =>
        subject.chapters.map((chapter) => ({
          chapter: chapter.chapter,
          title: chapter.title,
          status: chapter.chapter.status,
          topics: view.phase2.topicsByChapter.get(chapter.chapter.id) ?? [],
        })),
      ),
      revisions: bundle.revisions,
      difficulties: bundle.difficulties,
      mistakes: bundle.mistakes,
      sessions: bundle.sessions,
      availability: bundle.profile.study_windows ?? null,
      chapterMinutes: Object.fromEntries(view.phase2.chapterMinutes),
    });
  }, [data, selected]);

  if (!data) return null;
  const { view } = data;
  const subjectOptions = view.subjects.map((subject) => ({ value: subject.subject.id, label: subject.label }));

  const saveTarget = async (values: ExamTargetValues) => {
    const payload = {
      title: values.title,
      exam_type: values.exam_type,
      exam_date: values.exam_date,
      user_subject_id: values.user_subject_id || null,
      coverage_note: emptyToNull(values.coverage_note),
      priority: values.priority,
      status: values.status,
    };
    if (dialog?.editing) {
      await mutate((repo) => repo.update('exam_targets', dialog.editing!.id, payload));
      await notify('Exam target updated.');
    } else {
      await mutate((repo) => repo.create('exam_targets', { ...payload, is_demo: false }));
      await notify('Exam target added.');
    }
    setDialog(null);
  };

  const removeTarget = async (target: ExamTarget) => {
    try {
      await mutate((repo) => repo.remove('exam_targets', target.id));
      await notify('Exam target removed. Nothing else was deleted.', 'medium');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const acceptDraft = async () => {
    if (!plan) return;
    setAccepting(true);
    try {
      for (const task of plan.draft) {
        await mutate((repo) =>
          repo.create('study_tasks', {
            title: task.title.slice(0, 140),
            description: `Draft step for ${plan.countdown.title}: ${task.reason}`.slice(0, 500),
            user_subject_id: plan.subjectId,
            user_chapter_id: task.chapterId,
            estimated_minutes: task.minutes,
            priority: task.priority,
            status: 'todo',
            due_date: task.date,
            planned_date: task.date,
            origin: 'rule',
            gap_reason: task.reason.slice(0, 500),
            carried_over_count: 0,
            source_report_id: null,
            completed_at: null,
            is_demo: false,
          }),
        );
      }
      await notify(`${plan.draft.length} draft step(s) added to your tasks.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Exam preparation"
        description="Countdown to a recorded exam, what the syllabus still needs, revisions due, weak areas and a draft plan sized to your week. No predicted marks or ranks."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ editing: null })}>
            Add exam target
          </button>
        }
      />

      {targets.length === 0 ? (
        <SectionCard title="No exam target recorded">
          <EmptyState
            title="Add the exam you are working towards"
            message="Only the date, name and optional subject are needed. The app will not guess your syllabus or your chances."
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Your exam targets" hint="Select one to build a preparation view.">
            <ul className="list">
              {targets.map((target) => {
                const countdown = view.phase2.countdowns.find((entry) => entry.targetId === target.id);
                return (
                  <li key={target.id} className="list-row">
                    <div className="list-row__main">
                      <div className="list-row__title">
                        {target.title} {selected?.id === target.id ? <Badge tone="info">Viewing</Badge> : null}
                      </div>
                      <div className="list-row__meta">
                        <span>{EXAM_TYPE_LABELS[target.exam_type] ?? target.exam_type}</span>
                        <span>{target.exam_date}</span>
                        {countdown ? (
                          <Badge tone={countdown.isPast ? 'neutral' : countdown.urgency === 'this_week' ? 'danger' : 'warn'}>
                            {countdown.label}
                          </Badge>
                        ) : null}
                        <span>{target.user_subject_id ? view.phase2.subjectLabels[target.user_subject_id] ?? 'Subject' : 'All subjects'}</span>
                        <span>priority {target.priority}</span>
                      </div>
                      {target.coverage_note ? <p className="tiny muted">{target.coverage_note}</p> : null}
                    </div>
                    <div className="list-row__actions">
                      <button
                        type="button"
                        className={`btn btn--sm ${selected?.id === target.id ? 'btn--primary' : 'btn--secondary'}`}
                        onClick={() => setSelectedId(target.id)}
                      >
                        Prepare
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog({ editing: target })}>
                        Edit
                      </button>
                      <ConfirmDeleteButton
                        label="Delete"
                        header="Delete this exam target?"
                        message="The target and its countdown are removed. Chapters, sessions and tasks are untouched."
                        onConfirm={() => removeTarget(target)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          {plan && selected ? (
            <>
              <div className="grid grid--stats">
                <StatCard label="Days remaining" value={plan.countdown.label} hint={plan.countdown.examDate} />
                <StatCard label="Chapters outstanding" value={plan.outstandingCount} hint={`${plan.topicsRemaining} topic(s) not complete`} />
                <StatCard
                  label="Coverage recorded"
                  value={plan.coveragePercent === null ? 'Not recorded' : `${plan.coveragePercent}%`}
                  hint="Chapters marked complete among recorded chapters"
                />
                <StatCard label="Practice recorded" value={`${plan.practiceMinutes} min`} hint="Sessions logged as practice, MCQ, written, board or admission" />
              </div>

              {plan.warnings.length > 0 ? (
                <Notice tone="warn" title="Planning warnings">
                  <ul className="list">
                    {plan.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Notice>
              ) : null}

              <div className="grid grid--two">
                <SectionCard title="Outstanding syllabus" hint="Only chapters with open work.">
                  {plan.outstanding.length === 0 ? (
                    <p className="small muted">Every recorded chapter is complete. Revision becomes the priority.</p>
                  ) : (
                    <ul className="list">
                      {plan.outstanding.map((chapter) => (
                        <li key={chapter.chapterId} className="list-row">
                          <div className="list-row__main">
                            <div className="list-row__title">{chapter.title}</div>
                            <div className="list-row__meta">
                              {chapter.reasons.map((reason) => (
                                <span key={reason}>{reason}</span>
                              ))}
                            </div>
                          </div>
                          <div className="list-row__actions">
                            <Link to={`/chapters/${chapter.chapterId}`} className="btn btn--ghost btn--sm">
                              Open
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard title="Revisions due before the exam" hint="Next review dates inside the next fortnight.">
                  {plan.upcomingRevisions.length === 0 ? (
                    <p className="small muted">No review date falls in the next two weeks.</p>
                  ) : (
                    <ul className="list">
                      {plan.upcomingRevisions.map((revision) => (
                        <li key={`${revision.chapterId}-${revision.dueDate}`} className="list-row">
                          <div className="list-row__main">
                            <div className="list-row__title">{revision.title}</div>
                            <div className="list-row__meta">
                              <span>{revision.dueDate}</span>
                              <Badge tone={revision.daysUntilDue < 0 ? 'danger' : revision.daysUntilDue === 0 ? 'warn' : 'neutral'}>
                                {revision.daysUntilDue < 0
                                  ? `${Math.abs(revision.daysUntilDue)} day(s) overdue`
                                  : revision.daysUntilDue === 0
                                    ? 'Due today'
                                    : `In ${revision.daysUntilDue} day(s)`}
                              </Badge>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>

              <SectionCard title="Weak areas" hint="Difficulties, mistakes and topics you flagged — never inferred from a single mark.">
                {plan.weakAreas.length === 0 ? (
                  <p className="small muted">Nothing is flagged in these records.</p>
                ) : (
                  <ul className="list">
                    {plan.weakAreas.slice(0, 10).map((area) => (
                      <li key={area.key} className="list-row">
                        <div className="list-row__main">
                          <div className="list-row__title">
                            {area.title}{' '}
                            <Badge tone={area.severity === 'high' ? 'danger' : area.severity === 'low' ? 'neutral' : 'warn'}>
                              {area.severity}
                            </Badge>{' '}
                            <Badge tone="info">{area.kind}</Badge>
                          </div>
                          <div className="list-row__meta">
                            <span>{area.detail}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="Draft plan"
                hint={`${plan.draftMinutes} of ${plan.capacityMinutes} available minutes filled. Nothing is saved until you accept.`}
                action={
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={accepting || plan.draft.length === 0}
                      onClick={() => void acceptDraft()}
                    >
                      {accepting ? 'Adding…' : 'Accept draft as tasks'}
                    </button>
                  </div>
                }
              >
                {plan.draft.length === 0 ? (
                  <EmptyState
                    title="No draft step fits"
                    message="Add study availability, move the exam date, or reduce the scope. The app will not invent time you do not have."
                  />
                ) : (
                  <ul className="list">
                    {plan.draft.map((task, index) => (
                      <li key={`${task.date}-${index}`} className="list-row">
                        <div className="list-row__main">
                          <div className="list-row__title">
                            {task.title} <Badge tone="neutral">{task.kind}</Badge>
                          </div>
                          <div className="list-row__meta">
                            <span>{task.date}</span>
                            <span>{task.minutes} min</span>
                            <span>{task.reason}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Notice tone="neutral">{plan.disclaimer}</Notice>
              </SectionCard>
            </>
          ) : null}
        </>
      )}

      {dialog ? (
        <RecordDialog<ExamTargetValues>
          title={dialog.editing ? 'Edit exam target' : 'Add an exam target'}
          fields={[
            { name: 'title', label: 'Exam name', type: 'text', placeholder: 'e.g. Half-yearly examination' },
            {
              name: 'exam_type',
              label: 'Type',
              type: 'select',
              options: EXAM_TYPES.map((type) => ({ value: type, label: EXAM_TYPE_LABELS[type] ?? type })),
            },
            { name: 'exam_date', label: 'Exam date', type: 'date' },
            { name: 'user_subject_id', label: 'Subject', type: 'select', optional: true, options: subjectOptions },
            { name: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITY_OPTIONS },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: [
                { value: 'planned', label: 'Planned' },
                { value: 'active', label: 'Preparing' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ],
            },
            {
              name: 'coverage_note',
              label: 'Coverage note',
              type: 'textarea',
              optional: true,
              rows: 3,
              help: 'What the exam covers, if you know. This is stored as written, not as an official claim.',
            },
          ]}
          schema={examTargetSchema}
          defaultValues={{
            title: dialog.editing?.title ?? '',
            exam_type: dialog.editing?.exam_type ?? 'school',
            exam_date: dialog.editing?.exam_date ?? view.today,
            user_subject_id: dialog.editing?.user_subject_id ?? '',
            priority: dialog.editing?.priority ?? 'high',
            status: dialog.editing?.status ?? 'planned',
            coverage_note: dialog.editing?.coverage_note ?? '',
          }}
          submitLabel={dialog.editing ? 'Save target' : 'Add target'}
          onSubmit={saveTarget}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

export function PreparationPage() {
  return <WorkspaceGate>{() => <PreparationContent />}</WorkspaceGate>;
}
