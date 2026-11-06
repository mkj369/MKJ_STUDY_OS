/**
 * Focus v2 — three ways to work, one honest timeline.
 *
 *  Open-ended: start/pause/resume/finish stopwatch.
 *  Timer:      preset or custom countdown with a native notification.
 *  Intervals:  the classic focus/break pomodoro (kept, unchanged rules).
 *  History:    every logged focus/study session with real durations.
 *
 * Elapsed time is timestamp-derived and persisted, so locking the phone,
 * switching apps or restarting never loses or invents focus time.
 */
import { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { pauseOutline, playOutline, refreshOutline, stopOutline } from 'ionicons/icons';
import { useAuth, useServices } from '@/app/AppProviders';
import { useMutate, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { Badge, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { PageSkeleton } from '@/components/ui/BrandLoader';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import {
  FOCUS_PRESETS_MINUTES,
  MAX_CUSTOM_MINUTES,
  finishTimer,
  formatClock,
  pauseTimer,
  resumeTimer,
  startTimer,
  summarizeFinished,
} from '@/domain/focusTimer';
import { requestNotificationPermission, useFocusTimer } from '@/features/focus/useFocusTimer';
import { FocusClassic } from '@/features/focus/FocusClassic';
import { errorMessage } from '@/utils/errors';

type Tab = 'open' | 'countdown' | 'classic' | 'history';

function SessionHistory() {
  const { data } = useWorkspaceQuery();
  if (!data) return <PageSkeleton />;
  const { view, bundle } = data;
  const rows = bundle.focusSessions
    .slice()
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 40);

  if (rows.length === 0) {
    return (
      <SectionCard title="Focus history">
        <p className="small muted">No focus sessions logged yet. Finished timers appear here and in your study timeline.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Focus history" hint={`${rows.length} recent session(s)`}>
      <div className="list">
        {rows.map((session) => {
          const subject = session.user_subject_id ? view.subjectById.get(session.user_subject_id) : undefined;
          const chapter = session.user_chapter_id ? view.chapterById.get(session.user_chapter_id) : undefined;
          const type = (session.notes ?? (session.planned_intervals > 1 ? 'Intervals' : 'Focus')).split(' · ')[0];
          return (
            <div className="list-row" key={session.id}>
              <div className="list-row__main">
                <div className="list-row__title">
                  {session.started_at.slice(0, 10)} · {session.focus_minutes} min
                </div>
                <div className="list-row__meta">
                  {subject ? <span>{subject.label}</span> : <span>No subject</span>}
                  {chapter ? <span>{chapter.title}</span> : null}
                  <span>{type}</span>
                  <span>{session.status}</span>
                </div>
              </div>
              <Badge tone={session.status === 'completed' ? 'good' : 'neutral'}>
                {session.status === 'completed' ? 'Completed' : session.status}
              </Badge>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function FocusContent() {
  const { user } = useAuth();
  const services = useServices();
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [tab, setTab] = useState<Tab>('open');
  const [customMinutes, setCustomMinutes] = useState('30');
  const [preset, setPreset] = useState<number>(25);
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);

  const timer = useFocusTimer(services.storage, user?.id ?? 'anonymous', () => {
    void notify('Countdown finished. Your focus time is ready to log.');
  });
  const { state } = timer;

  const chapters = useMemo(
    () => (subjectId ? data?.view.subjectById.get(subjectId)?.chapters ?? [] : []),
    [data, subjectId],
  );

  if (!data) return <PageSkeleton />;
  const { view } = data;

  const switchTab = (next: Tab) => {
    if (next === 'open' || next === 'countdown') {
      if (state.phase === 'idle' && state.mode !== next) {
        timer.reset(next, next === 'countdown' ? preset : null);
      } else if (state.phase !== 'idle' && state.mode !== next) {
        void notify('Finish or discard the current session before switching timer type.', 'warning');
        return;
      }
    }
    setTab(next);
  };

  const begin = async () => {
    const now = new Date().toISOString();
    let next = state;
    if (state.phase === 'idle') {
      if (state.mode === 'countdown') {
        const minutes = state.targetMs ? state.targetMs / 60_000 : preset;
        next = { ...next, targetMs: Math.round(minutes * 60_000) };
        if (!permissionAsked) {
          setPermissionAsked(true);
          await requestNotificationPermission();
        }
      }
      next = startTimer({ ...next, subjectId: subjectId || null, chapterId: chapterId || null }, now);
      timer.update(next);
      if (next.mode === 'countdown') await timer.armNotification(next);
    }
  };

  const pause = () => {
    timer.update(pauseTimer(state, new Date().toISOString()));
    void timer.disarmNotification();
  };

  const resume = async () => {
    const next = resumeTimer(state, new Date().toISOString());
    timer.update(next);
    if (next.mode === 'countdown' && next.phase === 'running') await timer.armNotification(next);
  };

  const finish = async () => {
    const finished = finishTimer(state, new Date().toISOString());
    timer.update(finished);
    void timer.disarmNotification();
    const summary = summarizeFinished(finished);
    if (!summary) return;
    setSaving(true);
    try {
      const minutes = Math.max(summary.focusMinutes, 0);
      const resolvedSubject = finished.subjectId ?? (subjectId || null);
      const resolvedChapter = finished.chapterId ?? (chapterId || null);
      await mutate(async (repo) => {
        // Idempotency: a crash between logging and reset must not double-log.
        const alreadyLogged = (await repo.list('focus_sessions')).some((session) =>
          (session.notes ?? '').includes(finished.sessionId),
        );
        if (alreadyLogged) return;
        // The study timeline requires a subject (NOT NULL). Without one, the
        // focus session is still saved to focus history — honestly, not dropped.
        let studySessionId: string | null = null;
        if (resolvedSubject) {
          const existing = (await repo.list('study_sessions')).find(
            (session) => session.client_entry_id === finished.sessionId,
          );
          const studySession =
            existing ??
            (await repo.create('study_sessions', {
              user_subject_id: resolvedSubject,
              user_chapter_id: resolvedChapter,
              user_task_id: null,
              user_topic_id: null,
              activity_type: 'other',
              session_date: summary.startedAt.slice(0, 10),
              started_at: summary.startedAt,
              ended_at: summary.endedAt,
              duration_minutes: Math.max(1, minutes),
              focus_rating: null,
              result:
                finished.mode === 'countdown'
                  ? summary.reachedTarget
                    ? `Countdown ${Math.round((finished.targetMs ?? 0) / 60_000)} min reached`
                    : `Countdown stopped at ${minutes} min`
                  : `Open focus ${minutes} min`,
              notes: minutes < 1 ? 'Under a minute — logged as 1 minute so the effort is not lost.' : null,
              source: 'timer',
              client_entry_id: finished.sessionId,
              is_demo: false,
            }));
          studySessionId = studySession.id;
        }
        await repo.create('focus_sessions', {
          user_task_id: null,
          user_subject_id: resolvedSubject,
          user_chapter_id: resolvedChapter,
          focus_minutes: Math.max(1, minutes),
          break_minutes: 0,
          planned_intervals: 1,
          completed_intervals: summary.reachedTarget || finished.mode === 'open' ? 1 : 0,
          started_at: summary.startedAt,
          ended_at: summary.endedAt,
          status: 'completed',
          study_session_id: studySessionId,
          notes: `${finished.mode === 'countdown' ? 'Countdown timer' : 'Open-ended timer'} · ${finished.sessionId}`,
          is_demo: false,
        });
      });
      await notify(`Logged ${Math.max(1, minutes)} focus minute(s). ${minutes < 1 ? 'Short sessions still count.' : 'Well done.'}`);
      timer.reset(state.mode, state.mode === 'countdown' ? (state.targetMs ?? preset * 60_000) / 60_000 : null);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    timer.reset(state.mode, state.mode === 'countdown' ? (state.targetMs ?? preset * 60_000) / 60_000 : null);
    void notify('Session discarded. Nothing was logged.', 'warning');
  };

  const applyPreset = (minutes: number) => {
    setPreset(minutes);
    if (state.phase === 'idle') timer.reset('countdown', minutes);
  };

  const applyCustom = () => {
    const minutes = Number(customMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_CUSTOM_MINUTES) {
      void notify(`Custom countdown must be 1–${MAX_CUSTOM_MINUTES} minutes.`, 'danger');
      return;
    }
    applyPreset(minutes);
  };

  const displaySeconds =
    state.mode === 'countdown' ? Math.ceil((timer.remaining ?? 0) / 1000) : Math.floor(timer.elapsed / 1000);
  const finishedSummary = state.phase === 'finished' ? summarizeFinished(state) : null;
  const sessionActive = state.phase === 'running' || state.phase === 'paused';

  return (
    <>
      <PageHeader
        title="Focus mode"
        description="Pick a style and start. Time is computed from real timestamps and survives locking your phone or restarting the app."
      />

      <div className="chip-row" role="tablist" aria-label="Focus style" style={{ marginBottom: 12 }}>
        {(
          [
            ['open', 'Open-ended'],
            ['countdown', 'Timer'],
            ['classic', 'Intervals'],
            ['history', 'History'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`preset-chip ${tab === value ? 'is-selected' : ''}`}
            onClick={() => switchTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'classic' ? <FocusClassic /> : null}
      {tab === 'history' ? <SessionHistory /> : null}

      {tab === 'open' || tab === 'countdown' ? (
        <>
          {state.mode !== tab && state.phase !== 'idle' ? (
            <Notice tone="warn" title="A different timer is active.">
              Finish or discard it below, then switch style.
            </Notice>
          ) : null}

          {tab === 'countdown' && state.phase === 'idle' ? (
            <SectionCard title="Countdown length" hint="Presets or your own number of minutes">
              <div className="preset-row" role="group" aria-label="Preset durations">
                {FOCUS_PRESETS_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={`preset-chip ${preset === minutes ? 'is-selected' : ''}`}
                    onClick={() => applyPreset(minutes)}
                    aria-pressed={preset === minutes}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
              <form
                className="row"
                style={{ marginTop: 10, gap: 8 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  applyCustom();
                }}
              >
                <input
                  type="number"
                  className="input"
                  style={{ maxWidth: 120 }}
                  min={1}
                  max={MAX_CUSTOM_MINUTES}
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  aria-label="Custom countdown minutes"
                />
                <button type="submit" className="btn btn--secondary btn--sm">Use custom</button>
              </form>
            </SectionCard>
          ) : null}

          <SectionCard title="What are you studying?" hint="Optional — links the session to your records">
            <div className="grid grid--two">
              <label className="field">
                <span className="field__label">Subject</span>
                <select
                  className="input"
                  value={subjectId}
                  onChange={(event) => {
                    setSubjectId(event.target.value);
                    setChapterId('');
                  }}
                  disabled={sessionActive}
                >
                  <option value="">No subject</option>
                  {view.subjects.map((subject) => (
                    <option key={subject.subject.id} value={subject.subject.id}>{subject.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Chapter</span>
                <select className="input" value={chapterId} onChange={(event) => setChapterId(event.target.value)} disabled={sessionActive || !subjectId}>
                  <option value="">No chapter</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.chapter.id} value={chapter.chapter.id}>{chapter.title}</option>
                  ))}
                </select>
              </label>
            </div>
          </SectionCard>

          <div className="focus-dial" aria-live="off">
            <div className="focus-dial__time" role="timer" aria-label={state.mode === 'countdown' ? 'Time remaining' : 'Time elapsed'}>
              {formatClock(displaySeconds)}
            </div>
            <div className="focus-dial__state">
              {state.phase === 'idle'
                ? state.mode === 'countdown'
                  ? `Ready · ${Math.round((state.targetMs ?? 0) / 60_000)} minute countdown`
                  : 'Ready · open-ended'
                : state.phase === 'running'
                  ? state.mode === 'countdown'
                    ? 'Counting down — you can lock the phone'
                    : 'Focusing — you can lock the phone'
                  : state.phase === 'paused'
                    ? 'Paused'
                    : finishedSummary
                      ? finishedSummary.reachedTarget
                        ? 'Target reached'
                        : 'Finished'
                      : 'Finished'}
            </div>
            <div className="focus-actions">
              {state.phase === 'idle' ? (
                <button type="button" className="btn btn--primary" onClick={() => void begin()}>
                  <IonIcon icon={playOutline} aria-hidden="true" /> {state.mode === 'countdown' ? 'Start countdown' : 'Start focus'}
                </button>
              ) : null}
              {state.phase === 'running' ? (
                <button type="button" className="btn btn--secondary" onClick={pause}>
                  <IonIcon icon={pauseOutline} aria-hidden="true" /> Pause
                </button>
              ) : null}
              {state.phase === 'paused' ? (
                <button type="button" className="btn btn--primary" onClick={() => void resume()}>
                  <IonIcon icon={playOutline} aria-hidden="true" /> Resume
                </button>
              ) : null}
              {state.phase === 'running' || state.phase === 'paused' ? (
                <button type="button" className="btn btn--primary" onClick={() => void finish()} disabled={saving}>
                  <IonIcon icon={stopOutline} aria-hidden="true" /> {saving ? 'Logging…' : 'Finish & log'}
                </button>
              ) : null}
              {state.phase === 'finished' ? (
                <>
                  <button type="button" className="btn btn--primary" onClick={() => void finish()} disabled={saving}>
                    {saving ? 'Logging…' : `Log ${Math.max(1, finishedSummary?.focusMinutes ?? 0)} min`}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={discard} disabled={saving}>
                    Discard
                  </button>
                </>
              ) : null}
              {sessionActive ? (
                <button type="button" className="btn btn--ghost" onClick={discard} disabled={saving}>
                  <IonIcon icon={refreshOutline} aria-hidden="true" /> Discard
                </button>
              ) : null}
            </div>
          </div>

          <Notice tone="neutral" title="Honest timing">
            Pausing stops the clock; finishing logs real minutes to your study timeline. Ending early is a normal
            outcome — short sessions are kept, never shamed. Countdown alerts fire natively on Android; in a browser
            the alarm shows while the tab is open.
          </Notice>
        </>
      ) : null}
    </>
  );
}

export function FocusPage() {
  return <WorkspaceGate>{() => <FocusContent />}</WorkspaceGate>;
}
