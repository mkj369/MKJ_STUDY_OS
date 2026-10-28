import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Notice, PageHeader, ProgressBar, SectionCard, StatCard } from '@/components/ui/Page';
import { useWorkspaceQuery } from '@/hooks/useWorkspace';
import { WorkspaceGate } from '@/features/shared/WorkspaceGate';
import { buildInsights } from '@/domain/insights';
import { buildRevisionQueue } from '@/domain/revisions';
import { buildTimeline, summarizeTime } from '@/domain/timeTracking';
import { addDaysISO, weekRange } from '@/domain/dates';
import { formatMinutes } from '@/domain/timeTracking';

function InsightsContent() {
  const { data } = useWorkspaceQuery();

  const prepared = useMemo(() => {
    if (!data) return null;
    const { bundle, view } = data;
    const todayEntries = buildTimeline(
      { sessions: bundle.sessions, blocks: bundle.dailyBlocks, subjectLabels: view.phase2.subjectLabels },
      view.today,
    );
    const weekStart = weekRange(view.today).start;
    const weekDates = Array.from({ length: 7 }, (_, index) => addDaysISO(weekStart, index));
    const weekEntries = weekDates.flatMap((date) =>
      buildTimeline({ sessions: bundle.sessions, blocks: bundle.dailyBlocks, subjectLabels: view.phase2.subjectLabels }, date),
    );
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
    const activeStudyDaysThisWeek = new Set(
      weekEntries.filter((entry) => entry.kind === 'study').map((entry) => entry.date),
    ).size;

    const insights = buildInsights({
      today: view.today,
      subjects: [...view.phase2.subjectCoverageById.values()],
      todayTime: summarizeTime(todayEntries),
      weekTime: summarizeTime(weekEntries),
      activeStudyDaysThisWeek,
      taskCounts: view.taskCounts,
      revisionQueue,
      mistakes: view.phase2.mistakeAnalysis,
      practice: view.phase2.practiceSummary,
      examCountdowns: view.phase2.countdowns,
      chaptersWithRecords: view.totals.chaptersWithRecords,
      chaptersTotal: view.totals.chapters,
      availabilityMinutesThisWeek: view.phase2.availabilityMinutesThisWeek,
    });
    return { insights, weekStart, weekEntries, revisionQueue };
  }, [data]);

  if (!data || !prepared) return null;
  const { insights, weekStart, weekEntries } = prepared;
  const { view } = data;
  const weekTime = summarizeTime(weekEntries);

  return (
    <>
      <PageHeader
        title="Progress insights"
        description="Four separate bands: what was recorded, what was calculated from it, what is only an interpretation, and what is missing. The bands are deterministic and work offline."
        actions={
          <Link to="/reports" className="btn btn--secondary btn--sm">
            AI coach &amp; weekly report
          </Link>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Study this week" value={formatMinutes(weekTime.studyMinutes)} hint={`week of ${weekStart}`} to="/time" />
        <StatCard label="Chapters with records" value={`${view.totals.chaptersWithRecords}/${view.totals.chapters}`} hint="Any lecture, session, revision or checklist tick" />
        <StatCard
          label="Accuracy"
          value={view.phase2.practiceSummary.accuracyPercent === null ? 'Not recorded' : `${view.phase2.practiceSummary.accuracyPercent}%`}
          hint={`${view.phase2.practiceSummary.gradedAttempts} graded attempt(s)`}
          to="/practice"
        />
        <StatCard label="Open errors" value={view.phase2.mistakeAnalysis.unresolved} hint="Unresolved mistake records" to="/weakness" />
      </div>

      {view.subjects.length === 0 ? (
        <SectionCard title="No subject recorded yet">
          <EmptyState
            title="Insights need records, not an empty screen"
            message="Add or adopt a subject, log one study session, and the observed band will fill in. Until then the app reports missing data instead of guessing."
          />
        </SectionCard>
      ) : null}

      <SectionCard title="1 · Observed" hint="Counts copied from your records. Nothing is inferred here.">
        <ul className="list">
          {insights.observed.map((item) => (
            <li key={item.label} className="list-row">
              <div className="list-row__main">
                <div className="list-row__title">
                  {item.label} <Badge tone="good">{item.value}</Badge>
                </div>
                <div className="list-row__meta">
                  {item.evidence.length === 0 ? <span>No supporting detail</span> : item.evidence.map((line) => <span key={line}>{line}</span>)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="2 · Calculated" hint="Arithmetic over the observations, with the denominator shown.">
        <ul className="list">
          {insights.calculated.map((item) => (
            <li key={item.label} className="list-row">
              <div className="list-row__main">
                <div className="list-row__title">
                  {item.label} <Badge tone="info">{item.value}</Badge>
                </div>
                <div className="list-row__meta">
                  {item.evidence.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {view.phase2.subjectCoverageById.size > 0 ? (
          <div className="grid grid--two">
            {[...view.phase2.subjectCoverageById.values()].map((coverage) => {
              const label = view.phase2.subjectLabels[coverage.subjectId] ?? 'Subject';
              return (
                <ProgressBar
                  key={coverage.subjectId}
                  percent={coverage.chapterPercent}
                  done={coverage.chaptersComplete}
                  total={coverage.chapters}
                  label={`${label} chapters`}
                />
              );
            })}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="3 · Interpretation" hint="Labelled guesses with their evidence and a caveat. Not facts.">
        {insights.interpretations.length === 0 ? (
          <p className="small muted">No interpretation is supported by these records.</p>
        ) : (
          <ul className="list">
            {insights.interpretations.map((item) => (
              <li key={item.statement} className="list-row">
                <div className="list-row__main">
                  <div className="list-row__title">
                    {item.statement} <Badge tone="warn">interpretation · {item.confidence} confidence</Badge>
                  </div>
                  <div className="list-row__meta">
                    {item.evidence.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                  <p className="tiny muted">{item.caveat}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="4 · Missing" hint="Unknown is not the same as zero, and missing is not failure.">
        <ul className="list">
          {insights.missing.map((item) => (
            <li key={item} className="list-row">
              <div className="list-row__main">
                <div className="list-row__title">{item}</div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Evidence-based next steps" hint="Each step names the record that produced it.">
        <ul className="list">
          {insights.nextSteps.map((step) => (
            <li key={step.title} className="list-row">
              <div className="list-row__main">
                <div className="list-row__title">{step.title}</div>
                <div className="list-row__meta">
                  <span>{step.why}</span>
                  {step.evidence.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <Notice tone="neutral">
        AI recommendations are separate, optional and server-side. The weekly report on the Reports page labels anything
        produced by AI, lists its evidence, and works fully without the AI provider.
      </Notice>
    </>
  );
}

export function InsightsPage() {
  return <WorkspaceGate>{() => <InsightsContent />}</WorkspaceGate>;
}
