import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { buildRecoverySuggestion, buildStudySuggestions, suggestionToTask } from '@/domain/planner';
import { buildRevisionQueue } from '@/domain/revisions';
import { addDaysISO, formatDate, weekRange } from '@/domain/dates';
import { buildTimeline, formatMinutes, plannedVsActual, summarizeTime } from '@/domain/timeTracking';
import { summarizeTasks } from '@/domain/tasks';
import { errorMessage } from '@/utils/errors';

function PlannerContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [applyingRecovery, setApplyingRecovery] = useState(false);

  const suggestions = useMemo(() => {
    if (!data) return [];
    const { bundle, view } = data;
    const revisionQueue = buildRevisionQueue(
      view.subjects.flatMap((subject) =>
        subject.chapters.map((chapter) => ({
          userChapterId: chapter.chapter.id,
          userSubjectId: subject.subject.id,
          chapterTitle: chapter.title,
          subjectName: subject.label,
          revisions: chapter.context.revisions,
        })),
      ),
      view.today,
    );
    return buildStudySuggestions({
      today: view.today,
      chapters: view.subjects.flatMap((subject) =>
        subject.chapters.map((chapter) => ({
          chapter: chapter.chapter,
          title: chapter.title,
          subjectId: subject.subject.id,
          status: chapter.chapter.status,
          topicsRemaining: (view.phase2.topicsByChapter.get(chapter.chapter.id) ?? []).filter(
            (topic) => topic.status !== 'complete',
          ).length,
          overdueRevision: chapter.context.revisions.some(
            (revision) => revision.next_review_date !== null && revision.next_review_date < view.today,
          ),
          openDifficulties: chapter.context.difficulties.filter((difficulty) => difficulty.status !== 'resolved').length,
          practiceRecorded: chapter.context.sessions.some((session) => session.activity_type === 'practice'),
        })),
      ),
      revisionQueue,
      mistakes: view.phase2.mistakeAnalysis,
      tasks: bundle.tasks,
      examTargets: bundle.examTargets.map((target) => ({
        id: target.id,
        title: target.title,
        exam_date: target.exam_date,
        user_subject_id: target.user_subject_id,
      })),
      practiceQueue: view.phase2.practiceQueue.map((candidate) => ({
        questionId: candidate.question.id,
        reason: candidate.reason,
      })),
      availability: bundle.profile.study_windows ?? null,
    });
  }, [data]);

  if (!data) return null;
  const { bundle, view } = data;
  const today = view.today;
  const availability = bundle.profile.study_windows ?? null;
  const availableToday = availability ? Math.round(availability[String(new Date(`${today}T00:00:00Z`).getUTCDay())] ?? 0) : 0;
  const recovery = buildRecoverySuggestion(bundle.tasks, today, availableToday || 90);

  const visible = suggestions.filter((suggestion) => !dismissed.includes(suggestion.key));

  const accept = async (key: string) => {
    const suggestion = suggestions.find((candidate) => candidate.key === key);
    if (!suggestion) return;
    setBusyKey(key);
    try {
      await mutate((repo) => repo.create('study_tasks', { ...suggestionToTask(suggestion, today), carried_over_count: 0, source_report_id: null }));
      setAccepted((current) => [...current, key]);
      await notify('Suggestion accepted and added to your tasks.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusyKey(null);
    }
  };

  const applyRecovery = async () => {
    setApplyingRecovery(true);
    try {
      for (const task of recovery.keep) {
        await mutate((repo) => repo.update('study_tasks', task.id, { planned_date: today }));
      }
      const tomorrow = addDaysISO(today, 1);
      for (const task of recovery.defer) {
        await mutate((repo) =>
          repo.update('study_tasks', task.id, {
            planned_date: tomorrow,
            due_date: task.due_date && task.due_date > tomorrow ? task.due_date : tomorrow,
            carried_over_count: task.carried_over_count + 1,
          }),
        );
      }
      await notify('Smaller plan applied. Nothing was deleted.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setApplyingRecovery(false);
    }
  };

  const weekStart = weekRange(today).start;
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysISO(weekStart, index));
  const weekEntries = weekDates.flatMap((date) =>
    buildTimeline({ sessions: bundle.sessions, blocks: bundle.dailyBlocks, subjectLabels: view.phase2.subjectLabels }, date),
  );
  const schedule = plannedVsActual(availability, weekDates, weekEntries);
  const weekTime = summarizeTime(weekEntries);
  const plannedWeek = schedule.reduce((sum, day) => sum + day.plannedMinutes, 0);
  const taskCounts = summarizeTasks(bundle.tasks, today);
  const acceptedTasks = bundle.tasks.filter((task) => task.origin === 'rule' && (task.status === 'todo' || task.status === 'in_progress'));

  return (
    <>
      <PageHeader
        title="Smart planner"
        description="Suggestions are proposals built from your own records. Nothing becomes a task until you accept it, so a suggestion can never be mistaken for a plan."
      />

      <div className="grid grid--stats">
        <StatCard
          label="Availability this week"
          value={plannedWeek > 0 ? formatMinutes(plannedWeek) : 'Not recorded'}
          hint="From your study windows in Settings"
          to="/settings"
        />
        <StatCard label="Recorded this week" value={formatMinutes(weekTime.studyMinutes)} hint="Study sessions only" to="/time" />
        <StatCard label="Open tasks" value={taskCounts.open} hint={`${taskCounts.overdue} overdue`} to="/tasks" />
        <StatCard label="Open suggestions" value={visible.length} hint="Recalculated from the current records" />
      </div>

      <SectionCard
        title="Suggested next steps"
        hint="Ordered by evidence: overdue revisions first, then exam pressure, weak areas and untouched chapters."
      >
        {visible.length === 0 ? (
          <EmptyState
            title="No suggestion is supported by the records yet"
            message="Log a lecture, a study session or a revision and suggestions will follow. An empty planner is not a failure."
          />
        ) : (
          <ul className="list">
            {visible.map((suggestion) => {
              const isAccepted = accepted.includes(suggestion.key);
              return (
                <li key={suggestion.key} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {suggestion.title}{' '}
                      <Badge tone={suggestion.priority === 'high' ? 'danger' : suggestion.priority === 'medium' ? 'warn' : 'neutral'}>
                        {suggestion.priority}
                      </Badge>{' '}
                      {isAccepted ? <Badge tone="good">Accepted</Badge> : <Badge tone="info">Suggested</Badge>}
                    </div>
                    <div className="list-row__meta">
                      <span>{suggestion.reason}</span>
                      <span>{suggestion.minutes} min</span>
                      {suggestion.alreadyPlanned ? <span>already in your tasks — accepting is disabled</span> : null}
                    </div>
                    <details>
                      <summary className="tiny muted">Evidence</summary>
                      <ul className="list">
                        {suggestion.evidence.map((line) => (
                          <li key={line} className="tiny muted">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <div className="list-row__actions">
                    {/* Accepting a suggestion that is already in the task list
                        would create a second copy of the same task, so the
                        action is replaced by the reason it is unavailable. */}
                    {suggestion.alreadyPlanned ? (
                      <Link to="/tasks" className="btn btn--secondary btn--sm">
                        Open in tasks
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={busyKey === suggestion.key || isAccepted}
                        onClick={() => void accept(suggestion.key)}
                      >
                        {isAccepted ? 'Accepted' : busyKey === suggestion.key ? 'Adding…' : 'Accept'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setDismissed((current) => [...current, suggestion.key])}
                    >
                      Not now
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="tiny muted">
          Dismissed suggestions come back after a reload; they are not permanently hidden. Accepting one creates a normal
          task you can edit, split or delete.
        </p>
      </SectionCard>

      <SectionCard
        title="If the last plan did not happen"
        hint="Recovery without guilt: keep a realistic subset, carry the rest forward, delete nothing."
      >
        <p>{recovery.message}</p>
        {recovery.hasOverdue ? (
          <Notice tone="warn" title="Some tasks are overdue">
            Overdue tasks stay in your list. Carrying them forward keeps the history instead of erasing it.
          </Notice>
        ) : null}
        {recovery.keep.length + recovery.defer.length === 0 ? (
          <p className="small muted">There are no open tasks to reshuffle.</p>
        ) : (
          <div className="grid grid--two">
            <div>
              <h3>Keep today ({recovery.keepCount})</h3>
              {recovery.keep.length === 0 ? (
                <p className="small muted">Nothing fits the time you have today, and that is allowed.</p>
              ) : (
                <ul className="list">
                  {recovery.keep.map((task) => (
                    <li key={task.id} className="list-row">
                      <div className="list-row__main">
                        <div className="list-row__title">{task.title}</div>
                        <div className="list-row__meta">
                          <span>{task.estimated_minutes} min</span>
                          <span>{task.priority}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Carry forward ({recovery.deferCount})</h3>
              {recovery.defer.length === 0 ? (
                <p className="small muted">Everything open fits today.</p>
              ) : (
                <ul className="list">
                  {recovery.defer.map((task) => (
                    <li key={task.id} className="list-row">
                      <div className="list-row__main">
                        <div className="list-row__title">{task.title}</div>
                        <div className="list-row__meta">
                          <span>{task.estimated_minutes} min</span>
                          <span>due {task.due_date ?? 'not set'}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={applyingRecovery || recovery.keepCount + recovery.deferCount === 0}
            onClick={() => void applyRecovery()}
          >
            {applyingRecovery ? 'Applying…' : 'Apply this smaller plan'}
          </button>
          <Link to="/tasks" className="btn btn--secondary">
            Open the full task list
          </Link>
        </div>
        <p className="tiny muted">
          Applying sets kept tasks to today and moves the rest to tomorrow, keeping their real due dates when those are
          later. Nothing is deleted and no streak is broken.
        </p>
      </SectionCard>

      <SectionCard title="Accepted plans" hint="Tasks that came from a suggestion are marked with their origin.">
        {acceptedTasks.length === 0 ? (
          <p className="small muted">No accepted suggestions yet. Accepting one adds a task with origin “rule”.</p>
        ) : (
          <ul className="list">
            {acceptedTasks.map((task) => (
              <li key={task.id} className="list-row">
                <div className="list-row__main">
                  <div className="list-row__title">{task.title}</div>
                  <div className="list-row__meta">
                    <span>{task.estimated_minutes} min</span>
                    <span>planned {task.planned_date ?? '—'}</span>
                    {task.gap_reason ? <span>Why: {task.gap_reason}</span> : null}
                  </div>
                </div>
                <div className="list-row__actions">
                  <Badge tone="info">origin: {task.origin}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="tiny muted">
          Suggested plans live in this page and are recomputed each visit. Accepted plans live in your tasks, so the two
          can never disagree about what you committed to.
        </p>
      </SectionCard>

      <SectionCard title="This week against your availability" hint={`${weekStart} → ${weekDates[6]}`}>
        <div className="bars">
          {schedule.map((day) => {
            const max = Math.max(day.plannedMinutes, day.actualStudyMinutes, 30);
            return (
              <div key={day.date} className="bar">
                <span>{formatDate(day.date)}</span>
                <div className="bar__track">
                  <div
                    className={`bar__fill ${!day.isRestDay && day.actualStudyMinutes < day.plannedMinutes ? 'bar__fill--warn' : ''}`}
                    style={{ width: `${Math.round((day.actualStudyMinutes / max) * 100)}%` }}
                  />
                </div>
                <span className="mono-num tiny">
                  {day.isRestDay ? 'Rest day' : `${formatMinutes(day.actualStudyMinutes)} / ${formatMinutes(day.plannedMinutes)}`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="tiny muted">
          Bars show recorded time, not intention. A rest day is a plan of zero minutes, not a missed target.
        </p>
      </SectionCard>
    </>
  );
}

export function PlannerPage() {
  return <WorkspaceGate>{() => <PlannerContent />}</WorkspaceGate>;
}
