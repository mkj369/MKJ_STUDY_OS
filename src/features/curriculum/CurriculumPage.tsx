import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, cloudUploadOutline, libraryOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useMutate } from '@/hooks/useWorkspace';
import { useWorkspaceQuery } from '@/hooks/useWorkspace';
import { useAuth } from '@/app/AppProviders';
import { Badge, DemoBadge, EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { CoveragePanel } from '@/features/curriculum/CoveragePanel';
import { FormError } from '@/components/ui/Form';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { userSubjectSchema, type SubjectFormValues } from '@/domain/schemas';
import {
  buildImportPreview,
  importCsvExample,
  importJsonExample,
  parseImportText,
  type ImportPreview,
  type ParsedImport,
} from '@/domain/import';
import { errorMessage } from '@/utils/errors';
import { newId } from '@/services/seed/demoWorkspace';
import type { Repository } from '@/services/repository';
import {
  COVERAGE_LABEL,
  EMPTY_FILTERS,
  SCOPE_LABEL,
  VERIFICATION_LABEL,
  chapterCoverage,
  filterCurriculum,
  groupOptions,
  levelOptions,
  summariseCurriculum,
  subjectDisplayName,
  yearOptions,
  type CurriculumFilters,
} from '@/domain/curriculum';

function CurriculumContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const auth = useAuth();
  const notify = useNotify();
  const bundle = data?.bundle;
  const view = data?.view;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState<CurriculumFilters>(EMPTY_FILTERS);
  const importRef = useRef<HTMLDivElement>(null);

  const versions = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.curriculum.versions].sort(
      (a, b) =>
        Number(a.is_demo) - Number(b.is_demo) ||
        a.education_level.localeCompare(b.education_level) ||
        (a.stream ?? '').localeCompare(b.stream ?? ''),
    );
  }, [bundle]);

  const filtersToShow = useMemo(
    () => ({
      levels: levelOptions(versions),
      years: yearOptions(versions, filters.level),
      groups: groupOptions(versions, filters.level, filters.year),
    }),
    [versions, filters.level, filters.year],
  );

  const filtered = useMemo(() => {
    if (!bundle) return [];
    const { versions: allVersions, subjects, chapters } = bundle.curriculum;
    return filterCurriculum(allVersions, subjects, chapters, filters);
  }, [bundle, filters]);

  const summary = useMemo(
    () =>
      bundle
        ? summariseCurriculum(bundle.curriculum.versions, bundle.curriculum.subjects, bundle.curriculum.chapters)
        : null,
    [bundle],
  );

  if (!bundle || !view) return null;

  const adoptedCurriculumSubjectIds = new Set(
    bundle.subjects.map((s) => s.curriculum_subject_id).filter((id): id is string => Boolean(id)),
  );
  const userChaptersByCurriculumChapter = new Set(
    bundle.chapters.map((c) => c.curriculum_chapter_id).filter((id): id is string => Boolean(id)),
  );

  const adoptSubject = async (versionId: string, subjectId: string, subjectName: string) => {
    setBusyKey(subjectId);
    try {
      await mutate((repo) => repo.adoptCurriculumSubject(versionId, subjectId));
      await notify(`${subjectName} added. Add its chapters next.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusyKey(null);
    }
  };

  const addAllChapters = async (versionId: string, subjectId: string, subjectName: string) => {
    setBusyKey(`chapters-${subjectId}`);
    try {
      const chapterIds = bundle.curriculum.chapters
        .filter((c) => c.curriculum_subject_id === subjectId && !userChaptersByCurriculumChapter.has(c.id))
        .map((c) => c.id);
      if (chapterIds.length === 0) {
        await notify('All chapters from this subject are already in your workspace.', 'warning');
        return;
      }
      const result = await mutate((repo) => repo.addChaptersFromCurriculum(versionId, subjectId, chapterIds));
      await notify(`${result.created} chapter(s) added to ${subjectName}; ${result.skipped} skipped as duplicates.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusyKey(null);
    }
  };

  const createCustomSubject = async (values: SubjectFormValues) => {
    await mutate((repo) =>
      repo.create('user_subjects', {
        curriculum_subject_id: null,
        curriculum_version_id: null,
        custom_name: values.custom_name ?? 'My subject',
        custom_paper_label: values.custom_paper_label ?? null,
        status: 'active',
        color: values.color,
        sort_order: bundle.subjects.length + 1,
        is_demo: false,
      }),
    );
    setDialogOpen(false);
    await notify('Custom subject created. Add chapters under Subjects & Chapters.');
  };

  const existingChapterKeys = view.subjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({ subjectName: subject.label, chapterTitle: chapter.title })),
  );

  const runPreview = (text: string, fileName: string) => {
    setImportError(null);
    setLastBatchId(null);
    const result = parseImportText(text, fileName);
    setParsed(result);
    setPreview(buildImportPreview(result, existingChapterKeys, view.subjects.map((s) => s.label)));
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setImportFileName(file.name);
    if (file.size > 512_000) {
      setImportError('That file is larger than 500 KB. Split it into smaller imports.');
      return;
    }
    const text = await file.text();
    setImportText(text);
    runPreview(text, file.name);
  };

  const executeImport = async (repo: Repository): Promise<number> => {
    if (!preview) return 0;
    const importBatchId = newId();
    const subjectIdByName = new Map<string, string>();
    for (const subject of view.subjects) subjectIdByName.set(subject.label.trim().toLowerCase(), subject.subject.id);
    let created = 0;
    for (const row of preview.ready) {
      const key = row.subject.trim().toLowerCase();
      let subjectId = subjectIdByName.get(key);
      if (!subjectId) {
        const createdSubject = await repo.create('user_subjects', {
          curriculum_subject_id: null,
          curriculum_version_id: null,
          custom_name: row.subject.trim(),
          custom_paper_label: null,
          status: 'active',
          color: '#0f5132',
          sort_order: (await repo.list('user_subjects')).length + 1,
          is_demo: false,
        });
        subjectId = createdSubject.id;
        subjectIdByName.set(key, subjectId);
      }
      const chapter = await repo.create('user_chapters', {
        user_subject_id: subjectId,
        curriculum_chapter_id: null,
        curriculum_version_id: null,
        custom_title: row.chapter.trim(),
        status: 'not_recorded',
        lecture_target_count: row.lecture_target,
        import_batch_id: importBatchId,
        is_demo: false,
      });
      await repo.ensureChecklistDefaults(chapter.id);
      created += 1;
    }
    setLastBatchId(importBatchId);
    return created;
  };

  const importNow = async () => {
    if (!preview || preview.readyCount === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      let created = 0;
      await mutate(async (repo) => {
        created = await executeImport(repo);
        return created;
      });
      await notify(`${created} chapter(s) imported. You can undo this batch below.`);
      setPreview(null);
      setParsed(null);
    } catch (error) {
      setImportError(errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const undoImport = async () => {
    if (!lastBatchId) return;
    try {
      const removed = await mutate((repo) => repo.rollbackImport(lastBatchId));
      setLastBatchId(null);
      await notify(`Import undone: ${removed} chapter(s) removed. Records attached to them were kept.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="My Curriculum"
        description="A flexible, versioned syllabus. Official subject structure is seeded for SSC and HSC; chapter lists stay unverified until someone checks them against the cited NCTB source. You control what you study."
        actions={
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
              <IonIcon icon={addOutline} aria-hidden="true" /> Custom subject
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => importRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Import chapters
            </button>
          </>
        }
      />

      <Notice tone="warn" title="No fabricated syllabus.">
        Curriculum rows carry their authority, academic year, version and verification status. The SSC/HSC
        subject lists below are seeded from official NCTB subject structure, but <strong>their chapter lists
        are not verified yet</strong> — they were not readable as machine-parsable text when this data was
        added, and chapter titles are never invented to fill the gap. The demo version is placeholder
        structure only. Add chapters from your own textbook, or import a list you trust.
      </Notice>

      <CoveragePanel curriculum={bundle.curriculum} />

      {summary ? (
        <SectionCard title="What is actually loaded" hint="Counted from your database, not estimated">
          <div className="grid grid--two">
            <div className="stack" style={{ gap: 2 }}>
              <p className="small">
                <strong>{summary.versions}</strong> curriculum version(s) · <strong>{summary.subjects}</strong> subject(s)
              </p>
              <p className="small">
                <strong>{summary.chapters}</strong> chapter row(s), of which{' '}
                <strong>{summary.verifiedChapters}</strong> verified
              </p>
              <p className="tiny muted">
                {summary.demoVersions} version(s) are demo placeholders. Official subject lists carry no chapter
                rows, so their progress bars start empty — that is a missing source, not a finished syllabus.
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Filter the reference curriculum" hint="Filters change what you browse, never your records.">
        <div className="grid grid--two">
          <label className="field">
            <span className="field__label">Level</span>
            <select
              className="input"
              value={filters.level}
              onChange={(event) =>
                setFilters((current) => ({ ...current, level: event.target.value, year: '', group: '' }))
              }
            >
              <option value="">All levels</option>
              {filtersToShow.levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Academic year</span>
            <select
              className="input"
              value={filters.year}
              onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value, group: '' }))}
            >
              <option value="">All years</option>
              {filtersToShow.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Group / stream</span>
            <select
              className="input"
              value={filters.group}
              onChange={(event) => setFilters((current) => ({ ...current, group: event.target.value }))}
            >
              <option value="">All groups</option>
              {filtersToShow.groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Subject</span>
            <input
              className="input"
              type="search"
              placeholder="Physics, পদার্থবিজ্ঞান, …"
              value={filters.subjectQuery}
              onChange={(event) => setFilters((current) => ({ ...current, subjectQuery: event.target.value }))}
            />
            <span className="field__help">Matches English or Bangla names.</span>
          </label>
        </div>
        {filters.level || filters.year || filters.group || filters.subjectQuery ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        ) : null}
      </SectionCard>

      <div style={{ height: 16 }} />

      {versions.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<IonIcon icon={libraryOutline} aria-hidden="true" />}
            title="No curriculum versions available"
            message="In cloud mode the starter curriculum is created by the database migrations. In local mode it ships with the app. You can always create custom subjects and chapters."
          />
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="No curriculum versions match these filters"
            message="Clear the filters to see every level, year and group that is loaded. Nothing was deleted."
            action={
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            }
          />
        </SectionCard>
      ) : (
        <div className="stack">
          {filtered.map(({ version, subjects, chapterCount }) => {
            const verification = VERIFICATION_LABEL[version.verification_status];
            const coverage = chapterCoverage(
              version,
              bundle.curriculum.subjects.filter((s) => s.curriculum_version_id === version.id),
              bundle.curriculum.chapters,
            );
            return (
              <SectionCard
                key={version.id}
                title={version.title}
                hint={`${version.authority} · ${version.country} · ${version.class_grade}${
                  version.stream ? ` · ${version.stream}` : ''
                } · ${version.academic_year} · ${version.version_label}`}
                action={
                  <div className="row" style={{ gap: 6 }}>
                    <Badge tone={verification.tone}>{verification.text}</Badge>
                    {version.is_demo ? <DemoBadge /> : null}
                  </div>
                }
              >
                <div className="list-row__meta" style={{ marginBottom: 10 }}>
                  <Badge tone={version.scope === 'textbook' ? 'info' : 'neutral'}>{SCOPE_LABEL[version.scope]}</Badge>
                  <Badge tone={coverage === 'complete' ? 'good' : coverage === 'partial' ? 'info' : 'warn'}>
                    {COVERAGE_LABEL[coverage]}
                  </Badge>
                  <span>{subjects.length} subject(s)</span>
                  <span>{chapterCount} chapter row(s)</span>
                  {version.source_checked_at ? <span>source checked {version.source_checked_at}</span> : null}
                </div>
                {version.source_url ? (
                  <p className="small" style={{ marginBottom: 10 }}>
                    <a href={version.source_url} target="_blank" rel="noreferrer noopener">
                      Source <IonIcon icon={openOutline} aria-hidden="true" />
                    </a>
                  </p>
                ) : (
                  <p className="tiny muted" style={{ marginBottom: 10 }}>
                    No source URL recorded for this version.
                  </p>
                )}
                {version.source_note ? <p className="tiny muted" style={{ marginBottom: 10 }}>{version.source_note}</p> : null}
                <div className="list">
                  {subjects.map((subject) => {
                    const chapters = bundle.curriculum.chapters.filter((c) => c.curriculum_subject_id === subject.id);
                    const adopted = adoptedCurriculumSubjectIds.has(subject.id);
                    const missingChapters = chapters.filter((c) => !userChaptersByCurriculumChapter.has(c.id)).length;
                    return (
                      <div className="list-row" key={subject.id}>
                        <div className="list-row__main">
                          <div className="list-row__title">
                            {subjectDisplayName(subject)}
                            {subject.paper_label ? ` — ${subject.paper_label}` : ''}
                          </div>
                          <div className="list-row__meta">
                            <span>
                              {chapters.length === 0
                                ? 'no chapter list yet'
                                : `${chapters.length} chapter row(s)`}
                            </span>
                            {subject.is_compulsory ? <span>compulsory</span> : <span>optional</span>}
                            <Badge tone={subject.verification_status === 'verified' ? 'good' : 'warn'}>
                              {VERIFICATION_LABEL[subject.verification_status].text}
                            </Badge>
                            {adopted ? <span>in your workspace</span> : <span>not added yet</span>}
                          </div>
                        </div>
                        <div className="list-row__actions">
                          {!adopted ? (
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={busyKey === subject.id}
                              onClick={() => void adoptSubject(version.id, subject.id, subject.name)}
                            >
                              {busyKey === subject.id ? 'Adding…' : 'Add subject'}
                            </button>
                          ) : missingChapters === 0 ? (
                            <span className="tiny muted">
                              {chapters.length === 0 ? 'Track chapters you add yourself' : 'All chapters added'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              disabled={busyKey === `chapters-${subject.id}`}
                              onClick={() => void addAllChapters(version.id, subject.id, subject.name)}
                            >
                              Add {missingChapters} chapter(s)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <div style={{ height: 16 }} />

      <SectionCard
        title="Your subjects"
        hint="Subjects you have added from a curriculum or created yourself"
        action={
          <Link to="/subjects" className="btn btn--ghost btn--sm">
            Manage chapters
          </Link>
        }
      >
        {view.subjects.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={libraryOutline} aria-hidden="true" />}
            title="No subjects yet"
            message="Add a subject above, create a custom subject, or import chapters from a file."
            action={
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDialogOpen(true)}>
                Create custom subject
              </button>
            }
          />
        ) : (
          <div className="list">
            {view.subjects.map((subject) => (
              <div className="list-row" key={subject.subject.id}>
                <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 6, background: subject.color }} aria-hidden="true" />
                <div className="list-row__main">
                  <div className="list-row__title">{subject.label}</div>
                  <div className="list-row__meta">
                    <span>{subject.chapters.length} chapter(s)</span>
                    <span>
                      checklist {subject.progress.checklistPercent !== null ? `${subject.progress.checklistPercent}%` : 'not recorded'}
                    </span>
                    <span>{subject.progress.overdueTasks} overdue task(s)</span>
                  </div>
                </div>
                {subject.subject.is_demo ? <DemoBadge /> : null}
                <Link to={`/subjects#subject-${subject.subject.id}`} className="btn btn--ghost btn--sm">
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 16 }} ref={importRef} />

      <SectionCard
        title="Import chapters (CSV or JSON)"
        hint="Preview, validation, duplicate detection and one-click undo — no silent writes"
        action={<Badge tone="info">User content</Badge>}
      >
        <div className="stack">
          <Notice tone="neutral">
            Imported chapters are your own content: they are marked as not verified, never as official
            curriculum. Columns: <code>subject, chapter, lecture_target</code>. Values in{' '}
            <code>lecture_target</code> stay empty unless you set them.
          </Notice>
          <div className="grid grid--two">
            <div className="field">
              <label className="field__label" htmlFor="import-file">
                Choose a file
              </label>
              <input
                id="import-file"
                className="input"
                type="file"
                accept=".csv,.json,text/csv,application/json"
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
              <span className="field__help">
                {importFileName ? `Selected: ${importFileName}` : 'CSV or JSON. Max 500 rows per import.'}
              </span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="import-text">
                …or paste the text directly
              </label>
              <textarea
                id="import-text"
                className="textarea"
                rows={4}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={importCsvExample}
              />
              <span className="field__help">
                Example JSON: <code>{importJsonExample.split('\n').slice(0, 3).join(' ')} …</code>
              </span>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={() => runPreview(importText, importFileName)} disabled={!importText.trim()}>
              <IonIcon icon={cloudUploadOutline} aria-hidden="true" /> Preview import
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void importNow()}
              disabled={!preview || preview.readyCount === 0 || importing}
            >
              {importing ? 'Importing…' : `Import ${preview?.readyCount ?? 0} chapter(s)`}
            </button>
            {lastBatchId ? (
              <button type="button" className="btn btn--danger" onClick={() => void undoImport()}>
                Undo last import
              </button>
            ) : null}
          </div>
          <FormError message={importError} />
          {parsed && parsed.errors.length > 0 ? (
            <Notice tone="danger" title="Rows that could not be read:">
              <ul className="report-list">
                {parsed.errors.slice(0, 10).map((error, index) => (
                  <li key={`${error.rowNumber}-${index}`}>
                    Row {error.rowNumber || '?'}: {error.message}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {preview ? (
            <>
              <div className="row">
                <Badge tone="good">{preview.readyCount} ready</Badge>
                <Badge tone="warn">{preview.duplicateCount} duplicate</Badge>
                <Badge tone="danger">{preview.invalidCount} invalid</Badge>
                <span className="tiny muted">
                  New subjects to create: {preview.subjects.filter((s) => !s.existingSubject).map((s) => s.name).join(', ') || 'none'}
                </span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subject</th>
                      <th>Chapter</th>
                      <th>Lecture target</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 60).map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.subject}</td>
                        <td>{row.chapter}</td>
                        <td>{row.lectureTarget ?? '—'}</td>
                        <td>
                          <Badge tone={row.status === 'ready' ? 'good' : row.status === 'duplicate' ? 'warn' : 'danger'}>
                            {row.status}
                          </Badge>
                          {row.message ? <div className="tiny muted">{row.message}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 60 ? (
                <p className="tiny muted">Showing the first 60 preview rows of {preview.rows.length}.</p>
              ) : null}
            </>
          ) : null}
          {auth.mode === 'cloud' ? (
            <p className="tiny muted">
              <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" /> Imports are written to your account
              only, protected by row-level security.
            </p>
          ) : (
            <p className="tiny muted">
              <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" /> Local mode: imports are stored in this
              browser only.
            </p>
          )}
        </div>
      </SectionCard>

      {dialogOpen ? (
        <RecordDialog<SubjectFormValues>
          title="Create a custom subject"
          description="Use this when your subject is not in a curriculum version, or when you want your own title."
          schema={userSubjectSchema}
          defaultValues={{ mode: 'custom', custom_name: '', custom_paper_label: '', color: '#0f5132' }}
          submitLabel="Create subject"
          fields={[
            { name: 'mode', label: 'Source', type: 'select', options: [{ value: 'custom', label: 'My own subject' }] },
            { name: 'custom_name', label: 'Subject name', type: 'text', placeholder: 'e.g. Physics' },
            { name: 'custom_paper_label', label: 'Paper / label', type: 'text', placeholder: 'e.g. 1st Paper', optional: true },
            { name: 'color', label: 'Colour', type: 'text', help: 'Hex colour, e.g. #0f5132' },
          ]}
          onSubmit={createCustomSubject}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  );
}

export function CurriculumPage() {
  return (
    <WorkspaceGate>{() => <CurriculumContent />}</WorkspaceGate>
  );
}
