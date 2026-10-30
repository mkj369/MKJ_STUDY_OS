import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { dailyBlockSchema, studySessionSchema, type DailyBlockValues, type StudySessionValues } from '@/domain/schemas';
import {
  ACTIVITY_LABELS,
  DAY_CATEGORY_LABELS,
  buildTimeline,
  endOfDaySummary,
  findDuplicateCandidates,
  findOverlaps,
  formatMinutes,
  plannedVsActual,
  summarizeTime,
  timerResult,
  weekTotals,
  type TimelineEntry,
} from '@/domain/timeTracking';
import { addDaysISO, formatTime, todayISO, weekRange, weekdayName, zonedWallTimeToInstant } from '@/domain/dates';
import { ACTIVITY_TYPES, DAY_BLOCK_CATEGORIES, type DailyBlock, type StudySession } from '@/types/domain';
import { emptyToNull, errorMessage } from '@/utils/errors';

const TIMER_KEY = 'mkj.timer.v1';
const MAX_TIMER_MINUTES = 480;

interface StoredTimer {
  status: 'running' | 'paused';
  startedAt: string;
  bankedSeconds: number;
  subjectId: string;
  chapterId: string;
}

function readTimer(): StoredTimer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTimer;
    if (!parsed || (parsed.status !== 'running' && parsed.status !== 'paused')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function elapsedSeconds(timer: StoredTimer, nowMs: number): number {
  const banked = Math.max(0, timer.bankedSeconds || 0);
  if (timer.status !== 'running') return banked;
  const started = new Date(timer.startedAt).getTime();
  if (!Number.isFinite(started) || nowMs <= started) return banked;
  return banked + Math.floor((nowMs - started) / 1000);
}

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const BLOCK_OPTIONS = DAY_BLOCK_CATEGORIES.map((category) => ({
  value: category,
  label: DAY_CATEGORY_LABELS[category],
}));
const ACTIVITY_OPTIONS = ACTIVITY_TYPES.map((activity) => ({
  value: activity,
  label: ACTIVITY_LABELS[activity] ?? activity,
}));

function TimeTrackerContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [date, setDate] = useState<string | null>(null);
  const [timer, setTimer] = useState<StoredTimer | null>(() => readTimer());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [blockDialog, setBlockDialog] = useState<{ editing: DailyBlock | null } | null>(null);
  const [sessionDialog, setSessionDialog] = useState<{ editing: StudySession | null; prefill?: Partial<StudySessionValues> } | null>(null);
  const [duplicateNote, setDuplicateNote] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!timer || timer.status !== 'running') return;
    const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [timer]);

  useEffect(() => {
    if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else localStorage.removeItem(TIMER_KEY);
  }, [timer]);

  // Class-scoped sessions and blocks: a week total should not include minutes
  // logged against a subject from another class.
  const sessionsSource = data?.scoped.sessions;
  const blocksSource = data?.scoped.dailyBlocks;
  const sessions = useMemo(() => sessionsSource ?? [], [sessionsSource]);
  const blocks = useMemo(() => blocksSource ?? [], [blocksSource]);
  const timezone = data?.bundle.profile.timezone ?? 'Asia/Dhaka';
  const today = data?.view.today ?? todayISO();
  const selected = date ?? today;

  const timeline = useMemo(
    () =>
      buildTimeline(
        { sessions, blocks, subjectLabels: data?.view.phase2.subjectLabels },
        selected,
      ),
    [sessions, blocks, selected, data?.view.phase2.subjectLabels],
  );
  const summary = summarizeTime(timeline);
  const overlaps = findOverlaps(timeline);
  const daySummary = endOfDaySummary(selected, timeline);

  const weekStart = weekRange(selected).start;
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysISO(weekStart, index));
  const weekKey = weekDates.join(',');
  const allWeekEntries = useMemo(
    () =>
      weekDates.flatMap((weekDate) =>
        buildTimeline({ sessions, blocks, subjectLabels: data?.view.phase2.subjectLabels }, weekDate),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, blocks, weekKey, data?.view.phase2.subjectLabels],
  );
  const previousWeekStart = addDaysISO(weekStart, -7);
  const previousWeekEntries = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => addDaysISO(previousWeekStart, index)).flatMap((weekDate) =>
        buildTimeline({ sessions, blocks, subjectLabels: data?.view.phase2.subjectLabels }, weekDate),
      ),
    [sessions, blocks, previousWeekStart, data?.view.phase2.subjectLabels],
  );
  const week = weekTotals(allWeekEntries, weekStart, weekDates[6] as string, previousWeekEntries);
  const schedule = plannedVsActual(data?.bundle.profile.study_windows ?? null, weekDates, allWeekEntries);

  if (!data) return null;
  const { view } = data;

  const chaptersForSubject = (subjectId: string) =>
    view.subjects.find((subject) => subject.subject.id === subjectId)?.chapters ?? [];
  const subjectOptions = view.subjects.map((subject) => ({ value: subject.subject.id, label: subject.label }));

  const timerSeconds = timer ? elapsedSeconds(timer, nowMs) : 0;

  const startTimer = (subjectId: string, chapterId: string) => {
    if (!subjectId) {
      void notify('Choose a subject before starting the timer.', 'warning');
      return;
    }
    setTimer({ status: 'running', startedAt: new Date().toISOString(), bankedSeconds: 0, subjectId, chapterId });
    setNowMs(Date.now());
  };

  const pauseTimer = () => {
    if (!timer || timer.status !== 'running') return;
    setTimer({ ...timer, status: 'paused', bankedSeconds: elapsedSeconds(timer, Date.now()) });
  };

  const resumeTimer = () => {
    if (!timer || timer.status !== 'paused') return;
    setTimer({ ...timer, status: 'running', startedAt: new Date().toISOString() });
    setNowMs(Date.now());
  };

  const discardTimer = () => {
    setTimer(null);
    void notify('Timer discarded. Nothing was saved.', 'medium');
  };

  const stopTimer = () => {
    if (!timer) return;
    const seconds = elapsedSeconds(timer, Date.now());
    const result = timerResult(
      new Date(Date.now() - seconds * 1000).toISOString(),
      new Date().toISOString(),
      MAX_TIMER_MINUTES,
    );
    if (result.warnings.includes('clamped_to_max')) {
      void notify(`The timer had been running for a long time, so it was capped at ${MAX_TIMER_MINUTES} minutes. Edit the entry if that is wrong.`, 'warning');
    }
    setTimer(null);
    setStopping(true);
    setSessionDialog({
      editing: null,
      prefill: {
        user_subject_id: timer.subjectId,
        user_chapter_id: timer.chapterId,
        session_date: today,
        duration_minutes: result.minutes,
        activity_type: 'reading',
      },
    });
  };

  const saveBlock = async (values: DailyBlockValues) => {
    const startInstant = values.started_time
      ? zonedWallTimeToInstant(values.entry_date, values.started_time, timezone).toISOString()
      : null;
    const endInstant = startInstant
      ? new Date(new Date(startInstant).getTime() + values.duration_minutes * 60_000).toISOString()
      : null;
    const candidate: TimelineEntry = {
      kind: 'block',
      id: 'candidate',
      date: values.entry_date,
      minutes: values.duration_minutes,
      label: values.category === 'custom' ? values.custom_label ?? 'Custom' : DAY_CATEGORY_LABELS[values.category],
      category: values.category,
      subjectId: values.user_subject_id || null,
      subjectName: null,
      chapterId: values.user_chapter_id || null,
      taskId: null,
      startedAt: startInstant,
      endedAt: endInstant,
      source: 'manual',
      notes: null,
    };
    const existing = buildTimeline(
      { sessions, blocks: blocks.filter((block) => block.id !== blockDialog?.editing?.id), subjectLabels: view.phase2.subjectLabels },
      values.entry_date,
    );
    const duplicates = findDuplicateCandidates(candidate, existing);
    const payload = {
      entry_date: values.entry_date,
      category: values.category,
      custom_label: values.category === 'custom' ? values.custom_label ?? null : null,
      user_subject_id: values.user_subject_id || null,
      user_chapter_id: values.user_chapter_id || null,
      started_at: startInstant,
      ended_at: endInstant,
      duration_minutes: values.duration_minutes,
      notes: emptyToNull(values.notes),
    };
    if (blockDialog?.editing) {
      await mutate((repo) => repo.update('daily_blocks', blockDialog.editing!.id, payload));
      await notify('Time block updated.');
    } else {
      await mutate((repo) =>
        repo.create('daily_blocks', {
          ...payload,
          source: 'manual',
          client_entry_id: crypto.randomUUID(),
          is_demo: false,
        }),
      );
      await notify(duplicates.length > 0 ? 'Time block saved. Check the duplicate warning.' : 'Time block saved.');
    }
    setBlockDialog(null);
  };

  const saveSession = async (values: StudySessionValues) => {
    const chapterId = values.user_chapter_id || null;
    const payload = {
      user_subject_id: values.user_subject_id,
      user_chapter_id: chapterId,
      activity_type: values.activity_type,
      session_date: values.session_date,
      duration_minutes: values.duration_minutes,
      focus_rating: values.focus_rating,
      result: emptyToNull(values.result),
      notes: emptyToNull(values.notes),
    };
    if (sessionDialog?.editing) {
      await mutate((repo) => repo.update('study_sessions', sessionDialog.editing!.id, payload));
      await notify('Study session updated.');
    } else {
      const now = new Date();
      const startedAt = stopping ? new Date(now.getTime() - values.duration_minutes * 60_000).toISOString() : null;
      await mutate((repo) =>
        repo.create('study_sessions', {
          ...payload,
          started_at: startedAt,
          ended_at: stopping ? now.toISOString() : null,
          source: stopping ? 'timer' : 'manual',
          client_entry_id: crypto.randomUUID(),
          user_topic_id: null,
          user_task_id: null,
          is_demo: false,
        }),
      );
      await notify('Study time logged.');
    }
    setStopping(false);
    setSessionDialog(null);
  };

  const deleteSession = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('study_sessions', id));
      await notify('Session removed.', 'medium');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };
  const deleteBlock = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('daily_blocks', id));
      await notify('Time block removed.', 'medium');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Daily time tracker"
        description="A timeline of what actually happened. Study minutes live in study sessions; everything else in the day goes in time blocks, so a minute is never counted twice."
        actions={
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDate(addDaysISO(selected, -1))}>
              Previous
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDate(today)}>
              Today
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDate(addDaysISO(selected, 1))}>
              Next
            </button>
          </>
        }
      />

      <SectionCard
        title={selected === today ? 'Today' : selected}
        hint={`${weekdayName(new Date(`${selected}T00:00:00Z`).getUTCDay(), 'en', 'long')} · ${timezone}`}
        action={
          <div className="row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setBlockDialog({ editing: null })}>
              Add time block
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setSessionDialog({ editing: null })}>
              Log study time
            </button>
          </div>
        }
      >
        <div className="grid grid--stats">
          <StatCard label="Study" value={formatMinutes(summary.studyMinutes)} hint={`${summary.studyEntries} session(s)`} />
          <StatCard label="Other" value={formatMinutes(summary.otherMinutes)} hint={`${summary.otherEntries} block(s)`} />
          <StatCard label="Timed entries" value={formatMinutes(summary.timedMinutes)} hint="Have explicit clock times" />
        </div>

        {overlaps.length > 0 ? (
          <Notice tone="warn" title="Overlapping time">
            {overlaps.length} pair(s) of entries claim the same minutes. Totals still add each entry, so they can double
            count. Adjust the times if this was a mistake.
          </Notice>
        ) : null}

        {timeline.length === 0 ? (
          <EmptyState
            title="Nothing recorded for this day"
            message="An empty day is missing information, not proof that nothing happened. Log study time, or add a block for college, class, sleep or rest."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setSessionDialog({ editing: null })}>
                Log study time
              </button>
            }
          />
        ) : (
          <div className="timeline">
            {timeline.map((entry) => (
              <div key={`${entry.kind}-${entry.id}`} className={`timeline__row ${entry.kind === 'block' ? 'timeline__row--block' : ''}`}>
                <span className="timeline__time">
                  {entry.startedAt ? formatTime(new Date(entry.startedAt).toTimeString().slice(0, 5)) : '—'}
                </span>
                <div>
                  <strong>{entry.label}</strong>
                  <div className="tiny muted">
                    {entry.subjectName ? `${entry.subjectName} · ` : ''}
                    {entry.chapterId ? `${view.phase2.chapterTitles[entry.chapterId] ?? 'Chapter'} · ` : ''}
                    {entry.source === 'timer' ? 'Stopwatch' : entry.kind === 'study' ? 'Study session' : 'Day block'}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </div>
                </div>
                <div className="row">
                  <span className="mono-num">{formatMinutes(entry.minutes)}</span>
                  {entry.kind === 'study' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() =>
                          setSessionDialog({
                            editing: sessions.find((session) => session.id === entry.id) ?? null,
                          })
                        }
                      >
                        Edit
                      </button>
                      <ConfirmDeleteButton
                        label="Delete"
                        header="Delete this session?"
                        message="Study minutes are removed from your totals."
                        onConfirm={() => deleteSession(entry.id)}
                      />
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setBlockDialog({ editing: blocks.find((block) => block.id === entry.id) ?? null })}
                      >
                        Edit
                      </button>
                      <ConfirmDeleteButton
                        label="Delete"
                        header="Delete this block?"
                        message="The block is removed from the day timeline."
                        onConfirm={() => deleteBlock(entry.id)}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <SectionCard title="End of day" hint="A plain-language summary of the records above.">
          {/* When the day is empty the card above already said so; repeating the
              same sentence here reads like two failures instead of one. */}
          {daySummary.hasAnyRecord ? (
            <p>
              <strong>{daySummary.headline}</strong>
            </p>
          ) : (
            <p className="small muted">
              No summary to write yet. Once this day has a session or a block, this card explains where the
              minutes went.
            </p>
          )}
          <ul className="list">
            {daySummary.details.map((detail) => (
              <li key={detail} className="small muted">
                {detail}
              </li>
            ))}
          </ul>
        </SectionCard>
      </SectionCard>

      <SectionCard title="Optional stopwatch" hint="No background tracking: the stopwatch only runs while this tab is open, and it is computed from the clock so a backgrounded tab does not lose time.">
        {timer ? (
          <>
            <div className="row row--between">
              <div>
                <div className="timer-display" aria-live="off">
                  {clock(timerSeconds)}
                </div>
                <p className="tiny muted">
                  {view.phase2.subjectLabels[timer.subjectId] ?? 'Subject'}
                  {timer.chapterId ? ` · ${view.phase2.chapterTitles[timer.chapterId] ?? 'Chapter'}` : ''} ·{' '}
                  {timer.status === 'paused' ? 'Paused' : 'Running'}
                  {timerSeconds > MAX_TIMER_MINUTES * 60 ? ' · will be capped at 8 hours' : ''}
                </p>
              </div>
              <div className="row">
                {timer.status === 'running' ? (
                  <button type="button" className="btn btn--secondary" onClick={pauseTimer}>
                    Pause
                  </button>
                ) : (
                  <button type="button" className="btn btn--primary" onClick={resumeTimer}>
                    Resume
                  </button>
                )}
                <button type="button" className="btn btn--primary" onClick={stopTimer}>
                  Stop &amp; log
                </button>
                <button type="button" className="btn btn--ghost" onClick={discardTimer}>
                  Discard
                </button>
              </div>
            </div>
            <Notice tone="neutral">
              If the tab or phone sleeps, the elapsed time is recalculated from the wall clock when you return. You can
              always correct the minutes before saving.
            </Notice>
          </>
        ) : (
          <TimerStarter subjects={subjectOptions} onStart={startTimer} chaptersForSubject={chaptersForSubject} />
        )}
      </SectionCard>

      <SectionCard
        title="This week"
        hint={`${weekStart} → ${weekDates[6]} · compared with the previous week only when records exist`}
      >
        <div className="grid grid--stats">
          <StatCard label="Study this week" value={formatMinutes(week.studyMinutes)} hint={`${week.activeDays} active day(s)`} />
          <StatCard label="Other time" value={formatMinutes(week.otherMinutes)} hint="College, classes, sleep, breaks" />
          <StatCard
            label="Average per active day"
            value={week.averageStudyMinutesPerActiveDay === null ? 'Not recorded' : formatMinutes(week.averageStudyMinutesPerActiveDay)}
            hint="Only days with a recorded session"
          />
          <StatCard
            label="Compared to last week"
            value={
              week.changeMinutes === null
                ? 'No baseline'
                : `${week.changeMinutes >= 0 ? '+' : ''}${formatMinutes(Math.abs(week.changeMinutes))}`
            }
            hint={week.changeMinutes === null ? 'Last week has no recorded sessions' : 'Difference in recorded study minutes'}
          />
        </div>

        <div className="bars" aria-label="Planned versus actual study time">
          {schedule.map((plan) => {
            const max = Math.max(plan.plannedMinutes, plan.actualStudyMinutes, 30);
            return (
              <div key={plan.date} className="bar">
                <span>
                  {weekdayName(plan.weekday)} {plan.date.slice(5)}
                </span>
                <div className="bar__track">
                  <div
                    className={`bar__fill ${!plan.isRestDay && plan.actualStudyMinutes < plan.plannedMinutes ? 'bar__fill--warn' : ''}`}
                    style={{ width: `${Math.round((plan.actualStudyMinutes / max) * 100)}%` }}
                    title={`Actual ${plan.actualStudyMinutes}m of planned ${plan.plannedMinutes}m`}
                  />
                </div>
                <span className="mono-num tiny">
                  {plan.isRestDay ? 'Rest day' : `${plan.actualStudyMinutes}m / ${plan.plannedMinutes}m`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="tiny muted">
          Rest days show as rest, never as a missed goal. Planned minutes come from the study windows in your profile.
        </p>

        {summary.bySubject.length > 0 ? (
          <div>
            <h3>Subject-wise time (selected day)</h3>
            <div className="bars">
              {summary.bySubject.map((subject) => {
                const max = Math.max(...summary.bySubject.map((entry) => entry.minutes), 1);
                return (
                  <div key={subject.subjectId} className="bar">
                    <span>{subject.subjectName}</span>
                    <div className="bar__track">
                      <div className="bar__fill" style={{ width: `${Math.round((subject.minutes / max) * 100)}%` }} />
                    </div>
                    <span className="mono-num tiny">{formatMinutes(subject.minutes)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {summary.byCategory.length > 0 ? (
          <div>
            <h3>Distribution (selected day)</h3>
            <div className="chip-row">
              {summary.byCategory.map((category) => (
                <span key={category.category} className="chip">
                  {category.label} <span className="mono-num">{formatMinutes(category.minutes)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>

      {blockDialog ? (
        <RecordDialog<DailyBlockValues>
          title={blockDialog.editing ? 'Edit time block' : 'Add a time block'}
          description={
            <>
              Everything except study time: college, class, exams, homework, sleep, breaks, commute, personal and custom
              categories.
              {duplicateNote ? <div className="field__error">{duplicateNote}</div> : null}
            </>
          }
          fields={[
            { name: 'entry_date', label: 'Date', type: 'date' },
            { name: 'category', label: 'Category', type: 'select', options: BLOCK_OPTIONS },
            {
              name: 'custom_label',
              label: 'Custom label',
              type: 'text',
              optional: true,
              visibleWhen: (values) => values.category === 'custom',
            },
            { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', min: 1, max: 1440 },
            {
              name: 'started_time',
              label: 'Start time',
              type: 'time',
              optional: true,
              help: 'Optional. Adding a start time lets the app warn about overlapping entries.',
            },
            { name: 'user_subject_id', label: 'Subject', type: 'select', optional: true, options: subjectOptions },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              options: (values) =>
                values.user_subject_id ? chaptersForSubject(String(values.user_subject_id)).map((chapter) => ({ value: chapter.chapter.id, label: chapter.title })) : [],
            },
            { name: 'notes', label: 'Notes', type: 'textarea', optional: true, rows: 3 },
          ]}
          schema={dailyBlockSchema}
          defaultValues={{
            entry_date: blockDialog.editing?.entry_date ?? selected,
            category: blockDialog.editing?.category ?? 'college',
            custom_label: blockDialog.editing?.custom_label ?? '',
            duration_minutes: blockDialog.editing?.duration_minutes ?? 60,
            started_time: blockDialog.editing?.started_at
              ? new Date(blockDialog.editing.started_at).toTimeString().slice(0, 5)
              : '',
            user_subject_id: blockDialog.editing?.user_subject_id ?? '',
            user_chapter_id: blockDialog.editing?.user_chapter_id ?? '',
            notes: blockDialog.editing?.notes ?? '',
          }}
          submitLabel={blockDialog.editing ? 'Save block' : 'Add block'}
          onSubmit={async (values) => {
            const duplicates = findDuplicateCandidates(
              {
                kind: 'block',
                id: 'candidate',
                date: values.entry_date,
                minutes: values.duration_minutes,
                label: '',
                category: values.category,
                subjectId: null,
                subjectName: null,
                chapterId: null,
                taskId: null,
                startedAt: values.started_time ? `${values.entry_date}T${values.started_time}:00` : null,
                endedAt: null,
                source: 'manual',
                notes: null,
              },
              buildTimeline({ sessions, blocks, subjectLabels: view.phase2.subjectLabels }, values.entry_date),
            );
            setDuplicateNote(
              duplicates.length > 0
                ? 'An identical block already exists on this date. Saving again will count these minutes twice.'
                : null,
            );
            await saveBlock(values);
          }}
          onClose={() => {
            setDuplicateNote(null);
            setBlockDialog(null);
          }}
        />
      ) : null}

      {sessionDialog ? (
        <RecordDialog<StudySessionValues>
          title={sessionDialog.editing ? 'Edit study session' : 'Log study time'}
          description={
            sessionDialog.prefill?.duration_minutes
              ? 'Stopwatch time is prefilled. Adjust it if the stopwatch was left running, then choose what you actually did.'
              : 'Study minutes are counted once and feed every other total in the app.'
          }
          fields={[
            { name: 'user_subject_id', label: 'Subject', type: 'select', options: subjectOptions },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              options: (values) =>
                values.user_subject_id
                  ? chaptersForSubject(String(values.user_subject_id)).map((chapter) => ({ value: chapter.chapter.id, label: chapter.title }))
                  : [],
            },
            { name: 'activity_type', label: 'Activity', type: 'select', options: ACTIVITY_OPTIONS },
            { name: 'session_date', label: 'Date', type: 'date' },
            { name: 'duration_minutes', label: 'Minutes', type: 'number', min: 1, max: 1440 },
            {
              name: 'focus_rating',
              label: 'Focus (1–5)',
              type: 'select',
              optional: true,
              options: [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) })),
            },
            { name: 'result', label: 'What did you finish?', type: 'text', optional: true, placeholder: 'e.g. 12 MCQs' },
            { name: 'notes', label: 'Notes', type: 'textarea', optional: true, rows: 3 },
          ]}
          schema={studySessionSchema}
          defaultValues={{
            user_subject_id: sessionDialog.editing?.user_subject_id ?? sessionDialog.prefill?.user_subject_id ?? '',
            user_chapter_id: sessionDialog.editing?.user_chapter_id ?? sessionDialog.prefill?.user_chapter_id ?? '',
            activity_type: sessionDialog.editing?.activity_type ?? sessionDialog.prefill?.activity_type ?? 'reading',
            session_date: sessionDialog.editing?.session_date ?? sessionDialog.prefill?.session_date ?? selected,
            duration_minutes: sessionDialog.editing?.duration_minutes ?? sessionDialog.prefill?.duration_minutes ?? 30,
            focus_rating: sessionDialog.editing?.focus_rating ?? '',
            result: sessionDialog.editing?.result ?? '',
            notes: sessionDialog.editing?.notes ?? '',
          }}
          submitLabel={sessionDialog.editing ? 'Save session' : 'Log session'}
          onSubmit={saveSession}
          onClose={() => {
            setStopping(false);
            setSessionDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

function TimerStarter({
  subjects,
  chaptersForSubject,
  onStart,
}: {
  subjects: { value: string; label: string }[];
  chaptersForSubject: (subjectId: string) => { chapter: { id: string }; title: string }[];
  onStart: (subjectId: string, chapterId: string) => void;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.value ?? '');
  const [chapterId, setChapterId] = useState('');
  const chapters = subjectId ? chaptersForSubject(subjectId) : [];
  return (
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
        >
          <option value="">Choose a subject…</option>
          {subjects.map((subject) => (
            <option key={subject.value} value={subject.value}>
              {subject.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Chapter (optional)</span>
        <select className="input" value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
          <option value="">No chapter</option>
          {chapters.map((chapter) => (
            <option key={chapter.chapter.id} value={chapter.chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button type="button" className="btn btn--primary" onClick={() => onStart(subjectId, chapterId)}>
          Start stopwatch
        </button>
        <Badge tone="neutral">No background tracking</Badge>
      </div>
    </div>
  );
}

export function TimeTrackerPage() {
  return <WorkspaceGate>{() => <TimeTrackerContent />}</WorkspaceGate>;
}
