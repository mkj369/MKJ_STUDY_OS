import { Link, useNavigate } from 'react-router-dom';
import { useIonToast, IonIcon } from '@ionic/react';
import {
  addOutline,
  alertCircleOutline,
  calendarOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  flaskOutline,
  refreshOutline,
  timeOutline,
} from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { useAuth } from '@/app/AppProviders';
import {
  Badge,
  DataFreshness,
  DemoBadge,
  EmptyState,
  Notice,
  ProgressBar,
  SectionCard,
  StatCard,
  StatusBadge,
} from '@/components/ui/Page';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { minutesToHuman, weekRange, addDaysISO, diffDaysISO } from '@/domain/dates';
import { PRIORITY_WEIGHT } from '@/domain/tasks';
import { buildTimeline, formatMinutes, summarizeTime } from '@/domain/timeTracking';
import { errorMessage } from '@/utils/errors';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useWorkspaceQuery();
  const mutate = useMutate();
  const auth = useAuth();
  const navigate = useNavigate();
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

  const { view, bundle } = data;
  const today = view.today;
  const week = weekRange(today);
  const sessionsThisWeek = bundle.sessions.filter(
    (session) => session.session_date >= week.start && session.session_date <= week.end,
  );
  const weekMinutes = sessionsThisWeek.reduce((sum, session) => sum + session.duration_minutes, 0);
  const weekLectures = bundle.lectures.filter((l) => l.lecture_date >= week.start && l.lecture_date <= week.end).length;
  const profile = bundle.profile;
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
      await toast({ message: 'Task marked done.', duration: 1500, color: 'success', position: 'bottom' });
    } catch (taskError) {
      await toast({ message: errorMessage(taskError), duration: 2500, color: 'danger', position: 'bottom' });
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
      await toast({ message: 'Demo data loaded and labelled.', duration: 2000, color: 'success', position: 'bottom' });
    } catch (demoError) {
      await toast({ message: errorMessage(demoError), duration: 2500, color: 'danger', position: 'bottom' });
    }
  };

  if (view.totals.subjects === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Welcome, {displayName}</h1>
            <p>
              MKJ StudyOS remembers what you record, shows what is still unknown, and helps you choose the
              next useful action.
            </p>
          </div>
        </div>
        <SectionCard title="Start with one subject">
          <EmptyState
            icon={<IonIcon icon={addOutline} aria-hidden="true" />}
            title="Your workspace is empty"
            message="Add an HSC Science subject from the starter curriculum, create your own subject, or load clearly-labelled demo data to explore the workflow."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/curriculum" className="btn btn--primary">
                  Choose subjects
                </Link>
                <button type="button" className="btn btn--secondary" onClick={loadDemo}>
                  Load demo data
                </button>
              </div>
            }
          />
        </SectionCard>
        <div style={{ height: 12 }} />
        <Notice tone="neutral" title="What this app will not do.">
          It will not invent study history, lecture counts, marks or predicted results. Missing records always
          say “not recorded”, never “you did not study”.
        </Notice>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good to see you, {displayName}</h1>
          <p>
            Today is {today} ({profile.timezone || 'Asia/Dhaka'}) · Everything below comes from records you
            entered.
          </p>
        </div>
        <div className="row">
          <Link to="/lectures" className="btn btn--primary btn--sm">
            <IonIcon icon={addOutline} aria-hidden="true" /> Log a lecture
          </Link>
          <Link to="/sessions" className="btn btn--secondary btn--sm">
            Log study time
          </Link>
        </div>
      </div>

      {view.demoActive ? (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="warn" title="Demo data is loaded.">
            Every demo row is labelled <DemoBadge />. Remove it from{' '}
            <Link to="/settings">Settings → Data</Link> before entering real records.{' '}
            <button type="button" className="link-button" onClick={() => navigate('/settings')}>
              Manage
            </button>
          </Notice>
        </div>
      ) : null}

      <div className="grid grid--stats">
        <StatCard
          label="Today’s tasks"
          value={view.dashboardTasks.length}
          hint={
            view.taskCounts.overdue > 0
              ? `${view.taskCounts.overdue} overdue — reschedule without guilt`
              : 'Planned or due today'
          }
          to="/tasks"
          badge={view.taskCounts.overdue > 0 ? <Badge tone="warn">Overdue</Badge> : null}
        />
        <StatCard
          label="Study recorded this week"
          value={minutesToHuman(weekMinutes)}
          hint={`${sessionsThisWeek.length} session${sessionsThisWeek.length === 1 ? '' : 's'} logged · time is not proof of learning`}
          to="/sessions"
        />
        <StatCard
          label="Study time today"
          value={todayTime.studyMinutes > 0 ? formatMinutes(todayTime.studyMinutes) : 'Not recorded'}
          hint={
            todayTime.otherMinutes > 0
              ? `${formatMinutes(todayTime.otherMinutes)} of other blocks (college, sleep, breaks…)`
              : 'From study sessions only'
          }
          to="/time"
        />
        <StatCard
          label="Next exam"
          value={nextExam ? `${nextExam.daysRemaining} day(s)` : 'Not recorded'}
          hint={nextExam ? `${nextExam.title} · ${nextExam.examDate}` : 'Add an exam target to see a countdown'}
          to="/exams/prep"
        />
        <StatCard
          label="Checklist completion"
          value={view.totals.checklistTotal > 0 ? `${Math.round((view.totals.checklistDone / view.totals.checklistTotal) * 100)}%` : '—'}
          hint={`${view.totals.checklistDone} of ${view.totals.checklistTotal} items · separate from mastery`}
          to="/subjects"
        />
        <StatCard
          label="Revisions due"
          value={dueRevisions.length}
          hint={dueRevisions.length === 0 ? 'Nothing due from recorded revisions' : 'Based on your own review dates'}
          to="/revisions"
          badge={dueRevisions.some((r) => r.bucket === 'overdue') ? <Badge tone="danger">Overdue</Badge> : null}
        />
        <StatCard
          label="Open difficult topics"
          value={view.totals.openDifficulties}
          hint="Only topics you marked"
          to="/difficulties"
        />
        <StatCard label="Latest exam result" value={examPercentLabel} hint={`${view.examSummary.count} result(s) recorded`} to="/exams" />
      </div>

      <div style={{ height: 16 }} />

      <div className="grid grid--two">
        <SectionCard
          title="Next useful action"
          hint="Derived from deadlines, evidence and your own priorities"
          action={
            <Link to="/tasks" className="btn btn--ghost btn--sm">
              All tasks
            </Link>
          }
        >
          {nextAction ? (
            <div className="stack">
              <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                <div>
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
              {nextAction.gap_reason ? (
                <Notice tone="info" title="Why this is suggested:">
                  {nextAction.gap_reason}
                </Notice>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={<IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />}
              title="No open task right now"
              message="That is allowed. Plan a small next step only if it helps — rest is part of a sustainable plan."
              action={
                <Link to="/tasks" className="btn btn--secondary btn--sm">
                  Plan a task
                </Link>
              }
            />
          )}
          {view.dashboardTasks.length > 1 ? (
            <>
              <div className="divider" />
              <p className="tiny muted">
                {view.dashboardTasks.length - 1} more task(s) planned or due today.{' '}
                <Link to="/tasks">Open the planner</Link>
              </p>
            </>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Revision queue"
          hint="From your own review dates and confidence ratings"
          action={
            <Link to="/revisions" className="btn btn--ghost btn--sm">
              Open
            </Link>
          }
        >
          {dueRevisions.length === 0 && upcomingRevisions.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={refreshOutline} aria-hidden="true" />}
              title="No revisions recorded as due"
              message="Log a revision and the app will suggest a next review date from your confidence rating."
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
                      <span>{entry.summary.nextDateSource === 'suggested' ? 'suggested review' : 'review date'} {entry.summary.nextDate}</span>
                      <span>confidence {entry.summary.lastConfidence ?? '—'}/5</span>
                    </div>
                  </div>
                  <Badge tone={entry.bucket === 'overdue' ? 'danger' : 'warn'}>
                    {entry.bucket === 'overdue' ? `${Math.abs(entry.daysUntilDue)}d overdue` : 'Due today'}
                  </Badge>
                </div>
              ))}
              {upcomingRevisions.map((entry) => (
                <div className="list-row" key={`up-${entry.userChapterId}`}>
                  <div className="list-row__main">
                    <div className="list-row__title">{entry.chapterTitle}</div>
                    <div className="list-row__meta">
                      <span>{entry.subjectName}</span>
                      <span>due in {entry.daysUntilDue} day(s)</span>
                    </div>
                  </div>
                  <Badge tone="info">Soon</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ height: 16 }} />

      <div className="grid grid--two">
        <SectionCard title="Needs attention" hint="Each item names the record behind it">
          {attentionChapters.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={flaskOutline} aria-hidden="true" />}
              title="No evidence-based gap flagged"
              message="The app only flags gaps supported by your records. Keep logging what you actually do."
            />
          ) : (
            <div className="list">
              {attentionChapters.map(({ subject, chapter }) => {
                const topFlag = chapter.progress.flags.find((f) => f.severity !== 'info');
                return (
                  <div className="list-row" key={chapter.chapter.id}>
                    <div className="list-row__main">
                      <div className="list-row__title">
                        <Link to={`/chapters/${chapter.chapter.id}`} style={{ color: 'inherit' }}>
                          {chapter.title}
                        </Link>
                      </div>
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
                      <IonIcon icon={chevronForwardOutline} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="This week at a glance"
          hint={`Week ${week.start} → ${week.end}`}
          action={
            <Link to="/reports" className="btn btn--ghost btn--sm">
              Report
            </Link>
          }
        >
          <div className="stack">
            <div>
              <div className="row row--between">
                <span className="small">Checklist items ticked</span>
                <span className="small strong mono-num">{view.totals.checklistDone}/{view.totals.checklistTotal}</span>
              </div>
              <ProgressBar
                percent={
                  view.totals.checklistTotal > 0
                    ? (view.totals.checklistDone / view.totals.checklistTotal) * 100
                    : null
                }
                label="All chapters"
                done={view.totals.checklistDone}
                total={view.totals.checklistTotal}
              />
            </div>
            <div className="divider" />
            <div className="row row--between small">
              <span>Lectures recorded this week</span>
              <span className="strong">{weekLectures}</span>
            </div>
            <div className="row row--between small">
              <span>Tasks completed</span>
              <span className="strong">{view.taskCounts.doneThisWeek}</span>
            </div>
            <div className="row row--between small">
              <span>Active days</span>
              <span className="strong">{new Set(sessionsThisWeek.map((s) => s.session_date)).size}</span>
            </div>
            <div className="row row--between small">
              <span>Subjects with records</span>
              <span className="strong">
                {view.subjects.filter((s) => s.progress.lastActivityDate !== null).length}/{view.totals.subjects}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <div style={{ height: 16 }} />

      <SectionCard
        title="Upcoming deadlines"
        hint="Deadlines you entered. Nothing here is invented."
        action={
          <Link to="/tasks" className="btn btn--ghost btn--sm">
            Planner
          </Link>
        }
      >
        {dueSoonTasks.length === 0 ? (
          <p className="small muted">No task has a deadline in the next three days.</p>
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

      <div style={{ height: 16 }} />

      <SectionCard title="Recent exams & results" hint="Entered marks only; no predictions">
        {bundle.exams.length === 0 ? (
          <p className="small muted">No exam results entered yet.</p>
        ) : (
          <div className="list">
            {[...bundle.exams]
              .sort((a, b) => (a.exam_date < b.exam_date ? 1 : -1))
              .slice(0, 3)
              .map((exam) => {
                const percent = exam.total_marks > 0 ? Math.round((exam.marks_obtained / exam.total_marks) * 1000) / 10 : null;
                const subject = view.subjectById.get(exam.user_subject_id ?? '');
                return (
                  <div className="list-row" key={exam.id}>
                    <div className="list-row__main">
                      <div className="list-row__title">{exam.exam_name}</div>
                      <div className="list-row__meta">
                        <span>{exam.exam_date}</span>
                        {subject ? <span>{subject.label}</span> : null}
                        <span>
                          {exam.marks_obtained}/{exam.total_marks}
                        </span>
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

      <div style={{ height: 14 }} />
      <DataFreshness lastRecordDate={view.lastRecordDate} now={today} />
      <p className="tiny muted" style={{ marginTop: 4 }}>
        <IonIcon icon={alertCircleOutline} aria-hidden="true" /> Need to catch up? Missing records never lower
        your progress; they only mark information as unknown. Add records when you can.
      </p>
      <div style={{ height: 8 }} />
      <p className="tiny muted">
        Logged {addDaysISO(today, 0)} · local time zone {profile.timezone || 'Asia/Dhaka'} · synced mode:{' '}
        {auth.mode === 'cloud' ? 'Supabase cloud' : 'browser storage'}
      </p>
    </>
  );
}
