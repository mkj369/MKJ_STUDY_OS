import { Link } from 'react-router-dom';
import { useIonToast, IonIcon } from '@ionic/react';
import {
  addOutline,
  alertCircleOutline,
  calendarOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  schoolOutline,
  layersOutline,
  flaskOutline,
  refreshOutline,
  timeOutline,
} from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { useAuth } from '@/app/AppProviders';
import { demoFixturesEnabled } from '@/config/release';
import {
  Badge,
  DataFreshness,
  DemoBadge,
  EmptyState,
  Notice,
  ProgressBar,
  SectionCard,
  StatusBadge,
} from '@/components/ui/Page';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { minutesToHuman, weekRange, diffDaysISO } from '@/domain/dates';
import { PRIORITY_WEIGHT } from '@/domain/tasks';
import { buildTimeline, formatMinutes, summarizeTime } from '@/domain/timeTracking';
import { errorMessage } from '@/utils/errors';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useWorkspaceQuery();
  const mutate = useMutate();
  const auth = useAuth();
  const [toast] = useIonToast();
  const queryClient = useQueryClient();
  const [busyTask, setBusyTask] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading your dashboard…" />;
  if (error || !data) {
    return (
      <ErrorState
        message={error ? errorMessage(error) : 'Your workspace could not be loaded.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const { view, scoped: bundle } = data; // class-scoped: totals must not mix classes
  const today = view.today;
  const week = weekRange(today);
  const sessionsThisWeek = bundle.sessions.filter(
    (session) => session.session_date >= week.start && session.session_date <= week.end,
  );
  const weekMinutes = sessionsThisWeek.reduce((sum, session) => sum + session.duration_minutes, 0);
  /*
   * Seven bars, one per day of the current week. Every height comes from a
   * `study_sessions` row the student saved — a day with nothing logged stays at
   * zero rather than being smoothed, averaged or filled in.
   */
  const weekDays = (() => {
    const start = new Date(`${week.start}T00:00:00Z`);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
      const minutes = sessionsThisWeek
        .filter((session) => session.session_date === day)
        .reduce((sum, session) => sum + session.duration_minutes, 0);
      return {
        date: day,
        minutes,
        label: new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2),
        isToday: day === today,
      };
    });
  })();
  const peakDayMinutes = Math.max(0, ...weekDays.map((day) => day.minutes));
  const weekLectures = bundle.lectures.filter((l) => l.lecture_date >= week.start && l.lecture_date <= week.end).length;
  const profile = bundle.profile;
  const classScope = (() => {
    const level = typeof profile.active_class === 'number' ? profile.active_class : null;
    if (!level) return null;
    const group = profile.active_group
      ? String(profile.active_group).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
      : null;
    return `Class ${level}${group ? ` · ${group}` : ''}`;
  })();
  const displayName = auth.user?.displayName || profile.display_name;

  const dueRevisions = view.revisionQueue.filter((r) => r.bucket === 'overdue' || r.bucket === 'today');
  const upcomingRevisions = view.revisionQueue.filter((r) => r.bucket === 'this_week').slice(0, 3);
  const dueSoonTasks = bundle.tasks
    .filter((t) => (t.status === 'todo' || t.status === 'in_progress') && t.due_date !== null && diffDaysISO(today, t.due_date) <= 3)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
    .slice(0, 3);

  const attentionChapters = view.subjects
    .flatMap((subject) => subject.chapters.map((chapter) => ({ subject, chapter })))
    .filter(({ chapter }) => chapter.progress.flags.some((f) => f.severity !== 'info'))
    .sort((a, b) => {
      const score = (flags: typeof a.chapter.progress.flags) =>
        flags.reduce((sum, f) => sum + (f.severity === 'high' ? 3 : f.severity === 'attention' ? 1 : 0), 0);
      return score(b.chapter.progress.flags) - score(a.chapter.progress.flags);
    })
    .slice(0, 3);

  // Today's time comes from the same timeline as the tracker: study sessions plus
  // non-study blocks, never a second count of the same minutes.
  const todayTime = summarizeTime(
    buildTimeline(
      { sessions: bundle.sessions, blocks: bundle.dailyBlocks, subjectLabels: view.phase2.subjectLabels },
      today,
    ),
  );
  /*
   * "Continue studying" is driven by the student's own record dates: the
   * chapters with the most recent logged activity come first. A chapter with no
   * record is never shown here, because there is nothing to continue.
   */
  const recentChapters = view.subjects
    .flatMap((subject) => subject.chapters.map((chapter) => ({ subject, chapter })))
    .filter(({ chapter }) => chapter.progress.lastActivityDate !== null)
    .sort((a, b) => (b.chapter.progress.lastActivityDate ?? '').localeCompare(a.chapter.progress.lastActivityDate ?? ''))
    .slice(0, 4);
  const openTasks = view.dashboardTasks.filter((task) => task.status === 'todo' || task.status === 'in_progress');
  const nextExam = view.phase2.countdowns.find((countdown) => !countdown.isPast) ?? null;
  const nextAction = view.dashboardTasks[0];
  const examPercentLabel =
    view.examSummary.latestPercent !== null ? `${view.examSummary.latestPercent}%` : 'Not recorded';

  const completeTask = async (id: string) => {
    setBusyTask(id);
    try {
      await mutate((repo) =>
        repo.update('study_tasks', id, { status: 'done', completed_at: new Date().toISOString() }),
      );
      await toast({
        message: 'Task marked done.',
        duration: 1500,
        color: 'success',
        position: 'bottom',
        cssClass: 'app-toast',
      });
    } catch (taskError) {
      await toast({
        message: errorMessage(taskError),
        duration: 2500,
        color: 'danger',
        position: 'bottom',
        cssClass: 'app-toast',
      });
    } finally {
      setBusyTask(null);
    }
  };

  const loadDemo = async () => {
    try {
      await mutate(async (repo) => {
        await repo.seedDemoWorkspace();
      });
      await queryClient.invalidateQueries();
      await toast({
        message: 'Demo data loaded and labelled.',
        duration: 2000,
        color: 'success',
        position: 'bottom',
        cssClass: 'app-toast',
      });
    } catch (demoError) {
      await toast({
        message: errorMessage(demoError),
        duration: 2500,
        color: 'danger',
        position: 'bottom',
        cssClass: 'app-toast',
      });
    }
  };

  if (view.totals.subjects === 0) {
    const scope = classScope;
    return (
      <div className="dash">
        <header className="hero">
          <div className="hero__body">
            <h1>Welcome, {displayName}</h1>
            <div className="hero__meta">
              <span className="hero__chip">
                <IonIcon icon={calendarOutline} aria-hidden="true" /> {today}
              </span>
              {scope ? (
                <span className="hero__chip">
                  <IonIcon icon={layersOutline} aria-hidden="true" /> {scope}
                </span>
              ) : null}
            </div>
          </div>
        </header>
        <SectionCard title={scope ?? 'Your subjects'}>
          <EmptyState
            icon={<IonIcon icon={addOutline} aria-hidden="true" />}
            title="No subjects yet"
            message={
              scope
                ? `Nothing is saved for ${scope} yet. Add a subject and generate its chapters in one tap.`
                : 'Add your first subject, then generate its chapters in one tap.'
            }
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/curriculum" className="btn btn--primary">
                  Add subject
                </Link>
                {demoFixturesEnabled() ? (
                  <button type="button" className="btn btn--secondary" onClick={loadDemo}>
                    Load demo data
                  </button>
                ) : null}
              </div>
            }
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="dash">
      <header className="hero">
        <div className="hero__body">
          <h1>Good to see you, {displayName}</h1>
          <div className="hero__meta">
            <span className="hero__chip">
              <IonIcon icon={calendarOutline} aria-hidden="true" /> {today}
            </span>
            <span className="hero__chip">
              <IonIcon icon={layersOutline} aria-hidden="true" /> {view.subjects.length}{' '}
              {view.subjects.length === 1 ? 'subject' : 'subjects'}
            </span>
            {classScope ? (
              <span className="hero__chip">
                <IonIcon icon={schoolOutline} aria-hidden="true" /> {classScope}
              </span>
            ) : null}
          </div>
        </div>
        <div className="hero__actions">
          <Link to="/lectures" className="btn btn--primary btn--sm">
            <IonIcon icon={addOutline} aria-hidden="true" /> Log a lecture
          </Link>
          <Link to="/sessions" className="btn btn--secondary btn--sm">
            Log study time
          </Link>
        </div>
      </header>

      {view.demoActive ? (
        <Notice tone="warn" title="Demo data is loaded.">
          Demo rows are labelled <DemoBadge />. Clear them in <Link to="/settings">Settings</Link> before adding
          your own.
        </Notice>
      ) : null}

      {/* 1. What to study next */}
      <SectionCard
        title="Today's focus"
        hint="The one thing to start with"
        action={
          <Link to="/tasks" className="btn btn--ghost btn--sm">
            All tasks
          </Link>
        }
      >
        {nextAction ? (
          <div className="row row--between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="strong">{nextAction.title}</div>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                <Badge tone={nextAction.priority === 'high' ? 'danger' : nextAction.priority === 'medium' ? 'warn' : 'neutral'}>
                  {nextAction.priority} priority
                </Badge>
                <Badge tone="neutral">
                  <IonIcon icon={timeOutline} aria-hidden="true" /> {nextAction.estimated_minutes} min
                </Badge>
                {nextAction.due_date ? (
                  <Badge tone={nextAction.due_date < today ? 'danger' : 'info'}>
                    <IonIcon icon={calendarOutline} aria-hidden="true" /> due {nextAction.due_date}
                  </Badge>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void completeTask(nextAction.id)}
              disabled={busyTask === nextAction.id}
            >
              <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" /> Done
            </button>
          </div>
        ) : (
          <EmptyState
            icon={<IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />}
            title="Nothing planned for today"
            message="Rest is part of a sustainable plan."
            action={
              <Link to="/tasks" className="btn btn--secondary btn--sm">
                Plan a task
              </Link>
            }
          />
        )}
      </SectionCard>

      {/* 2. Continue studying + 3. Revision due */}
      <div className="dash-split">
        <SectionCard
          title="Continue studying"
          hint="Your most recently active chapters"
          action={
            <Link to="/curriculum" className="btn btn--ghost btn--sm">
              Curriculum
            </Link>
          }
        >
          {recentChapters.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={layersOutline} aria-hidden="true" />}
              title="No chapter activity yet"
              message="Open a chapter and tick something off to see it here."
              action={
                <Link to="/curriculum" className="btn btn--secondary btn--sm">
                  Open curriculum
                </Link>
              }
            />
          ) : (
            <div className="list">
              {recentChapters.map(({ subject, chapter }) => {
                const done = chapter.progress.checklist.done;
                const total = chapter.progress.checklist.total;
                return (
                  <div className="list-row" key={chapter.chapter.id}>
                    <div className="list-row__main">
                      <Link to={`/chapters/${chapter.chapter.id}`} className="list-row__title list-row__title--link">
                        {chapter.title}
                      </Link>
                      <div className="list-row__meta">
                        <span>{subject.label}</span>
                        <span>{done} of {total} done</span>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <ProgressBar
                          percent={total > 0 ? (done / total) * 100 : null}
                          label={`${chapter.title} checklist`}
                          compact
                        />
                      </div>
                    </div>
                    <Link to={`/chapters/${chapter.chapter.id}`} className="btn btn--ghost btn--sm" aria-label={`Open ${chapter.title}`}>
                      <IonIcon icon={chevronForwardOutline} aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Revision due"
          hint="From your own review dates"
          action={
            <Link to="/revisions" className="btn btn--ghost btn--sm">
              Open
            </Link>
          }
        >
          {dueRevisions.length === 0 && upcomingRevisions.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={refreshOutline} aria-hidden="true" />}
              title="Nothing due"
              message="Log a revision and a next review date is suggested for you."
              action={
                <Link to="/revisions" className="btn btn--secondary btn--sm">
                  Log a revision
                </Link>
              }
            />
          ) : (
            <div className="list">
              {dueRevisions.slice(0, 4).map((entry) => (
                <div className="list-row" key={entry.userChapterId}>
                  <div className="list-row__main">
                    <div className="list-row__title">{entry.chapterTitle}</div>
                    <div className="list-row__meta">
                      <span>{entry.subjectName}</span>
                      <span>{entry.summary.nextDate}</span>
                    </div>
                  </div>
                  <Badge tone={entry.bucket === 'overdue' ? 'danger' : 'warn'}>
                    {entry.bucket === 'overdue' ? `${Math.abs(entry.daysUntilDue)}d overdue` : 'Today'}
                  </Badge>
                </div>
              ))}
              {upcomingRevisions.map((entry) => (
                <div className="list-row" key={`up-${entry.userChapterId}`}>
                  <div className="list-row__main">
                    <div className="list-row__title">{entry.chapterTitle}</div>
                    <div className="list-row__meta">
                      <span>{entry.subjectName}</span>
                      <span>in {entry.daysUntilDue} day(s)</span>
                    </div>
                  </div>
                  <Badge tone="info">Soon</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 4. Today's tasks */}
      <SectionCard
        title="Today's tasks"
        hint={`${openTasks.length} open${view.taskCounts.overdue > 0 ? ` · ${view.taskCounts.overdue} overdue` : ''}`}
        action={
          <Link to="/tasks" className="btn btn--ghost btn--sm">
            Planner
          </Link>
        }
      >
        {openTasks.length === 0 ? (
          <p className="small muted">No open task today.</p>
        ) : (
          <div className="list">
            {openTasks.slice(0, 6).map((task) => (
              <div className="list-row" key={task.id}>
                <button
                  type="button"
                  className="chapter-row__done-toggle"
                  aria-label={`Mark ${task.title} done`}
                  onClick={() => void completeTask(task.id)}
                  disabled={busyTask === task.id}
                >
                  <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
                </button>
                <div className="list-row__main">
                  <div className="list-row__title">{task.title}</div>
                  <div className="list-row__meta">
                    <span>{task.priority} priority</span>
                    <span>{task.estimated_minutes} min</span>
                    {task.due_date ? <span>due {task.due_date}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 5. Small weekly summary */}
      <SectionCard
        title="This week"
        hint={`${week.start} → ${week.end}`}
        action={
          <Link to="/reports" className="btn btn--ghost btn--sm">
            Report
          </Link>
        }
      >
        <div className="row row--between" style={{ alignItems: 'baseline' }}>
          <span className="small">Study time</span>
          <span className="strong mono-num">{minutesToHuman(weekMinutes)}</span>
        </div>
        {weekMinutes === 0 ? (
          <p className="tiny muted" style={{ marginTop: 6 }}>
            No study time recorded this week.
          </p>
        ) : (
          <div className="week-bars" role="img" aria-label={`Study minutes per day, week of ${week.start}`}>
            {weekDays.map((day) => (
              <div className="week-bars__col" key={day.date}>
                <div className="week-bars__track">
                  <div
                    className={`week-bars__bar${day.minutes === 0 ? ' week-bars__bar--empty' : ''}`}
                    style={{
                      height: peakDayMinutes > 0 ? `${Math.max(2, (day.minutes / peakDayMinutes) * 100)}%` : '2px',
                    }}
                    title={`${day.date}: ${day.minutes === 0 ? 'nothing recorded' : minutesToHuman(day.minutes)}`}
                  />
                </div>
                <span className={`week-bars__label${day.isToday ? ' week-bars__label--today' : ''}`}>{day.label}</span>
                <span className="week-bars__value">{day.minutes === 0 ? '–' : day.minutes}</span>
              </div>
            ))}
          </div>
        )}
        <div className="week-summary">
          <span>
            <strong className="mono-num">{sessionsThisWeek.length}</strong> sessions
          </span>
          <span>
            <strong className="mono-num">{view.taskCounts.doneThisWeek}</strong>{' '}
            {view.taskCounts.doneThisWeek === 1 ? 'task done' : 'tasks done'}
          </span>
          <span>
            <strong className="mono-num">{new Set(sessionsThisWeek.map((s) => s.session_date)).size}</strong> active days
          </span>
          <span>
            <strong className="mono-num">{formatMinutes(todayTime.studyMinutes)}</strong> today
          </span>
        </div>
      </SectionCard>

      {/* 6. Reference detail stays one tap away instead of filling the page. */}
      <details className="disclosure">
        <summary>More detail</summary>
        <div className="disclosure__body">
          <div className="dash-split">
            <SectionCard title="Upcoming deadlines" hint="Deadlines you entered">
              {dueSoonTasks.length === 0 ? (
                <p className="small muted">Nothing due in the next three days.</p>
              ) : (
                <div className="list">
                  {dueSoonTasks.map((task) => (
                    <div className="list-row" key={task.id}>
                      <div className="list-row__main">
                        <div className="list-row__title">{task.title}</div>
                        <div className="list-row__meta">
                          <span>due {task.due_date}</span>
                          <span>{task.estimated_minutes} min</span>
                        </div>
                      </div>
                      <Badge tone={task.due_date && task.due_date < today ? 'danger' : 'neutral'}>
                        {task.due_date && task.due_date < today ? 'Overdue' : 'Upcoming'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Recent results" hint="Entered marks only">
              {bundle.exams.length === 0 ? (
                <p className="small muted">No exam results entered yet.</p>
              ) : (
                <div className="list">
                  {[...bundle.exams]
                    .sort((a, b) => (a.exam_date < b.exam_date ? 1 : -1))
                    .slice(0, 3)
                    .map((exam) => {
                      const percent = exam.total_marks > 0 ? Math.round((exam.marks_obtained / exam.total_marks) * 1000) / 10 : null;
                      return (
                        <div className="list-row" key={exam.id}>
                          <div className="list-row__main">
                            <div className="list-row__title">{exam.exam_name}</div>
                            <div className="list-row__meta">
                              <span>{exam.exam_date}</span>
                              <span>{exam.marks_obtained}/{exam.total_marks}</span>
                            </div>
                          </div>
                          <Badge tone={percent !== null && percent < 50 ? 'danger' : percent !== null && percent >= 80 ? 'good' : 'neutral'}>
                            {percent !== null ? `${percent}%` : 'Not recorded'}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Needs attention" hint="Each item names the record behind it">
            {attentionChapters.length === 0 ? (
              <p className="small muted">
                <IonIcon icon={flaskOutline} aria-hidden="true" /> Nothing flagged from your records.
              </p>
            ) : (
              <div className="list">
                {attentionChapters.map(({ subject, chapter }) => {
                  const topFlag = chapter.progress.flags.find((f) => f.severity !== 'info');
                  return (
                    <div className="list-row" key={chapter.chapter.id}>
                      <div className="list-row__main">
                        <Link to={`/chapters/${chapter.chapter.id}`} className="list-row__title list-row__title--link">
                          {chapter.title}
                        </Link>
                        <div className="list-row__meta">
                          <span>{subject.label}</span>
                          {topFlag ? <span>{topFlag.reason}</span> : null}
                        </div>
                        <div className="row" style={{ marginTop: 6, gap: 8 }}>
                          <StatusBadge status={chapter.progress.status} />
                          <span className="tiny muted">
                            checklist {chapter.progress.checklist.done}/{chapter.progress.checklist.total}
                          </span>
                        </div>
                      </div>
                      <Link to={`/chapters/${chapter.chapter.id}`} className="btn btn--ghost btn--sm" aria-label={`Open ${chapter.title}`}>
                        <IonIcon icon={chevronForwardOutline} aria-hidden="true" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recorded totals" hint="Counts, not scores">
            <div className="totals-grid">
              <span>Checklist <strong className="mono-num">{view.totals.checklistDone}/{view.totals.checklistTotal}</strong></span>
              <span>Open difficult topics <strong className="mono-num">{view.totals.openDifficulties}</strong></span>
              <span>Latest exam <strong className="mono-num">{examPercentLabel}</strong></span>
              <span>Next exam <strong className="mono-num">{nextExam ? `${nextExam.daysRemaining} day(s)` : 'Not recorded'}</strong></span>
              <span>Lectures this week <strong className="mono-num">{weekLectures}</strong></span>
              <span>Chapters with records <strong className="mono-num">{view.totals.chaptersWithRecords}/{view.totals.chapters}</strong></span>
            </div>
          </SectionCard>
        </div>
      </details>

      <footer className="dash-foot">
        <DataFreshness lastRecordDate={view.lastRecordDate} now={today} />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          <IonIcon icon={alertCircleOutline} aria-hidden="true" /> Missing records say “not recorded”, never “you
          did not study”.
        </p>
      </footer>
    </div>
  );
}
