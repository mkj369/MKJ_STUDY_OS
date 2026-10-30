import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import {
  pauseOutline,
  playOutline,
  refreshOutline,
  stopCircleOutline,
  timerOutline,
  peopleOutline,
  trophyOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { Badge, PageHeader, SectionCard } from '@/components/ui/Page';
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
import { loadFocus, saveFocus, clearFocus } from '@/features/focus/focusStorage';

const DEFAULT_PLAN: FocusPlan = { focusMinutes: 25, breakMinutes: 5, plannedIntervals: 2 };
const PRESETS = [25, 45, 60] as const;

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

  const restored = useRef(loadFocus());
  const [plan, setPlan] = useState<FocusPlan>(restored.current?.plan ?? DEFAULT_PLAN);
  const [state, setState] = useState<FocusState>(() => {
    const base = idleState(restored.current?.plan ?? DEFAULT_PLAN);
    return restored.current?.state ?? base;
  });
  const [now, setNow] = useState(() => new Date().toISOString());
  const [taskId, setTaskId] = useState(restored.current?.taskId ?? '');
  const [subjectId, setSubjectId] = useState(restored.current?.subjectId ?? '');
  const [chapterId, setChapterId] = useState(restored.current?.chapterId ?? '');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'timer' | 'circle'>('timer');

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

  // Keep the running timer alive across navigation and reloads.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'paused' || state.status === 'running' || state.status === 'on_break') {
      saveFocus({ plan, state, taskId, subjectId, chapterId });
    }
  }, [plan, state, taskId, subjectId, chapterId]);

  const snap = snapshot(state, now);
  const issues = validatePlan(plan);

  const openTasks = useMemo(() => (data?.scoped.tasks ?? []).filter(isOpenTask), [data]);
  const subjects = data?.view.subjects ?? [];

  if (!data) return null;
  const { view, bundle } = data;

  const changePlan = (patch: Partial<FocusPlan>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    if (state.status === 'idle' || state.status === 'finished') setState(idleState(next));
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
      setState(idleState(plan));
      clearFocus();
      return;
    }
    setSaving(true);
    try {
      const pickedTask = taskId ? openTasks.find((task) => task.id === taskId) : undefined;
      const resolvedSubject = subjectId || pickedTask?.user_subject_id || '';
      const resolvedChapter = chapterId || pickedTask?.user_chapter_id || '';
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
      await notify(
        early
          ? `Saved ${formatMinutes(summary.focusMinutes)} — ending early is a normal outcome.`
          : summary.message,
      );
      setState(idleState(plan));
      setTaskId('');
      setChapterId('');
      clearFocus();
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const chapters = subjects.find((subject) => subject.subject.id === subjectId)?.chapters ?? [];
  const subjectLabel = subjects.find((subject) => subject.subject.id === subjectId)?.label ?? null;

  /* Focus totals come from saved focus_sessions rows only, never from the clock. */
  const focusSessions = bundle.focusSessions;
  const totalFocusMinutes = focusSessions.reduce((sum, session) => sum + session.focus_minutes * session.completed_intervals, 0);
  const completedSessions = focusSessions.filter((session) => session.status === 'completed').length;
  const activeDays = new Set(focusSessions.map((session) => session.started_at.slice(0, 10))).size;
  const todayMinutes = focusSessions
    .filter((session) => session.started_at.slice(0, 10) === view.today)
    .reduce((sum, session) => sum + session.focus_minutes * session.completed_intervals, 0);

  return (
    <>
      <PageHeader
        title="Focus"
        description="Paused minutes never count."
        meta={
          <Link to="/time" className="tiny link-inline">
            Time tracker →
          </Link>
        }
      />

      <div className="segmented segmented--wide" role="tablist" aria-label="Focus sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'timer'}
          aria-pressed={tab === 'timer'}
          onClick={() => setTab('timer')}
        >
          <IonIcon icon={timerOutline} aria-hidden="true" /> Timer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'circle'}
          aria-pressed={tab === 'circle'}
          onClick={() => setTab('circle')}
        >
          <IonIcon icon={peopleOutline} aria-hidden="true" /> Study Circle
        </button>
      </div>

      {tab === 'timer' ? (
        <>
          <section className="focus-stage" aria-label="Focus timer">
            <div className="focus-stage__ring">
              <div
                className="focus-stage__progress"
                style={{ ['--focus-progress' as string]: `${snap.progressPercent}%` }}
                aria-hidden="true"
              />
              <div className="focus-stage__inner">
                <span className="focus-stage__eyebrow">
                  {state.status === 'idle'
                    ? 'Ready'
                    : state.status === 'paused'
                      ? 'Paused'
                      : snap.phase === 'break'
                        ? 'Break'
                        : 'Focus'}
                </span>
                <span className="focus-stage__time" aria-live="off">
                  {clock(snap.phaseRemainingSeconds)}
                </span>
                <span className="focus-stage__meta">
                  {state.status === 'idle'
                    ? `${plan.focusMinutes} min · ${plan.plannedIntervals} block${plan.plannedIntervals === 1 ? '' : 's'}`
                    : `Block ${Math.min(snap.completedIntervals + 1, plan.plannedIntervals)} of ${plan.plannedIntervals}${
                        subjectLabel ? ` · ${subjectLabel}` : ''
                      }`}
                </span>
              </div>
            </div>

            <div className="focus-stage__controls">
              {state.status === 'idle' || state.status === 'finished' ? (
                <button type="button" className="btn btn--primary btn--lg" onClick={begin}>
                  <IonIcon icon={playOutline} aria-hidden="true" /> Start focus
                </button>
              ) : null}
              {state.status === 'running' || state.status === 'on_break' ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--lg"
                  onClick={() => setState(pause(state, new Date().toISOString()))}
                >
                  <IonIcon icon={pauseOutline} aria-hidden="true" /> Pause
                </button>
              ) : null}
              {state.status === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={() => {
                    const resumed = resume(state, new Date().toISOString());
                    setNow(new Date().toISOString());
                    setState(resumed);
                  }}
                >
                  <IonIcon icon={playOutline} aria-hidden="true" /> Resume
                </button>
              ) : null}
              {state.status !== 'idle' && state.status !== 'finished' ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={saving || !snap.canFinish}
                  onClick={() => void complete(snap.completedIntervals < plan.plannedIntervals)}
                >
                  <IonIcon icon={stopCircleOutline} aria-hidden="true" /> End session
                </button>
              ) : null}
            </div>

            <div className="focus-stage__footer">
              <span>
                Focus <strong className="mono-num">{formatMinutes(Math.round(snap.focusSeconds / 60))}</strong>
              </span>
              <span>
                Break <strong className="mono-num">{formatMinutes(Math.round(snap.breakSeconds / 60))}</strong>
              </span>
              <span>
                Today <strong className="mono-num">{formatMinutes(todayMinutes)}</strong>
              </span>
            </div>
          </section>

          <SectionCard title="Session setup" hint="Everything here is optional">
            <div className="stack">
              <div>
                <span className="field__label">Length</span>
                <div className="focus-presets" role="group" aria-label="Focus length">
                  {PRESETS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={`focus-preset${plan.focusMinutes === minutes ? ' focus-preset--on' : ''}`}
                      aria-pressed={plan.focusMinutes === minutes}
                      disabled={state.status !== 'idle' && state.status !== 'finished'}
                      onClick={() => changePlan({ focusMinutes: minutes })}
                    >
                      {minutes} min
                    </button>
                  ))}
                  <label className="focus-preset focus-preset--custom">
                    <span className="visually-hidden">Custom focus minutes</span>
                    <input
                      type="number"
                      min={FOCUS_LIMITS.minFocusMinutes}
                      max={FOCUS_LIMITS.maxFocusMinutes}
                      value={plan.focusMinutes}
                      disabled={state.status !== 'idle' && state.status !== 'finished'}
                      onChange={(event) => changePlan({ focusMinutes: Number(event.target.value) })}
                      aria-label="Custom focus minutes"
                    />
                    <span>min</span>
                  </label>
                </div>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span className="field__label">Subject</span>
                  <select
                    className="input"
                    value={subjectId}
                    disabled={state.status !== 'idle' && state.status !== 'finished'}
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
                  <select
                    className="input"
                    value={chapterId}
                    disabled={state.status !== 'idle' || !subjectId}
                    onChange={(event) => setChapterId(event.target.value)}
                  >
                    <option value="">No chapter</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.chapter.id} value={chapter.chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Task</span>
                  <select
                    className="input"
                    value={taskId}
                    disabled={state.status !== 'idle' && state.status !== 'finished'}
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
              </div>

              <details className="disclosure">
                <summary>Breaks and blocks</summary>
                <div className="disclosure__body">
                  <div className="field-grid">
                    <label className="field">
                      <span className="field__label">Break minutes</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={FOCUS_LIMITS.maxBreakMinutes}
                        value={plan.breakMinutes}
                        disabled={state.status !== 'idle' && state.status !== 'finished'}
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
                        disabled={state.status !== 'idle' && state.status !== 'finished'}
                        onChange={(event) => changePlan({ plannedIntervals: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  {issues.length > 0 ? (
                    <ul className="focus-issues">
                      {issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            </div>
          </SectionCard>

          <SectionCard
            title="Focus history"
            hint="Saved sessions only"
            action={
              <Link to="/time" className="btn btn--ghost btn--sm">
                Open time tracker
              </Link>
            }
          >
            <div className="stat-strip">
              <span>
                <strong className="mono-num">{completedSessions}</strong> sessions
              </span>
              <span>
                <strong className="mono-num">{formatMinutes(totalFocusMinutes)}</strong> focused
              </span>
              <span>
                <strong className="mono-num">{activeDays}</strong> active days
              </span>
              <span>
                <strong className="mono-num">{formatMinutes(todayMinutes)}</strong> today
              </span>
            </div>

            {focusSessions.length === 0 ? (
              <p className="small muted">No focus session recorded yet.</p>
            ) : (
              <ul className="list">
                {[...focusSessions]
                  .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
                  .slice(0, 8)
                  .map((session) => (
                    <li key={session.id} className="list-row">
                      <div className="list-row__main">
                        <div className="list-row__title">
                          {session.completed_intervals}/{session.planned_intervals} blocks
                        </div>
                        <div className="list-row__meta">
                          <span>{session.started_at.slice(0, 16).replace('T', ' ')}</span>
                          <span>
                            {session.user_subject_id
                              ? view.phase2.subjectLabels[session.user_subject_id] ?? 'Subject'
                              : 'No subject'}
                          </span>
                          <span>{formatMinutes(session.focus_minutes * session.completed_intervals)}</span>
                        </div>
                      </div>
                      <Badge tone={session.status === 'completed' ? 'good' : 'neutral'}>{session.status}</Badge>
                    </li>
                  ))}
              </ul>
            )}
            <p className="tiny muted">
              Focus time only runs while this app has the page open; nothing is tracked in the background.
            </p>
          </SectionCard>
        </>
      ) : (
        <StudyCircle
          sessions={completedSessions}
          minutes={totalFocusMinutes}
          activeDays={activeDays}
          todayMinutes={todayMinutes}
        />
      )}
    </>
  );
}

/**
 * Study Circle — the shape of the future community feature, with none of the
 * fiction. There are no accounts, no server and no other students in this build,
 * so the leaderboard shows its own skeleton and says so.
 */
function StudyCircle({
  sessions,
  minutes,
  activeDays,
  todayMinutes,
}: {
  sessions: number;
  minutes: number;
  activeDays: number;
  todayMinutes: number;
}) {
  return (
    <>
      <section className="circle-hero">
        <div className="circle-hero__icon" aria-hidden="true">
          <IonIcon icon={peopleOutline} />
        </div>
        <div>
          <h2 className="circle-hero__title">Study Circle</h2>
          <p className="circle-hero__tagline">Study together. Stay consistent.</p>
          <p className="small muted">
            Online study rooms and the global leaderboard are planned for a future update.
          </p>
        </div>
        <Badge tone="info">Coming soon</Badge>
      </section>

      <div className="circle-rooms" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div className="circle-room" key={index}>
            <span className="circle-room__seat" />
            <span className="circle-room__seat" />
            <span className="circle-room__seat" />
            <span className="circle-room__desk" />
          </div>
        ))}
      </div>

      <SectionCard
        title="Leaderboard"
        hint="Not live"
        action={<Badge tone="info">Coming soon</Badge>}
      >
        <div className="leaderboard" aria-label="Leaderboard preview, not live data">
          <div className="leaderboard__row leaderboard__row--head">
            <span>#</span>
            <span>Student</span>
            <span>Focus</span>
          </div>
          {[1, 2, 3].map((rank) => (
            <div className="leaderboard__row" key={rank}>
              <span className="mono-num">{rank}</span>
              <span className="leaderboard__placeholder">No online data yet</span>
              <span className="mono-num">—</span>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          There is no hosted community service in this build, so no names, avatars, scores or room counts are
          shown. Anything here would be invented.
        </p>
      </SectionCard>

      <SectionCard title="Your personal record" hint="Saved on this device, not online">
        <div className="stat-strip">
          <span>
            <strong className="mono-num">{sessions}</strong> focus sessions
          </span>
          <span>
            <strong className="mono-num">{formatMinutes(minutes)}</strong> focused
          </span>
          <span>
            <strong className="mono-num">{activeDays}</strong> active days
          </span>
          <span>
            <strong className="mono-num">{formatMinutes(todayMinutes)}</strong> today
          </span>
        </div>
        <p className="tiny muted">
          <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" /> These numbers come from focus sessions you
          saved. They are private to this workspace and are not uploaded anywhere.
        </p>
      </SectionCard>

      <SectionCard title="What is planned" hint="No dates promised">
        <ul className="circle-plan">
          <li>
            <IonIcon icon={peopleOutline} aria-hidden="true" /> Join a study room with a shared timer.
          </li>
          <li>
            <IonIcon icon={trophyOutline} aria-hidden="true" /> A weekly leaderboard based on saved focus minutes.
          </li>
          <li>
            <IonIcon icon={refreshOutline} aria-hidden="true" /> Room history so a session is not lost when you
            leave.
          </li>
        </ul>
        <p className="tiny muted">Until then, the timer above works fully offline.</p>
      </SectionCard>
    </>
  );
}

export function FocusPage() {
  return <WorkspaceGate>{() => <FocusContent />}</WorkspaceGate>;
}
