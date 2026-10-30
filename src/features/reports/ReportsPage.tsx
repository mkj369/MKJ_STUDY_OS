import { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addOutline, sparklesOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { useServices } from '@/app/AppProviders';
import { useI18n } from '@/i18n';
import { Badge, EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { buildWeeklyReport, type WeeklyReportPayload } from '@/domain/reports';
import { scopeBundleToClass } from '@/domain/classScope';
import { addDaysISO, formatDateTime, weekRange } from '@/domain/dates';
import { errorMessage } from '@/utils/errors';
import type { AIStatus } from '@/services/ai/aiClient';

function ReportBody({ payload, source }: { payload: WeeklyReportPayload; source: string }) {
  return (
    <div className="weekly-report">
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          {/* A sentence, not a heading: it describes the week, so it must not
              enter the document outline as a section title. */}
          <p className="report-summary">{payload.summary}</p>
          <p className="tiny muted">
            {source} · generated {formatDateTime(payload.generated_at)} · week {payload.week.start} → {payload.week.end}
          </p>
        </div>
        <Badge tone={source.startsWith('AI') ? 'info' : 'good'}>{source}</Badge>
      </div>

      <div>
        <h3 className="report-section-title">Observed facts</h3>
        <ul className="report-list">
          {payload.observed_facts.map((fact) => (
            <li key={fact.label}>
              <strong>{fact.label}:</strong> {fact.value}
              {fact.evidence.length > 0 ? (
                <div className="tiny muted">Evidence: {fact.evidence.join(' · ')}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="report-section-title">Possible gaps (evidence-based)</h3>
        {payload.possible_gaps.length === 0 ? (
          <p className="small muted">No gap is supported by this week’s records.</p>
        ) : (
          <ul className="report-list">
            {payload.possible_gaps.map((gap) => (
              <li key={gap.key}>
                <strong>{gap.label}</strong>{' '}
                <Badge tone={gap.severity === 'high' ? 'danger' : gap.severity === 'attention' ? 'warn' : 'neutral'}>
                  {gap.severity}
                </Badge>
                <div className="small muted">{gap.reason}</div>
                {gap.evidence.length > 0 ? <div className="tiny muted">Evidence: {gap.evidence.join(' · ')}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Recommended next actions</h3>
        <ol className="report-list">
          {payload.recommendations.map((recommendation) => (
            <li key={recommendation.key}>
              <strong>{recommendation.title}</strong> <Badge tone="neutral">{recommendation.priority}</Badge>
              <div className="small muted">Why: {recommendation.why}</div>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3>Suggested tasks</h3>
        {payload.suggested_tasks.length === 0 ? (
          <p className="small muted">No task suggested from this week’s evidence.</p>
        ) : (
          <ul className="report-list">
            {payload.suggested_tasks.map((task) => (
              <li key={task.key}>
                {task.title} · {task.estimated_minutes} min · {task.priority}
                <div className="tiny muted">{task.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Missing information</h3>
        <ul className="report-list">
          {payload.missing_data.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <Notice tone="neutral">{payload.disclaimer}</Notice>
    </div>
  );
}

function ReportsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const services = useServices();
  const { locale } = useI18n();
  const [weekOffset, setWeekOffset] = useState(0);
  const [aiPayload, setAiPayload] = useState<WeeklyReportPayload | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const queryClient = useQueryClient();
  const aiProvider = services.getAIProvider();
  const aiStatusQuery = useQuery<AIStatus>({
    queryKey: ['ai-status', services.config.mode],
    queryFn: () => aiProvider.status(),
    staleTime: 60_000,
  });

  const report = useMemo(() => {
    if (!data) return null;
    const { view } = data;
    /*
     * Class-scoped projection: a Class 9 session must never be counted in a
     * Class 11 week. Records with no subject stay (they belong to no class).
     */
    const bundle = scopeBundleToClass(data.bundle, view.profileClass);
    const weekStart = addDaysISO(view.today, weekOffset * 7);
    return buildWeeklyReport({
      weekStart,
      today: view.today,
      subjects: bundle.subjects,
      chapters: bundle.chapters,
      curriculumChapters: bundle.curriculum.chapters,
      curriculumSubjects: bundle.curriculum.subjects,
      checklistItems: bundle.checklistItems,
      checklistProgress: bundle.checklistProgress,
      lectures: bundle.lectures,
      sessions: bundle.sessions,
      revisions: bundle.revisions,
      difficulties: bundle.difficulties,
      mistakes: bundle.mistakes,
      tasks: bundle.tasks,
      exams: bundle.exams,
    });
  }, [data, weekOffset]);

  if (!data || !report) return null;
  const { scoped: bundle, view } = data;
  const payload = report.payload;
  const week = weekRange(payload.week.start);

  const saveDeterministic = async () => {
    setSaving(true);
    try {
      await mutate((repo) =>
        repo.saveSummary({
          week_start: payload.week.start,
          week_end: payload.week.end,
          source: 'deterministic',
          status: 'complete',
          payload,
          provider: null,
          model: null,
          prompt_version: 'deterministic-v1',
          error_code: null,
        }),
      );
      await notify('Weekly report saved to your account.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const addSuggestedTask = async (task: WeeklyReportPayload['suggested_tasks'][number]) => {
    try {
      await mutate((repo) =>
        repo.create('study_tasks', {
          title: task.title,
          description: task.reason,
          user_subject_id: task.user_subject_id ?? null,
          user_chapter_id: task.user_chapter_id ?? null,
          estimated_minutes: task.estimated_minutes,
          priority: task.priority,
          status: 'todo',
          due_date: addDaysISO(view.today, 2),
          planned_date: null,
          origin: 'rule',
          source_report_id: null,
          gap_reason: task.reason,
          carried_over_count: 0,
          completed_at: null,
          is_demo: false,
        }),
      );
      await notify('Task added from the report.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const generateAi = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await aiProvider.generateWeeklyReport({
        weekStart: payload.week.start,
        weekEnd: payload.week.end,
        timezone: bundle.profile.timezone || 'Asia/Dhaka',
        locale,
      });
      if (!result.ok) {
        setAiError(result.message);
        await mutate((repo) =>
          repo.saveSummary({
            week_start: payload.week.start,
            week_end: payload.week.end,
            source: 'ai',
            status: 'fallback',
            payload,
            provider: null,
            model: null,
            prompt_version: 'weekly-summary-v1',
            error_code: result.code,
          }),
        );
        return;
      }
      setAiPayload(result.payload);
      // The Edge Function already stored the report; refresh the workspace view.
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      await notify('AI narrative generated and saved, with the deterministic report kept alongside it.');
    } catch (error) {
      setAiError(errorMessage(error));
    } finally {
      setAiBusy(false);
    }
  };

  const savedForWeek = bundle.summaries.filter((summary) => summary.week_start === payload.week.start);

  return (
    <>
      <PageHeader
        title="AI Coach & Reports"
        description="A deterministic weekly report works with AI switched off. AI only adds a narrative on top of the same recorded data."
        actions={
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWeekOffset((v) => v - 1)} aria-label="Previous week">
              ←
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              This week
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setWeekOffset((v) => v + 1)}
              disabled={weekOffset >= 0}
              aria-label="Next week"
            >
              →
            </button>
          </div>
        }
      />

      <Notice tone="neutral" title={`Week ${week.start} → ${week.end}.`}>
        Missing records mean “not recorded”, not “not studied”. Nothing in this report predicts exam marks or
        invents study history.
      </Notice>

      <div style={{ height: 16 }} />

      <SectionCard
        title="Deterministic weekly report"
        hint="Built from your records; every number has a denominator"
        action={
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void saveDeterministic()} disabled={saving}>
              {saving ? 'Saving…' : 'Save report'}
            </button>
          </div>
        }
      >
        <ReportBody payload={payload} source="Deterministic" />
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard
        title="AI weekly narrative (optional)"
        hint="Server-side only. The provider key never reaches this app."
        action={<IonIcon icon={sparklesOutline} aria-hidden="true" style={{ fontSize: 22, color: 'var(--mkj-accent)' }} />}
      >
        <div className="stack">
          {aiStatusQuery.isLoading ? (
            <p className="small muted">Checking AI configuration…</p>
          ) : aiStatusQuery.data ? (
            <Notice tone={aiStatusQuery.data.available ? 'info' : 'neutral'} title={aiStatusQuery.data.available ? 'AI configured.' : 'AI not configured.'}>
              {aiStatusQuery.data.reason}
            </Notice>
          ) : null}

          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void generateAi()}
              disabled={aiBusy || !(aiStatusQuery.data?.available ?? false)}
            >
              {aiBusy ? 'Generating…' : 'Generate AI narrative'}
            </button>
            <span className="tiny muted">Rate-limited server-side; timeout and malformed output are rejected.</span>
          </div>

          {aiError ? (
            <Notice tone="warn" title="AI unavailable — deterministic report is still complete.">
              {aiError}
            </Notice>
          ) : null}

          {aiPayload ? (
            <div>
              <h3 style={{ marginBottom: 8 }}>AI narrative</h3>
              <ReportBody payload={aiPayload} source="AI-assisted" />
            </div>
          ) : (
            <p className="small muted">
              No AI narrative generated for this week yet. Add AI keys server-side to enable it; everything below
              works without it.
            </p>
          )}

          <Notice tone="neutral">
            AI output is labelled as interpretation, not fact. The app validates every field and keeps the
            deterministic report as the source of truth.
          </Notice>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Suggested next tasks" hint="Create any of these as real tasks; nothing is created automatically">
        {payload.suggested_tasks.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={sparklesOutline} aria-hidden="true" />}
            title="No suggestion from recorded evidence"
            message="The app will not invent a task. Add records or plan manually if you want to study."
          />
        ) : (
          <div className="list">
            {payload.suggested_tasks.map((task) => (
              <div className="list-row" key={task.key}>
                <div className="list-row__main">
                  <div className="list-row__title">{task.title}</div>
                  <div className="list-row__meta">
                    <span>{task.estimated_minutes} min</span>
                    <span>{task.priority} priority</span>
                    <span>{task.reason}</span>
                  </div>
                </div>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => void addSuggestedTask(task)}>
                  <IonIcon icon={addOutline} aria-hidden="true" /> Add task
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Saved reports" hint={`${savedForWeek.length} saved for this week`}>
        {bundle.summaries.length === 0 ? (
          <p className="small muted">No saved reports yet. Saving keeps a dated snapshot of the numbers.</p>
        ) : (
          <div className="list">
            {[...bundle.summaries]
              .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
              .slice(0, 8)
              .map((summary) => (
                <div className="list-row" key={summary.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {summary.week_start} → {summary.week_end}
                    </div>
                    <div className="list-row__meta">
                      <span>{summary.source === 'ai' ? 'AI-assisted' : 'Deterministic'}</span>
                      <span>{summary.status}</span>
                      {summary.model ? <span>{summary.provider} · {summary.model}</span> : null}
                      {summary.error_code ? <span>error: {summary.error_code}</span> : null}
                      <span>saved {summary.created_at.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                  </div>
                  <Badge tone={summary.status === 'complete' ? 'good' : summary.status === 'fallback' ? 'warn' : 'danger'}>
                    {summary.status}
                  </Badge>
                </div>
              ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

export function ReportsPage() {
  return <WorkspaceGate>{() => <ReportsContent />}</WorkspaceGate>;
}
