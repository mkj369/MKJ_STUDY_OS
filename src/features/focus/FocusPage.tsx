import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Notice, PageHeader, ProgressBar, SectionCard } from '@/components/ui/Page';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import {
  FOCUS_LIMITS,
  advance,
  finish,
  idleState,
  pause,
  resume,
  snapshot,
  start,
  validatePlan,
  type FocusPlan,
  type FocusState,
} from '@/domain/focus';
import { formatMinutes } from '@/domain/timeTracking';
import { isOpenTask } from '@/domain/tasks';
import { errorMessage } from '@/utils/errors';

const DEFAULT_PLAN: FocusPlan = { focusMinutes: 25, breakMinutes: 5, plannedIntervals: 2 };

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function FocusContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [plan, setPlan] = useState<FocusPlan>(DEFAULT_PLAN);
  const [state, setState] = useState<FocusState>(() => idleState(DEFAULT_PLAN));
  const [now, setNow] = useState(() => new Date().toISOString());
  const [taskId, setTaskId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [saving, setSaving] = useState(false);

  const live = state.status === 'running' || state.status === 'on_break';

  useEffect(() => {
    if (!live) return;
    const handle = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(handle);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    setState((current) => advance(current, new Date().toISOString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const snap = snapshot(state, now);
  const issues = validatePlan(plan);

  const openTasks = useMemo(() => (data?.bundle.tasks ?? []).filter(isOpenTask), [data]);
  const subjects = data?.view.subjects ?? [];

  if (!data) return null;
  const { view } = data;

  const changePlan = (patch: Partial<FocusPlan>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    if (state.status === 'idle') setState(idleState(next));
  };

  const begin = () => {
    if (issues.length > 0) {
      void notify(issues[0] as string, 'warning');
      return;
    }
    const began = new Date().toISOString();
    setNow(began);
    setState(start(idleState(plan), began));
  };

  const complete = async (early: boolean) => {
    const summary = finish(state, new Date().toISOString());
    if (summary.focusMinutes <= 0) {
      void notify('No focus time was recorded yet, so there is nothing to save.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const resolvedSubject =
        subjectId ||
        (taskId ? openTasks.find((task) => task.id === taskId)?.user_subject_id ?? '' : '') ||
        '';
      const resolvedChapter =
        chapterId ||
        (taskId ? openTasks.find((task) => task.id === taskId)?.user_chapter_id ?? '' : '') ||
        '';
      const studySession = await mutate((repo) =>
        repo.create('study_sessions', {
          user_subject_id: resolvedSubject,
          user_chapter_id: resolvedChapter || null,
          user_task_id: taskId || null,
          user_topic_id: null,
          activity_type: 'other',
          session_date: view.today,
          started_at: summary.startedAt,
          ended_at: summary.endedAt,
          duration_minutes: summary.focusMinutes,
          focus_rating: early ? 4 : 5,
          result: `Focus mode: ${summary.completedIntervals}/${summary.plannedIntervals} blocks`,
          notes: early ? 'Ended early — the time still counts.' : summary.message,
          source: 'focus',
          client_entry_id: crypto.randomUUID(),
          is_demo: false,
        }),
      );
      await mutate((repo) =>
        repo.create('focus_sessions', {
          user_task_id: taskId || null,
          user_subject_id: resolvedSubject || null,
          user_chapter_id: resolvedChapter || null,
          focus_minutes: plan.focusMinutes,
          break_minutes: plan.breakMinutes,
          planned_intervals: plan.plannedIntervals,
          completed_intervals: summary.completedIntervals,
          started_at: summary.startedAt ?? summary.endedAt,
          ended_at: summary.endedAt,
          status: summary.endedEarly ? 'abandoned' : 'completed',
          study_session_id: studySession.id,
          notes: null,
          is_demo: false,
        }),
      );
      await notify(summary.message);
      setState(idleState(plan));
      setTaskId('');
      setChapterId('');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const chapters = subjects.find((subject) => subject.subject.id === subjectId)?.chapters ?? [];

  return (
    <>
      <PageHeader
        title="Focus mode"
        description="An optional timer you can attach to a task, subject and chapter. Finished focus time is written to the same timeline as every other study session — there is no separate count."
      />

      <SectionCard title="Session plan" hint="Nothing here is a streak or a target you owe the app.">
        <div className="grid grid--three">
          <label className="field">
            <span className="field__label">Focus minutes</span>
            <input
              className="input"
              type="number"
              min={FOCUS_LIMITS.minFocusMinutes}
              max={FOCUS_LIMITS.maxFocusMinutes}
              value={plan.focusMinutes}
              disabled={state.status !== 'idle'}
              onChange={(event) => changePlan({ focusMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">Break minutes</span>
            <input
              className="input"
              type="number"
              min={0}
              max={FOCUS_LIMITS.maxBreakMinutes}
              value={plan.breakMinutes}
              disabled={state.status !== 'idle'}
              onChange={(event) => changePlan({ breakMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">Blocks</span>
            <input
              className="input"
              type="number"
              min={1}
              max={FOCUS_LIMITS.maxIntervals}
              value={plan.plannedIntervals}
              disabled={state.status !== 'idle'}
              onChange={(event) => changePlan({ plannedIntervals: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">Link a task</span>
            <select
              className="input"
              value={taskId}
              disabled={state.status !== 'idle'}
              onChange={(event) => {
                const value = event.target.value;
                setTaskId(value);
                const task = openTasks.find((candidate) => candidate.id === value);
                if (task?.user_subject_id) setSubjectId(task.user_subject_id);
                if (task?.user_chapter_id) setChapterId(task.user_chapter_id);
              }}
            >
              <option value="">No task</option>
              {openTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Subject</span>
            <select
              className="input"
              value={subjectId}
              disabled={state.status !== 'idle'}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setChapterId('');
              }}
            >
              <option value="">No subject</option>
              {subjects.map((subject) => (
                <option key={subject.subject.id} value={subject.subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Chapter</span>
            <select className="input" value={chapterId} disabled={state.status !== 'idle'} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">No chapter</option>
              {chapters.map((chapter) => (
                <option key={chapter.chapter.id} value={chapter.chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {issues.length > 0 ? (
          <Notice tone="warn" title="Check the plan">
            <ul className="list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </SectionCard>

      <SectionCard title="Timer" hint="Wall-clock based, so a throttled tab or a sleeping phone does not lose time.">
        <div className="row row--between">
          <div>
            <div className="timer-display" aria-live="off">
              {clock(snap.phase === 'break' ? snap.phaseRemainingSeconds : snap.phaseRemainingSeconds)}
            </div>
            <p className="tiny muted">
              {state.status === 'idle'
                ? `Ready: ${plan.focusMinutes} min focus, ${plan.breakMinutes} min break, ${plan.plannedIntervals} block(s)`
                : state.status === 'finished'
                  ? 'Every planned block is complete.'
                  : snap.phase === 'break'
                    ? `Break · block ${snap.completedIntervals}/${snap.plannedIntervals} done`
                    : `${state.status === 'paused' ? 'Paused' : 'Focus'} · block ${snap.completedIntervals + 1}/${snap.plannedIntervals}`}
            </p>
            <p className="tiny muted">
              Focus recorded {formatMinutes(Math.round(snap.focusSeconds / 60))} · breaks{' '}
              {formatMinutes(Math.round(snap.breakSeconds / 60))}
            </p>
          </div>
          <div className="row">
            {state.status === 'idle' ? (
              <button type="button" className="btn btn--primary" onClick={begin}>
                Start focus
              </button>
            ) : null}
            {state.status === 'running' ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setState(pause(state, new Date().toISOString()))}
              >
                Pause
              </button>
            ) : null}
            {state.status === 'paused' ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const resumed = resume(state, new Date().toISOString());
                  setNow(new Date().toISOString());
                  setState(resumed);
                }}
              >
                Resume
              </button>
            ) : null}
            {state.status !== 'idle' ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={saving || !snap.canFinish}
                onClick={() => void complete(snap.completedIntervals < plan.plannedIntervals)}
              >
                {saving ? 'Saving…' : 'Finish & log'}
              </button>
            ) : null}
            {state.status !== 'idle' ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setState(idleState(plan))}
                disabled={saving}
              >
                Discard
              </button>
            ) : null}
          </div>
        </div>

        <ProgressBar
          percent={snap.progressPercent}
          done={snap.completedIntervals}
          total={plan.plannedIntervals}
          label="Focus blocks completed"
        />

        <Notice tone="neutral">
          Ending early is a normal outcome: the minutes you focused are saved and the message says so. There are no
          streaks to break and no penalty for stopping.
        </Notice>
      </SectionCard>

      <SectionCard
        title="Recent focus sessions"
        hint="Each completed session is linked to the study session it created."
        action={
          <Link to="/time" className="btn btn--secondary btn--sm">
            Open time tracker
          </Link>
        }
      >
        {data.bundle.focusSessions.length === 0 ? (
          <p className="small muted">No focus session recorded yet.</p>
        ) : (
          <ul className="list">
            {[...data.bundle.focusSessions]
              .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
              .slice(0, 10)
              .map((session) => (
                <li key={session.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {session.completed_intervals}/{session.planned_intervals} blocks{' '}
                      <Badge tone={session.status === 'completed' ? 'good' : 'neutral'}>{session.status}</Badge>
                    </div>
                    <div className="list-row__meta">
                      <span>{session.started_at.slice(0, 16).replace('T', ' ')}</span>
                      <span>{session.focus_minutes} min blocks</span>
                      <span>
                        {session.user_subject_id
                          ? view.phase2.subjectLabels[session.user_subject_id] ?? 'Subject'
                          : 'No subject'}
                      </span>
                      {session.user_task_id ? <span>linked to a task</span> : null}
                      {session.study_session_id ? <span>timeline entry created</span> : <span>no timeline entry</span>}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
        <p className="tiny muted">
          Focus time only counts while this page is open. The app does not track you in the background, and it cannot
          claim it does.
        </p>
      </SectionCard>
    </>
  );
}

export function FocusPage() {
  return <WorkspaceGate>{() => <FocusContent />}</WorkspaceGate>;
}
