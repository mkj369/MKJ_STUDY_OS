import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { useWorkspaceQuery } from '@/hooks/useWorkspace';
import { useAuth, useRepository } from '@/app/AppProviders';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { formatDate } from '@/domain/dates';
import type { RepositoryTable } from '@/types/domain';
import { errorMessage } from '@/utils/errors';
import { toCsv } from '@/utils/csv';

const TABLE_LABELS: Partial<Record<RepositoryTable, string>> = {
  user_subjects: 'Subjects',
  user_chapters: 'Chapters',
  user_topics: 'Topics',
  chapter_checklist_items: 'Checklist items',
  chapter_checklist_progress: 'Checklist progress',
  lecture_records: 'Lectures',
  study_sessions: 'Study sessions',
  daily_blocks: 'Daily blocks',
  focus_sessions: 'Focus sessions',
  revision_sessions: 'Revisions',
  topic_difficulties: 'Difficult topics',
  mistake_logs: 'Mistakes',
  study_tasks: 'Tasks',
  exam_results: 'Exam results',
  exam_targets: 'Exam targets',
  practice_questions: 'Practice questions',
  practice_attempts: 'Practice attempts',
  notes: 'Notes',
  study_resources: 'Resources',
  weekly_summaries: 'Weekly summaries',
};

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExportContent() {
  const { data } = useWorkspaceQuery();
  const repository = useRepository();
  const { mode } = useAuth();
  const notify = useNotify();
  const [busy, setBusy] = useState<string | null>(null);
  const [csvTable, setCsvTable] = useState<RepositoryTable>('study_sessions');

  const versions = data?.bundle.curriculum.versions ?? [];
  const history = useMemo(() => {
    if (!data) return [];
    const { bundle } = data;
    const byVersion = new Map<string, { label: string; year: string; chapters: number; subjects: number; sessions: number }>();
    for (const version of bundle.curriculum.versions) {
      const subjectIds = new Set(
        bundle.subjects
          .filter((subject) => subject.curriculum_version_id === version.id)
          .map((subject) => subject.id),
      );
      const chapterIds = new Set(
        bundle.chapters.filter((chapter) => subjectIds.has(chapter.user_subject_id)).map((chapter) => chapter.id),
      );
      byVersion.set(version.id, {
        label: `${version.class_grade} · ${version.stream ?? 'all groups'} · ${version.academic_year}`,
        year: version.academic_year,
        chapters: chapterIds.size,
        subjects: subjectIds.size,
        sessions: bundle.sessions.filter((session) => session.user_chapter_id && chapterIds.has(session.user_chapter_id)).length,
      });
    }
    const custom = bundle.chapters.filter((chapter) => !chapter.curriculum_version_id).length;
    const rows = [...byVersion.entries()].map(([id, value]) => ({ id, ...value }));
    if (custom > 0) {
      rows.push({
        id: 'custom',
        label: 'Custom chapters (no curriculum version)',
        year: '—',
        chapters: custom,
        subjects: 0,
        sessions: 0,
      });
    }
    return rows;
  }, [data]);

  if (!data) return null;
  const { bundle, view } = data;
  const tables = Object.keys(TABLE_LABELS) as RepositoryTable[];
  const counts = tables.map((table) => ({
    table,
    label: TABLE_LABELS[table] ?? table,
    count:
      table === 'user_subjects'
        ? bundle.subjects.length
        : table === 'user_chapters'
          ? bundle.chapters.length
          : table === 'user_topics'
            ? bundle.topics.length
            : table === 'study_sessions'
              ? bundle.sessions.length
              : table === 'daily_blocks'
                ? bundle.dailyBlocks.length
                : table === 'focus_sessions'
                  ? bundle.focusSessions.length
                  : table === 'practice_questions'
                    ? bundle.practiceQuestions.length
                    : table === 'practice_attempts'
                      ? bundle.practiceAttempts.length
                      : table === 'exam_targets'
                        ? bundle.examTargets.length
                        : table === 'notes'
                          ? bundle.notes.length
                          : table === 'study_resources'
                            ? bundle.resources.length
                            : table === 'weekly_summaries'
                              ? bundle.summaries.length
                              : null,
  }));

  const exportJson = async () => {
    setBusy('json');
    try {
      const payload = await repository.exportAll();
      const name = `mkj-studyos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      download(name, JSON.stringify(payload, null, 2), 'application/json');
      await notify(`Exported ${name}`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    setBusy('csv');
    try {
      const payload = await repository.exportAll();
      const rows = (payload.tables[csvTable] ?? []) as Record<string, unknown>[];
      const name = `mkj-studyos-${csvTable}-${new Date().toISOString().slice(0, 10)}.csv`;
      download(name, toCsv(rows), 'text/csv;charset=utf-8');
      await notify(rows.length === 0 ? `Exported an empty ${csvTable} file (no rows).` : `Exported ${rows.length} row(s).`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Export & academic history"
        description="Your records belong to you. Export everything as JSON, or one table as CSV, and see how your history maps to curriculum versions."
      />

      <div className="grid grid--stats">
        <StatCard label="Mode" value={mode === 'cloud' ? 'Supabase account' : 'Local device'} hint={mode === 'cloud' ? 'Protected by row-level security' : 'Stored in this browser only'} />
        <StatCard label="Subjects" value={bundle.subjects.length} hint={`${view.totals.chapters} chapter(s)`} />
        <StatCard label="Study sessions" value={bundle.sessions.length} hint={`${bundle.dailyBlocks.length} day block(s)`} />
        <StatCard label="Exam results" value={bundle.exams.length} hint={`${bundle.examTargets.length} upcoming target(s)`} />
      </div>

      <SectionCard title="Export" hint="Exports run against your repository; in cloud mode the export is filtered by the same row-level policies as the app.">
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy === 'json'} onClick={() => void exportJson()}>
            {busy === 'json' ? 'Preparing…' : 'Download full JSON backup'}
          </button>
          <select className="input input--inline" value={csvTable} onChange={(event) => setCsvTable(event.target.value as RepositoryTable)}>
            {tables.map((table) => (
              <option key={table} value={table}>
                {TABLE_LABELS[table] ?? table}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--secondary" disabled={busy === 'csv'} onClick={() => void exportCsv()}>
            {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        <ul className="list">
          {counts.map((entry) => (
            <li key={entry.table} className="list-row">
              <div className="list-row__main">
                <div className="list-row__title">{entry.label}</div>
              </div>
              <div className="list-row__actions">
                <span className="mono-num tiny">{entry.count === null ? 'rows vary' : `${entry.count} row(s)`}</span>
              </div>
            </li>
          ))}
        </ul>
        <Notice tone="neutral">
          A JSON backup is a snapshot, not a live sync. Re-import is not automated in this build; the file is for your own
          records and for moving data by hand.
        </Notice>
      </SectionCard>

      <SectionCard title="Academic history" hint="Records are never deleted when the curriculum changes: chapters keep their version, and custom chapters are labelled.">
        {history.length === 0 ? (
          <EmptyState title="No curriculum history yet" message="Adopt a subject from a curriculum version to start a history trail." />
        ) : (
          <ul className="list">
            {history.map((entry) => (
              <li key={entry.id} className="list-row">
                <div className="list-row__main">
                  <div className="list-row__title">
                    {entry.label} {entry.id === 'custom' ? <Badge tone="neutral">custom</Badge> : <Badge tone="info">curriculum</Badge>}
                  </div>
                  <div className="list-row__meta">
                    <span>{entry.subjects} subject(s)</span>
                    <span>{entry.chapters} chapter(s)</span>
                    <span>{entry.sessions} linked session(s)</span>
                    <span>academic year {entry.year}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {versions.length > 0 ? (
          <p className="tiny muted">
            Curriculum versions on file:{' '}
            {versions.map((version) => `${version.title} (${version.academic_year}, verification: ${version.verification_status})`).join(' · ')}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Exam history" hint="Results you recorded, newest first. Marks are only shown where you entered them.">
        {bundle.exams.length === 0 ? (
          <p className="small muted">No exam result recorded yet.</p>
        ) : (
          <ul className="list">
            {[...bundle.exams]
              .sort((a, b) => (a.exam_date < b.exam_date ? 1 : -1))
              .map((exam) => (
                <li key={exam.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {exam.exam_name} <Badge tone="info">{exam.exam_type}</Badge>
                    </div>
                    <div className="list-row__meta">
                      <span>{formatDate(exam.exam_date)}</span>
                      <span>
                        {exam.marks_obtained}/{exam.total_marks}
                        {exam.total_marks > 0 ? ` (${Math.round((exam.marks_obtained / exam.total_marks) * 100)}%)` : ''}
                      </span>
                      <span>{exam.user_subject_id ? view.phase2.subjectLabels[exam.user_subject_id] ?? 'Subject' : 'All subjects'}</span>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
        <p className="tiny muted">
          Changing syllabus versions does not touch exam results. Past results stay attached to the subject they were
          recorded against.
        </p>
      </SectionCard>

      <SectionCard title="Edit, delete, restore" hint="Where each kind of record is managed.">
        <ul className="list">
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Subjects &amp; chapters</div>
              <div className="list-row__meta"><span>Delete a chapter first if it holds records; the app blocks destructive subject deletes.</span></div>
            </div>
            <div className="list-row__actions"><Link to="/subjects" className="btn btn--ghost btn--sm">Open</Link></div>
          </li>
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Study sessions &amp; day blocks</div>
              <div className="list-row__meta"><span>Edit or delete from the timeline for the day.</span></div>
            </div>
            <div className="list-row__actions"><Link to="/time" className="btn btn--ghost btn--sm">Open</Link></div>
          </li>
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Mistakes, revisions, practice</div>
              <div className="list-row__meta"><span>Resolve or delete records in their own pages; deleting a record never deletes a chapter.</span></div>
            </div>
            <div className="list-row__actions"><Link to="/weakness" className="btn btn--ghost btn--sm">Open</Link></div>
          </li>
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Demo data</div>
              <div className="list-row__meta"><span>Demo rows are labelled and can be removed from Settings without touching your own records.</span></div>
            </div>
            <div className="list-row__actions"><Link to="/settings" className="btn btn--ghost btn--sm">Open</Link></div>
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Backup, recovery and account deletion">
        <ul className="list">
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Local (demo) mode</div>
              <div className="list-row__meta">
                <span>Your data lives in this browser's storage. Clearing site data removes it permanently — export a JSON backup first.</span>
              </div>
            </div>
          </li>
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Cloud mode</div>
              <div className="list-row__meta">
                <span>Rows live in your Supabase project under row-level security. Export before deleting your account.</span>
              </div>
            </div>
          </li>
          <li className="list-row">
            <div className="list-row__main">
              <div className="list-row__title">Account deletion</div>
              <div className="list-row__meta">
                <span>
                  Cloud accounts can be deleted from Settings, which calls a server-side function so the browser never
                  holds an admin key. Local workspaces are removed by clearing browser storage.
                </span>
              </div>
            </div>
            <div className="list-row__actions"><Link to="/settings" className="btn btn--ghost btn--sm">Settings</Link></div>
          </li>
        </ul>
        <Notice tone="warn" title="Keep the backup somewhere safe">
          A downloaded file can contain personal study records. Store it where you keep your own documents, and delete
          old copies you no longer need.
        </Notice>
      </SectionCard>
    </>
  );
}

export function ExportPage() {
  return <WorkspaceGate>{() => <ExportContent />}</WorkspaceGate>;
}
