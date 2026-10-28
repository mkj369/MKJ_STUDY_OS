import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, calendarOutline, checkmarkCircleOutline, ellipsisHorizontal, warningOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { taskSchema, type TaskValues } from '@/domain/schemas';
import { z } from 'zod';
import { optionalDateOnly } from '@/domain/schemas';
import {
  buildRecoveryDraft,
  buildWeeklyPlanDraft,
  compareTasksForPlanning,
  isOpenTask,
  isOverdue,
  summarizeTasks,
} from '@/domain/tasks';
import { addDaysISO, minutesToHuman, todayISO, weekRange, weekdayName } from '@/domain/dates';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { StudyTask } from '@/types/domain';

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Filter = 'open' | 'today' | 'overdue' | 'done' | 'all';

const rescheduleTaskSchema = z.object({
  due_date: optionalDateOnly,
  planned_date: optionalDateOnly,
});

const splitTaskSchema = z.object({
  first_minutes: z.coerce.number().int().min(5, 'At least 5 minutes.').max(719),
});

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_AVAILABILITY: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };

function TasksContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const bundle = data?.bundle;
  const view = data?.view;
  const [filter, setFilter] = useState<Filter>('open');
  const [taskDialog, setTaskDialog] = useState(false);
  const [editing, setEditing] = useState<StudyTask | null>(null);
  const [rescheduling, setRescheduling] = useState<StudyTask | null>(null);
  const [splitting, setSplitting] = useState<StudyTask | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [availability, setAvailability] = useState<Record<string, number>>(
    () => ({ ...DEFAULT_AVAILABILITY, ...(bundle?.profile.study_windows ?? {}) }),
  );
  const [savingAvailability, setSavingAvailability] = useState(false);

  const allTasks = useMemo(() => data?.bundle.tasks ?? [], [data?.bundle.tasks]);
  const earlyToday = data?.view.today ?? todayISO();
  const earlyWeekStart = addDaysISO(earlyToday, weekOffset * 7);

  const visibleTasks = useMemo(() => {
    const tasks = [...allTasks].sort((a, b) => compareTasksForPlanning(a, b, earlyToday));
    switch (filter) {
      case 'open':
        return tasks.filter(isOpenTask);
      case 'today':
        return tasks.filter((t) => isOpenTask(t) && (t.planned_date === earlyToday || t.due_date === earlyToday));
      case 'overdue':
        return tasks.filter((t) => isOverdue(t, earlyToday));
      case 'done':
        return tasks.filter((t) => t.status === 'done').sort((a, b) => (a.completed_at ?? '') < (b.completed_at ?? '') ? 1 : -1);
      default:
        return tasks;
    }
  }, [allTasks, filter, earlyToday]);

  const draft = useMemo(
    () => buildWeeklyPlanDraft(allTasks, availability, earlyWeekStart, earlyToday),
    [allTasks, availability, earlyWeekStart, earlyToday],
  );

  if (!bundle || !view) return null;
  const today = view.today;
  const counts = summarizeTasks(bundle.tasks, today);

  const saveTask = async (values: TaskValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    const payload = {
      title: values.title,
      description: emptyToNull(values.description),
      user_subject_id: values.user_subject_id || null,
      user_chapter_id: chapterId,
      estimated_minutes: values.estimated_minutes,
      priority: values.priority,
      status: values.status,
      due_date: values.due_date ?? null,
      planned_date: values.planned_date ?? null,
    };
    if (editing) {
      await mutate((repo) =>
        repo.update('study_tasks', editing.id, {
          ...payload,
          completed_at: values.status === 'done' ? editing.completed_at ?? new Date().toISOString() : null,
        }),
      );
      await notify('Task updated.');
    } else {
      await mutate((repo) =>
        repo.create('study_tasks', {
          ...payload,
          origin: 'manual',
          source_report_id: null,
          gap_reason: null,
          carried_over_count: 0,
          completed_at: values.status === 'done' ? new Date().toISOString() : null,
          is_demo: false,
        }),
      );
      await notify('Task created.');
    }
    setTaskDialog(false);
    setEditing(null);
  };

  const setStatus = async (task: StudyTask, status: StudyTask['status']) => {
    setBusy(task.id);
    try {
      await mutate((repo) =>
        repo.update('study_tasks', task.id, {
          status,
          completed_at: status === 'done' ? new Date().toISOString() : null,
        }),
      );
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const reschedule = async (values: { due_date: string; planned_date: string }) => {
    if (!rescheduling) return;
    await mutate((repo) =>
      repo.update('study_tasks', rescheduling.id, {
        due_date: values.due_date || null,
        planned_date: values.planned_date || null,
        carried_over_count: rescheduling.carried_over_count + 1,
      }),
    );
    setRescheduling(null);
    await notify('Task rescheduled. Carrying work forward is normal.');
  };

  const split = async (values: { first_minutes: number }) => {
    if (!splitting) return;
    const first = Math.max(5, Math.min(values.first_minutes, splitting.estimated_minutes - 5));
    const second = splitting.estimated_minutes - first;
    await mutate(async (repo) => {
      await repo.update('study_tasks', splitting.id, { estimated_minutes: first, title: `${splitting.title} (part 1)` });
      await repo.create('study_tasks', {
        title: `${splitting.title} (part 2)`,
        description: splitting.description,
        user_subject_id: splitting.user_subject_id,
        user_chapter_id: splitting.user_chapter_id,
        estimated_minutes: second,
        priority: splitting.priority,
        status: splitting.status,
        due_date: splitting.due_date,
        planned_date: null,
        origin: 'manual',
        source_report_id: null,
        gap_reason: splitting.gap_reason,
        carried_over_count: splitting.carried_over_count,
        completed_at: null,
        is_demo: false,
      });
    });
    setSplitting(null);
    await notify(`Task split into ${first} + ${second} minutes.`);
  };

  const deleteTask = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('study_tasks', id));
      await notify('Task deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const saveAvailability = async () => {
    setSavingAvailability(true);
    try {
      await mutate((repo) =>
        repo.updateProfile({
          study_windows: Object.fromEntries(DAY_KEYS.map((day) => [String(day), Number(availability[String(day)] ?? 0)])),
        }),
      );
      await notify('Study availability saved. The draft below uses it.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSavingAvailability(false);
    }
  };

  const acceptPlan = async () => {
    const updates = draft.days
      .filter((day) => day.date >= today)
      .flatMap((day) =>
        day.planned.map((task) => ({
          task,
          planned: day.date,
          bumpCarry: task.planned_date !== null && task.planned_date < day.date,
        })),
      );
    if (updates.length === 0) {
      await notify('Nothing to accept — the draft is empty.', 'warning');
      return;
    }
    try {
      await mutate(async (repo) => {
        for (const update of updates) {
          await repo.update('study_tasks', update.task.id, {
            planned_date: update.planned,
            carried_over_count: update.bumpCarry ? update.task.carried_over_count + 1 : update.task.carried_over_count,
          });
        }
      });
      await notify(`Plan accepted: ${updates.length} task(s) placed. You can still move them.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const applyRecovery = async () => {
    const recovery = buildRecoveryDraft(draft);
    try {
      await mutate(async (repo) => {
        for (const task of recovery.defer) {
          await repo.update('study_tasks', task.id, {
            planned_date: null,
            carried_over_count: task.carried_over_count + 1,
          });
        }
        for (const day of draft.days) {
          const kept = recovery.keep.filter((task) => day.planned.some((planned) => planned.id === task.id));
          for (const task of kept) {
            if (task.planned_date !== day.date) {
              await repo.update('study_tasks', task.id, { planned_date: day.date });
            }
          }
        }
      });
      await notify(recovery.message);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const daysAhead = (date: string) => Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);

  return (
    <>
      <PageHeader
        title="Tasks & Weekly Plan"
        description="A plan you can shrink. Nothing is deleted at the end of a week — unfinished work carries forward under your control."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setTaskDialog(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> New task
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Open tasks" value={counts.open} hint={minutesToHuman(counts.totalMinutesOpen) + ' estimated'} />
        <StatCard label="Overdue" value={counts.overdue} hint="Reschedule or shrink — no guilt" to="/tasks" />
        <StatCard label="Due today" value={counts.dueToday} hint="Deadline is today" />
        <StatCard label="Completed this week" value={counts.doneThisWeek} hint={`Week ${weekRange(today).start} → ${weekRange(today).end}`} />
      </div>

      <div style={{ height: 16 }} />

      {counts.overdue > 0 ? (
        <Notice tone="warn" title={`${counts.overdue} overdue task(s).`}>
          Overdue work is data, not a verdict. Reschedule what still matters, split what is too big, or drop what
          is no longer useful.
        </Notice>
      ) : null}

      <div style={{ height: 12 }} />

      <div className="segmented" role="group" aria-label="Filter tasks">
        {[
          { key: 'open', label: `Open (${counts.open})` },
          { key: 'today', label: `Today (${counts.dueToday})` },
          { key: 'overdue', label: `Overdue (${counts.overdue})` },
          { key: 'done', label: `Done (${bundle.tasks.filter((t) => t.status === 'done').length})` },
          { key: 'all', label: `All (${bundle.tasks.length})` },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key as Filter)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div style={{ height: 12 }} />

      <SectionCard title="Tasks" hint={`${visibleTasks.length} shown`}>
        {visibleTasks.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />}
            title={filter === 'done' ? 'Nothing completed yet' : 'No tasks here'}
            message="Add a task with a realistic duration. A small finished plan is better than a large abandoned one."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setTaskDialog(true)}>
                Create a task
              </button>
            }
          />
        ) : (
          <div className="list">
            {visibleTasks.map((task) => {
              const subject = task.user_subject_id ? view.subjectById.get(task.user_subject_id) : null;
              const chapter = task.user_chapter_id ? view.chapterById.get(task.user_chapter_id) : null;
              const overdue = isOverdue(task, today);
              return (
                <div className="list-row" key={task.id}>
                  <label className="checkbox" style={{ padding: 0, marginTop: 3 }}>
                    <input
                      type="checkbox"
                      checked={task.status === 'done'}
                      onChange={() => void setStatus(task, task.status === 'done' ? 'todo' : 'done')}
                      disabled={busy === task.id}
                      aria-label={`Mark ${task.title} ${task.status === 'done' ? 'not done' : 'done'}`}
                    />
                  </label>
                  <div className="list-row__main">
                    <div className="list-row__title" style={task.status === 'done' ? { textDecoration: 'line-through', color: 'var(--mkj-muted)' } : undefined}>
                      {task.title}
                    </div>
                    <div className="list-row__meta">
                      <span>{task.estimated_minutes} min</span>
                      <span>{task.priority} priority</span>
                      {task.due_date ? <span>due {task.due_date}</span> : <span>no deadline</span>}
                      {task.planned_date ? <span>planned {task.planned_date}</span> : null}
                      {subject ? <span>{subject.label}</span> : null}
                      {chapter ? <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link> : null}
                      {task.carried_over_count > 0 ? <span>carried over {task.carried_over_count}×</span> : null}
                    </div>
                    {task.gap_reason ? <p className="tiny muted">Why suggested: {task.gap_reason}</p> : null}
                    {task.description ? <p className="tiny muted">{task.description}</p> : null}
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                      {task.status === 'blocked' ? <Badge tone="warn">Blocked</Badge> : null}
                      {task.status === 'in_progress' ? <Badge tone="info">In progress</Badge> : null}
                      {task.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                      {task.due_date && !overdue && isOpenTask(task) ? (
                        <Badge tone="neutral">
                          <IonIcon icon={calendarOutline} aria-hidden="true" /> in {daysAhead(task.due_date)} day(s)
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {/* One primary repair action plus an overflow menu. Six
                      side-by-side buttons per row turned the list into a wall
                      of borders and made "Delete" as easy to hit as
                      "Reschedule". Every action stays reachable. */}
                  <div className="list-row__actions">
                    {isOpenTask(task) ? (
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setRescheduling(task)}>
                        Reschedule
                      </button>
                    ) : null}
                    <details className="menu">
                      <summary
                        className="btn btn--ghost btn--sm"
                        // Native <summary> has no button role in Chromium, so
                        // screen readers and tests would miss it entirely.
                        role="button"
                        aria-label={`More actions for ${task.title}`}
                      >
                        <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
                      </summary>
                      <div className="menu__panel" role="group" aria-label={`Actions for ${task.title}`}>
                        <button
                          type="button"
                          className="menu__item"
                          onClick={(event) => {
                            event.currentTarget.closest('details')?.removeAttribute('open');
                            void setStatus(task, task.status === 'blocked' ? 'todo' : 'blocked');
                          }}
                        >
                          {task.status === 'blocked' ? 'Unblock task' : 'Mark blocked'}
                        </button>
                        <button
                          type="button"
                          className="menu__item"
                          onClick={(event) => {
                            event.currentTarget.closest('details')?.removeAttribute('open');
                            setSplitting(task);
                          }}
                        >
                          Split into smaller tasks
                        </button>
                        <button
                          type="button"
                          className="menu__item"
                          onClick={(event) => {
                            event.currentTarget.closest('details')?.removeAttribute('open');
                            setEditing(task);
                            setTaskDialog(true);
                          }}
                        >
                          Edit details
                        </button>
                        <div className="menu__item menu__item--danger">
                          <ConfirmDeleteButton onConfirm={() => deleteTask(task.id)} label="Delete task" />
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard
        title={`Weekly plan draft · ${draft.weekStart} → ${draft.weekEnd}`}
        hint="A suggestion until you accept it. Nothing is written automatically."
        action={
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week">
              ←
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              This week
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWeekOffset((value) => value + 1)} aria-label="Next week">
              →
            </button>
          </div>
        }
      >
        <div className="stack">
          <div>
            <h3 style={{ fontSize: '0.9rem', marginBottom: 6 }}>Your available minutes per day</h3>
            <p className="tiny muted" style={{ marginBottom: 8 }}>
              The app never assumes every day is equal. Enter what is realistic; set 0 for a rest day. Saving
              stores this in your profile.
            </p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
              {DAY_KEYS.map((day) => {
                const key = String(day);
                const value = availability[key] ?? 0;
                return (
                  <label className="field" key={day}>
                    <span className="field__label">{weekdayName(day, 'en', 'long')}</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={960}
                      step={15}
                      value={value}
                      onChange={(event) =>
                        setAvailability((current) => ({ ...current, [key]: Math.max(0, Math.min(960, Number(event.target.value) || 0)) }))
                      }
                      aria-label={`Available minutes on ${weekdayName(day, 'en', 'long')}`}
                    />
                    <span className="tiny muted">
                      {value === 0 ? 'rest day' : minutesToHuman(value)}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void saveAvailability()} disabled={savingAvailability}>
                {savingAvailability ? 'Saving…' : 'Save availability'}
              </button>
              <span className="tiny muted">
                Planned {minutesToHuman(draft.totalPlannedMinutes)} of {minutesToHuman(draft.totalCapacityMinutes)} available
              </span>
            </div>
          </div>

          {draft.warnings.length > 0 ? (
            <Notice tone="warn" title="Plan warnings:">
              <ul className="report-list">
                {draft.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <div className="week-grid">
            {draft.days.map((day) => {
              const isToday = day.date === today;
              const past = day.date < today;
              return (
                <div
                  key={day.date}
                  className={`day-card ${day.isRestDay ? 'day-card--rest' : ''} ${isToday ? 'day-card--today' : ''}`}
                  style={past ? { opacity: 0.62 } : undefined}
                >
                  <div className="day-card__head">
                    <div>
                      <strong>{weekdayName(day.weekday, 'en', 'long')}</strong>{' '}
                      <span className="tiny muted">{day.date}</span>
                    </div>
                    <span className="tiny muted">
                      {day.isRestDay ? 'Rest day' : `${day.usedMinutes}/${day.capacityMinutes} min`}
                    </span>
                  </div>
                  {day.planned.length === 0 ? (
                    <p className="tiny muted">{day.isRestDay ? 'No study planned — that is allowed.' : 'Nothing planned yet.'}</p>
                  ) : (
                    day.planned.map((task) => (
                      <div className="mini-task" key={task.id}>
                        <span>•</span>
                        <div>
                          <div>{task.title}</div>
                          <div className="tiny muted">
                            {task.estimated_minutes} min · {task.priority}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {!past ? (
                    <button
                      type="button"
                      className="link-button tiny"
                      style={{ marginTop: 6 }}
                      onClick={() => {
                        setAvailability((current) => ({ ...current, [String(day.weekday)]: day.isRestDay ? 60 : 0 }));
                      }}
                    >
                      {day.isRestDay ? 'Make it a study day (60 min)' : 'Make it a rest day'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {draft.unscheduled.length > 0 ? (
            <Notice tone="warn" title={`${draft.unscheduled.length} task(s) do not fit this week.`}>
              <ul className="report-list">
                {draft.unscheduled.slice(0, 6).map((task) => (
                  <li key={task.id}>
                    {task.title} · {task.estimated_minutes} min
                  </li>
                ))}
              </ul>
              Nothing has been moved or deleted.
            </Notice>
          ) : null}

          <div className="row">
            <button type="button" className="btn btn--primary" onClick={() => void acceptPlan()} disabled={draft.days.every((d) => d.planned.length === 0)}>
              Accept this plan
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => void applyRecovery()}>
              Smaller recovery plan
            </button>
            <span className="tiny muted">Accepting writes planned dates you can change at any time.</span>
          </div>
        </div>
      </SectionCard>

      {taskDialog ? (
        <RecordDialog<TaskValues>
          title={editing ? 'Edit task' : 'New task'}
          schema={taskSchema}
          defaultValues={{
            title: editing?.title ?? '',
            description: editing?.description ?? '',
            user_subject_id: editing?.user_subject_id ?? '',
            user_chapter_id: editing?.user_chapter_id ?? '',
            estimated_minutes: editing?.estimated_minutes ?? 30,
            priority: editing?.priority ?? 'medium',
            status: editing?.status ?? 'todo',
            due_date: editing?.due_date ?? '',
            planned_date: editing?.planned_date ?? '',
          }}
          submitLabel={editing ? 'Save changes' : 'Create task'}
          fields={[
            { name: 'title', label: 'Task', type: 'text', placeholder: 'e.g. Solve 10 projectile numericals' },
            { name: 'description', label: 'Details', type: 'textarea', rows: 2, optional: true },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              placeholder: 'No subject',
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
            { name: 'estimated_minutes', label: 'Estimated minutes', type: 'number', inputMode: 'numeric', min: 5, max: 720 },
            { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
            { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
            { name: 'due_date', label: 'Deadline', type: 'date', optional: true },
            { name: 'planned_date', label: 'Planned day', type: 'date', optional: true, help: 'When you intend to do it. Accepting a weekly plan sets this.' },
          ]}
          onSubmit={saveTask}
          onClose={() => {
            setTaskDialog(false);
            setEditing(null);
          }}
        />
      ) : null}

      {rescheduling ? (
        <RecordDialog<{ due_date: string; planned_date: string }>
          title="Reschedule task"
          description={`“${rescheduling.title}” — moving a task is a planning decision, not a failure.`}
          schema={rescheduleTaskSchema}
          defaultValues={{
            due_date: rescheduling.due_date ?? '',
            planned_date: rescheduling.planned_date ?? today,
          }}
          submitLabel="Reschedule"
          fields={[
            { name: 'due_date', label: 'Deadline', type: 'date', optional: true },
            { name: 'planned_date', label: 'Planned day', type: 'date', optional: true },
          ]}
          onSubmit={reschedule}
          onClose={() => setRescheduling(null)}
        />
      ) : null}

      {splitting ? (
        <RecordDialog<{ first_minutes: number }>
          title="Split task"
          description={`“${splitting.title}” is ${splitting.estimated_minutes} minutes. Splitting keeps the work but makes the next step smaller.`}
          schema={splitTaskSchema}
          defaultValues={{ first_minutes: Math.max(5, Math.round(splitting.estimated_minutes / 2)) }}
          submitLabel="Split into two"
          fields={[
            {
              name: 'first_minutes',
              label: 'Minutes for part 1',
              type: 'number',
              inputMode: 'numeric',
              min: 5,
              help: 'Part 2 gets the remainder. Both keep the same subject and chapter.',
            },
          ]}
          onSubmit={split}
          onClose={() => setSplitting(null)}
        />
      ) : null}

      <div style={{ height: 8 }} />
      <p className="tiny muted">
        <IonIcon icon={warningOutline} aria-hidden="true" /> Unfinished tasks are never deleted when a new week
        starts. Use “Carry forward” by accepting a new plan, or reschedule them yourself.
      </p>
    </>
  );
}

export function TasksPage() {
  return <WorkspaceGate>{() => <TasksContent />}</WorkspaceGate>;
}
