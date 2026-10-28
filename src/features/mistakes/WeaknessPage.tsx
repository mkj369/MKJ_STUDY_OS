import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { buildMistakeFollowUps } from '@/domain/mistakes';
import { formatDate } from '@/domain/dates';
import { errorMessage } from '@/utils/errors';

function WeaknessContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) return null;
  const { bundle, view } = data;
  const analysis = view.phase2.mistakeAnalysis;
  const followUps = buildMistakeFollowUps(analysis, 4);

  const convertToTask = async (key: string) => {
    const followUp = followUps.find((candidate) => candidate.title === key);
    if (!followUp) return;
    setBusy(key);
    try {
      await mutate((repo) =>
        repo.create('study_tasks', {
          title: followUp.title.slice(0, 140),
          description: followUp.why,
          user_subject_id: null,
          user_chapter_id: followUp.chapterId,
          estimated_minutes: 30,
          priority: followUp.priority,
          status: 'todo',
          due_date: view.today,
          planned_date: view.today,
          origin: 'rule',
          gap_reason: followUp.evidence.join(' · ').slice(0, 500),
          carried_over_count: 0,
          source_report_id: null,
          completed_at: null,
          is_demo: false,
        }),
      );
      await notify('Task created from the recorded pattern.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (id: string) => {
    try {
      await mutate((repo) =>
        repo.update('mistake_logs', id, { is_resolved: true, resolved_at: new Date().toISOString() }),
      );
      await notify('Mistake marked resolved. The record is kept.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Weakness analyzer"
        description="Patterns are only reported when your own mistake records support them: the same category, in the same chapter, on at least two different days."
        actions={
          <Link to="/mistakes" className="btn btn--primary btn--sm">
            Log a mistake
          </Link>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Mistakes logged" value={analysis.total} hint={`${analysis.unresolved} unresolved`} />
        <StatCard
          label="Resolved"
          value={analysis.resolved}
          hint={analysis.resolvedPercent === null ? 'No mistakes recorded' : `${analysis.resolvedPercent}% of logged mistakes`}
        />
        <StatCard label="Recurring patterns" value={analysis.recurring.length} hint="Same category, different days" />
        <StatCard label="Subjects with open errors" value={analysis.weakChapters.length} hint="Chapters with unresolved mistakes" />
      </div>

      <SectionCard title="Error patterns supported by your records" hint="Each pattern lists the specific mistakes behind it.">
        {analysis.recurring.length === 0 ? (
          <EmptyState
            title="No pattern is supported yet"
            message="A single mistake, or several on the same day, is not a pattern. Log the next occurrence and this will fill in."
          />
        ) : (
          <ul className="list">
            {analysis.recurring.map((group) => (
              <li key={group.key} className="list-row">
                <div className="list-row__main">
                  <div className="list-row__title">
                    {group.categoryLabel} · {group.chapterTitle ?? 'No chapter'} <Badge tone="warn">{group.count}×</Badge>
                  </div>
                  <div className="list-row__meta">
                    <span>seen on {group.distinctDates} different days</span>
                    <span>{group.unresolved} unresolved</span>
                    <span>latest {formatDate(group.latestDate)}</span>
                  </div>
                  <details>
                    <summary className="tiny muted">Evidence ({group.evidence.length})</summary>
                    <ul className="list">
                      {group.evidence.map((line) => (
                        <li key={line} className="tiny muted">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {group.lesson ? <p className="small">Lesson recorded: {group.lesson}</p> : null}
                </div>
                <div className="list-row__actions">
                  {group.chapterId ? (
                    <Link to={`/chapters/${group.chapterId}`} className="btn btn--secondary btn--sm">
                      Chapter
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Suggested follow-ups" hint="Derived from unresolved recurring errors only. Nothing is created until you press the button.">
        {followUps.length === 0 ? (
          <EmptyState
            title="No follow-up is supported yet"
            message="Follow-ups come from recurring errors only — the same category in the same chapter on two different days. Logging one more mistake of the same kind is what turns this on."
          />
        ) : (
          <ul className="list">
            {followUps.map((followUp) => (
              <li key={followUp.title} className="list-row">
                <div className="list-row__main">
                  <div className="list-row__title">
                    {followUp.title} <Badge tone={followUp.priority === 'high' ? 'danger' : 'warn'}>{followUp.priority}</Badge>
                  </div>
                  <div className="list-row__meta">
                    <span>{followUp.why}</span>
                  </div>
                </div>
                <div className="list-row__actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busy === followUp.title}
                    onClick={() => void convertToTask(followUp.title)}
                  >
                    {busy === followUp.title ? 'Adding…' : 'Add as task'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid grid--two">
        <SectionCard title="By category" hint="Counts of records, nothing inferred.">
          {analysis.byCategory.length === 0 ? (
            <p className="small muted">No categories recorded.</p>
          ) : (
            <div className="bars">
              {analysis.byCategory.map((category) => {
                const max = Math.max(...analysis.byCategory.map((entry) => entry.count), 1);
                return (
                  <div key={category.category} className="bar">
                    <span>{category.label}</span>
                    <div className="bar__track">
                      <div className="bar__fill" style={{ width: `${Math.round((category.count / max) * 100)}%` }} />
                    </div>
                    <span className="mono-num tiny">
                      {category.count} · {category.unresolved} open
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Chapters with unresolved mistakes" hint="Most recent first.">
          {analysis.weakChapters.length === 0 ? (
            <p className="small muted">Nothing unresolved.</p>
          ) : (
            <ul className="list">
              {analysis.weakChapters.map((chapter) => (
                <li key={`${chapter.chapterId ?? 'none'}`} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">{chapter.chapterTitle}</div>
                    <div className="list-row__meta">
                      <span>{chapter.unresolved} unresolved</span>
                    </div>
                  </div>
                  {chapter.chapterId ? (
                    <div className="list-row__actions">
                      <Link to={`/chapters/${chapter.chapterId}`} className="btn btn--ghost btn--sm">
                        Open
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Unresolved mistakes" hint="Resolving keeps the record for analysis; it never deletes it.">
        {bundle.mistakes.filter((mistake) => !mistake.is_resolved).length === 0 ? (
          <p className="small muted">Everything logged is resolved.</p>
        ) : (
          <ul className="list">
            {bundle.mistakes
              .filter((mistake) => !mistake.is_resolved)
              .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
              .map((mistake) => (
                <li key={mistake.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">{mistake.what_went_wrong}</div>
                    <div className="list-row__meta">
                      <span>{formatDate(mistake.occurred_at)}</span>
                      <span>{mistake.category.replace(/_/g, ' ')}</span>
                      <span>{mistake.user_chapter_id ? view.phase2.chapterTitles[mistake.user_chapter_id] ?? 'Chapter' : 'No chapter'}</span>
                    </div>
                    {mistake.lesson_learned ? <p className="tiny muted">Lesson: {mistake.lesson_learned}</p> : null}
                  </div>
                  <div className="list-row__actions">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => void resolve(mistake.id)}>
                      Mark resolved
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </SectionCard>

      <Notice tone="neutral">
        The analyzer sees only what you logged. Mistakes outside the app are unknown, and “no pattern” is a statement
        about the records, not about your ability.
      </Notice>
    </>
  );
}

export function WeaknessPage() {
  return <WorkspaceGate>{() => <WeaknessContent />}</WorkspaceGate>;
}
