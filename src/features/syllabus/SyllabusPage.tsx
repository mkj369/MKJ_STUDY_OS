/**
 * Syllabus tracker dashboard (the redesign).
 *
 * Gate → overview ring → subject cards → recent activity. Every number comes
 * from the workspace view (real records); nothing is mocked. The detailed
 * topic matrix lives on at /syllabus/topics.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import {
  addOutline,
  chevronForwardOutline,
  flagOutline,
  gridOutline,
  schoolOutline,
  settingsOutline,
} from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, DemoBadge, EmptyState, Notice, PageHeader, ProgressBar, SectionCard } from '@/components/ui/Page';
import { PageSkeleton } from '@/components/ui/BrandLoader';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { userSubjectSchema, type SubjectFormValues } from '@/domain/schemas';
import { TRACK_LABELS, type AcademicTrack } from '@/domain/tracks';
import { addDaysISO, weekRange } from '@/domain/dates';
import { subjectChapterStats } from '@/features/shared/selectors';
import { formatMinutes } from '@/domain/timeTracking';
import { errorMessage } from '@/utils/errors';

export function ProgressRing({ percent, sub }: { percent: number; sub?: string }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress-ring" role="img" aria-label={`Overall syllabus progress ${clamped} percent`}>
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
        <circle className="progress-ring__track" cx="55" cy="55" r={radius} fill="none" strokeWidth="9" />
        <circle
          className="progress-ring__fill"
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div className="progress-ring__label">
        <span className="progress-ring__pct">{clamped}%</span>
        {sub ? <span className="progress-ring__sub">{sub}</span> : null}
      </div>
    </div>
  );
}

function SetupGateCard() {
  return (
    <>
      <PageHeader
        title="Syllabus tracker"
        description="Set up your class, group and subjects once — then track every chapter with real checklists."
      />
      <SectionCard>
        <EmptyState
          icon={<IonIcon icon={schoolOutline} aria-hidden="true" />}
          title="Set up your academics first"
          message="Choose your track (SSC / HSC / HSC Admission), group and subjects. It takes a minute, and you can change everything later without losing progress."
          action={
            <Link to="/setup" className="btn btn--primary">
              Start academic setup
            </Link>
          }
        />
      </SectionCard>
    </>
  );
}

function SyllabusContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [subjectDialog, setSubjectDialog] = useState(false);

  if (!data) return <PageSkeleton />;
  const { view } = data;

  if (!view.setupCompleted) return <SetupGateCard />;

  const overview = view.syllabusOverview;
  const profile = view.profile;
  const track = profile.academic_track as AcademicTrack | null;
  const activeTargets = view.targets.filter((t) => t.progress.state === 'active' || t.progress.state === 'overdue');

  // Daily / weekly study activity — computed from real session records only.
  const week = weekRange(view.today);
  const sessions = data.bundle.sessions;
  const minutesToday = sessions
    .filter((s) => s.session_date === view.today)
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const minutesThisWeek = sessions
    .filter((s) => s.session_date >= week.start && s.session_date <= week.end)
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const last7 = Array.from({ length: 7 }, (_, i) => addDaysISO(view.today, i - 6)).map((date) => ({
    date,
    minutes: sessions.filter((s) => s.session_date === date).reduce((sum, s) => sum + s.duration_minutes, 0),
  }));
  const maxDayMinutes = Math.max(1, ...last7.map((d) => d.minutes));
  const recentSessions = sessions
    .slice()
    .sort((a, b) => b.session_date.localeCompare(a.session_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  const createSubject = async (values: SubjectFormValues) => {
    try {
      await mutate((repo) =>
        repo.create('user_subjects', {
          curriculum_subject_id: null,
          curriculum_version_id: null,
          custom_name: values.custom_name ?? 'My subject',
          custom_paper_label: values.custom_paper_label ?? null,
          status: 'active',
          color: values.color,
          sort_order: view.subjects.length + 1,
          is_demo: false,
        }),
      );
      setSubjectDialog(false);
      await notify('Subject created.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Syllabus tracker"
        description={
          track
            ? `${TRACK_LABELS[track]}${profile.study_group ? ` · ${profile.study_group}` : ''}${profile.academic_session ? ` · ${profile.academic_session}` : ''}`
            : 'Your subjects and chapters, measured from real records.'
        }
        actions={
          <>
            <Link to="/setup" className="btn btn--ghost btn--sm" aria-label="Edit academic setup">
              <IonIcon icon={settingsOutline} aria-hidden="true" /> Setup
            </Link>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setSubjectDialog(true)}>
              <IonIcon icon={addOutline} aria-hidden="true" /> Subject
            </button>
          </>
        }
        meta={view.demoActive ? <DemoBadge /> : undefined}
      />

      <SectionCard>
        <div className="progress-hero">
          <ProgressRing percent={overview.overallPercent} sub="complete" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="strong" style={{ margin: '0 0 6px' }}>
              {overview.chaptersComplete} of {overview.chaptersCounted} chapters complete
              {overview.chaptersSkipped > 0 ? ` (${overview.chaptersSkipped} skipped, not counted)` : ''}
            </p>
            <div className="chip-row" style={{ marginBottom: 10 }}>
              <Badge tone="good">{overview.chaptersComplete} complete</Badge>
              <Badge tone="info">{overview.chaptersInProgress} in progress</Badge>
              <Badge tone="neutral">{overview.chaptersNotStarted} not started</Badge>
              <Badge tone="warn">{overview.chaptersRemaining} remaining</Badge>
              {overview.chaptersSkipped > 0 ? <Badge tone="neutral">{overview.chaptersSkipped} skipped</Badge> : null}
            </div>
            <ProgressBar
              percent={overview.checklistTotal === 0 ? 0 : Math.round((overview.checklistDone / overview.checklistTotal) * 100)}
              label={`Checklist items: ${overview.checklistDone}/${overview.checklistTotal}`}
            />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              “Complete” follows your recorded evidence and status rules — a chapter is never auto-completed by
              ticking boxes alone.
            </p>
          </div>
        </div>
      </SectionCard>

      {activeTargets.length > 0 ? (
        <SectionCard
          title="Active targets"
          hint="Weekly & monthly goals"
          action={<Link className="btn btn--ghost btn--sm" to="/targets">All targets</Link>}
        >
          <div className="stack stack--tight">
            {activeTargets.slice(0, 3).map(({ target, progress, subjectLabel }) => (
              <div key={target.id}>
                <div className="row row--between">
                  <span className="small strong">
                    <IonIcon icon={flagOutline} aria-hidden="true" /> {target.title}
                    {subjectLabel ? <span className="muted"> · {subjectLabel}</span> : null}
                  </span>
                  <span className="small">
                    {progress.current}/{progress.goal}
                    {progress.state === 'overdue' ? <Badge tone="danger">overdue</Badge> : null}
                  </span>
                </div>
                <ProgressBar percent={progress.percent} label={`${target.title} progress`} />
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Study activity" hint="From your recorded sessions — never estimated">
        <div className="stat-strip">
          <div className="stat-strip__item">
            <span className="eyebrow">Today</span>
            <span className="strong">{formatMinutes(minutesToday)}</span>
          </div>
          <div className="stat-strip__item">
            <span className="eyebrow">This week</span>
            <span className="strong">{formatMinutes(minutesThisWeek)}</span>
          </div>
          <div className="stat-strip__item">
            <span className="eyebrow">Sessions</span>
            <span className="strong">{sessions.length}</span>
          </div>
        </div>
        <div className="activity-bars" role="img" aria-label={`Study minutes per day, last 7 days: ${last7.map((d) => `${d.date}: ${d.minutes} minutes`).join(', ')}`}>
          {last7.map((day) => (
            <div key={day.date} className="activity-bars__col" title={`${day.date}: ${day.minutes} min`}>
              <div className="activity-bars__bar" style={{ height: `${Math.max(4, Math.round((day.minutes / maxDayMinutes) * 56))}px`, opacity: day.minutes === 0 ? 0.25 : 1 }} />
              <span className="tiny muted">{day.date.slice(8)}</span>
            </div>
          ))}
        </div>
        {recentSessions.length > 0 ? (
          <div className="stack stack--tight" style={{ marginTop: 12 }}>
            {recentSessions.map((session) => (
              <div key={session.id} className="list-row">
                <div style={{ flex: 1 }}>
                  <div className="list-row__title">
                    {session.session_date} · {session.activity_type.replace(/_/g, ' ')}
                    {session.user_chapter_id && view.phase2.chapterTitles[session.user_chapter_id]
                      ? ` · ${view.phase2.chapterTitles[session.user_chapter_id]}`
                      : ''}
                  </div>
                  <span className="tiny muted">
                    {view.phase2.subjectLabels[session.user_subject_id] ?? 'Subject'} · {formatMinutes(session.duration_minutes)}
                  </span>
                </div>
              </div>
            ))}
            <Link to="/sessions" className="btn btn--ghost btn--sm">Full history</Link>
          </div>
        ) : (
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            No sessions recorded yet. Start the Focus timer or log a session — activity appears here from real records.
          </p>
        )}
      </SectionCard>

      {view.subjects.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<IonIcon icon={schoolOutline} aria-hidden="true" />}
            title="No subjects yet"
            message="Adopt subjects from your curriculum, or create your own. Chapter lists stay empty until you add or import verified chapters — nothing is invented."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/curriculum" className="btn btn--primary btn--sm">Open My Curriculum</Link>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSubjectDialog(true)}>
                  Create subject
                </button>
              </div>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Subjects"
          hint="Tap a subject for its compact chapter list"
          action={
            <Link to="/syllabus/topics" className="btn btn--ghost btn--sm">
              <IonIcon icon={gridOutline} aria-hidden="true" /> Topic matrix
            </Link>
          }
        >
          <div className="subject-grid">
            {view.subjects.map((subject) => {
              const { complete, counted, percent } = subjectChapterStats(subject.chapters);
              return (
                <Link key={subject.subject.id} to={`/subjects/${subject.subject.id}`} className="subject-card">
                  <div className="subject-card__top">
                    <span className="subject-card__dot" style={{ background: subject.color }} aria-hidden="true" />
                    <span className="subject-card__name">{subject.label}</span>
                    <IonIcon icon={chevronForwardOutline} aria-hidden="true" />
                  </div>
                  <ProgressBar percent={percent} label={`${subject.label} chapter completion`} />
                  <div className="subject-card__stats">
                    <span>{complete}/{counted} chapters</span>
                    <span>{percent}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionCard>
      )}

      <Notice tone="info" title="Where do chapter names come from?">
        The HSC Science chapter list is imported from the public reference tracker (128 chapters, source recorded on
        every row) and stays marked <strong>needs verification</strong> until checked against NCTB textbooks. Other
        levels are structure-only. You can also add chapters yourself. Percentages always reflect your own records.
      </Notice>

      {subjectDialog ? (
        <RecordDialog<SubjectFormValues>
          title="Create a subject"
          description="For coaching or personal subjects outside the recorded curriculum."
          schema={userSubjectSchema}
          defaultValues={{ mode: 'custom', custom_name: '', custom_paper_label: '', color: '#0f5132' }}
          submitLabel="Create subject"
          fields={[
            { name: 'custom_name', label: 'Subject name', type: 'text' },
            { name: 'custom_paper_label', label: 'Paper label', type: 'text', optional: true },
            { name: 'color', label: 'Colour', type: 'text', help: 'Any CSS colour, e.g. #1d4ed8.' },
          ]}
          onSubmit={createSubject}
          onClose={() => setSubjectDialog(false)}
        />
      ) : null}

    </>
  );
}

export function SyllabusPage() {
  return <WorkspaceGate>{() => <SyllabusContent />}</WorkspaceGate>;
}
