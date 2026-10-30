import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, cloudUploadOutline, libraryOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useMutate } from '@/hooks/useWorkspace';
import { useWorkspaceQuery } from '@/hooks/useWorkspace';
import { useAuth } from '@/app/AppProviders';
import { Badge, DemoBadge, EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { CoveragePanel } from '@/features/curriculum/CoveragePanel';
import { PaperRow } from '@/features/curriculum/PaperRow';
import { levelRank } from '@/domain/curriculumCoverage';
import { isClassLevel } from '@/domain/classLevels';
import { normaliseGroup, versionBelongsToProfile } from '@/domain/studentProfile';
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
  yearOptions,
  type CurriculumFilters,
} from '@/domain/curriculum';

function TemplateContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const navigate = useNavigate();
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

  /*
   * Only the templates that belong to this student's class and group. Class 11
   * Science must not be offered a Class 9 Humanities list, and Class 10 must not
   * see HSC papers. A version with no group covers everyone at that class.
   */
  const profileClass = bundle && isClassLevel(bundle.profile.active_class) ? bundle.profile.active_class : null;
  const profileGroup = normaliseGroup(bundle?.profile.active_group);

  const versions = useMemo(() => {
    if (!bundle) return [];
    // Demo versions last, then HSC before SSC — this student sits HSC, and the
    // level they are examined on should not be below a level they finished.
    return bundle.curriculum.versions
      .filter((version) => versionBelongsToProfile(version, profileClass, profileGroup))
      .sort(
      (a, b) =>
        Number(a.is_demo) - Number(b.is_demo) ||
        levelRank(a.education_level) - levelRank(b.education_level) ||
        (a.stream ?? '').localeCompare(b.stream ?? ''),
    );
  }, [bundle, profileClass, profileGroup]);

  /*
   * The coverage report is a reference-curriculum view, so it is scoped the same
   * way the version list is: this student's class and group only. A Class 10
   * student must never see HSC coverage numbers and read them as their own.
   */
  const scopedCurriculum = useMemo(() => {
    if (!bundle) return null;
    const visibleVersions = bundle.curriculum.versions.filter((version) =>
      versionBelongsToProfile(version, profileClass, profileGroup),
    );
    const versionIds = new Set(visibleVersions.map((version) => version.id));
    const subjects = bundle.curriculum.subjects.filter((subject) =>
      versionIds.has(subject.curriculum_version_id),
    );
    const subjectIds = new Set(subjects.map((subject) => subject.id));
    return {
      ...bundle.curriculum,
      versions: visibleVersions,
      subjects,
      chapters: bundle.curriculum.chapters.filter((chapter) =>
        subjectIds.has(chapter.curriculum_subject_id),
      ),
    };
  }, [bundle, profileClass, profileGroup]);

  const filtersToShow = useMemo(
    () => ({
      levels: levelOptions(versions),
      years: yearOptions(versions, filters.level),
      groups: groupOptions(versions, filters.level, filters.year),
    }),
    [versions, filters.level, filters.year],
  );

  /*
   * Filter the *class-scoped* list, never the raw one. Filtering all versions and
   * filtering only the UI was a real bug: a Class 11 Science student could page
   * through Class 9 Business Studies papers because the rendered list ignored
   * the profile scope while the filter menus respected it.
   */
  const filtered = useMemo(() => {
    if (!bundle) return [];
    const { subjects, chapters } = bundle.curriculum;
    return filterCurriculum(versions, subjects, chapters, filters);
  }, [bundle, versions, filters]);



  if (!bundle || !view) return null;

  /*
   * Official (non-demo) subjects that actually carry a chapter list, plus the
   * official subject total. Plain values, not `useMemo`: this sits after an
   * early return, and a hook here would run in a different order on the first
   * render than on later ones.
   */
  const adoptedCurriculumSubjectIds = new Set(
    bundle.subjects.map((s) => s.curriculum_subject_id).filter((id): id is string => Boolean(id)),
  );
  /*
   * Saved progress, keyed by the curriculum subject it belongs to. This is what
   * lets a paper card show 3/15 instead of a hopeful zero: the numbers come from
   * chapter records the student actually owns.
   */
  const progressByCurriculumSubject = new Map(
    (view.subjects ?? [])
      .filter((subject) => subject.subject.curriculum_subject_id)
      .map((subject) => [subject.subject.curriculum_subject_id as string, subject]),
  );
  const chapterViewsByCurriculumSubject = new Map<string, typeof view.subjects[number]['chapters']>();
  for (const subject of view.subjects ?? []) {
    const curriculumSubjectId = subject.subject.curriculum_subject_id;
    if (!curriculumSubjectId) continue;
    chapterViewsByCurriculumSubject.set(curriculumSubjectId, subject.chapters);
  }
  const userChaptersByCurriculumChapter = new Set(
    bundle.chapters.map((c) => c.curriculum_chapter_id).filter((id): id is string => Boolean(id)),
  );

  /**
   * One click must leave a usable subject. Adopting a subject on its own gives
   * you a card with 0 chapters in the syllabus tracker, which reads like the
   * curriculum is empty — so the chapters that exist are attached in the same
   * action. A subject with no chapter list is still adoptable; it just says so.
   */
  const adoptSubject = async (versionId: string, subjectId: string, subjectName: string) => {
    setBusyKey(subjectId);
    try {
      await mutate((repo) => repo.adoptCurriculumSubject(versionId, subjectId, profileClass));
      const chapterIds = bundle.curriculum.chapters
        .filter((c) => c.curriculum_subject_id === subjectId && !userChaptersByCurriculumChapter.has(c.id))
        .map((c) => c.id);
      if (chapterIds.length === 0) {
        await notify(
          `${subjectName} added. NCTB's chapter list for this subject has not been recovered yet, so it starts with no chapters.`,
          'warning',
        );
        return;
      }
      const result = await mutate((repo) => repo.addChaptersFromCurriculum(versionId, subjectId, chapterIds));
      await notify(`${subjectName} added with ${result.created} chapter(s).`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusyKey(null);
    }
  };

  /**
   * Coverage-driven entry into the topic screens. One click leaves a usable
   * subject: adopt it, attach whatever real chapters exist, then land in the
   * syllabus where the topics are recorded.
   */
  const studySubject = async (versionId: string, subjectId: string, subjectName: string) => {
    setBusyKey(`study-${subjectId}`);
    try {
      if (!adoptedCurriculumSubjectIds.has(subjectId)) {
        await mutate((repo) => repo.adoptCurriculumSubject(versionId, subjectId, profileClass));
      }
      const chapterIds = bundle.curriculum.chapters
        .filter((c) => c.curriculum_subject_id === subjectId && !userChaptersByCurriculumChapter.has(c.id))
        .map((c) => c.id);
      if (chapterIds.length > 0) {
        await mutate((repo) => repo.addChaptersFromCurriculum(versionId, subjectId, chapterIds));
        await notify(`${subjectName}: ${chapterIds.length} chapter(s) ready. Record a topic on any chapter.`);
      } else {
        await notify(`${subjectName} is already in your subjects. Open a chapter to record a topic.`);
      }
      navigate('/syllabus');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setBusyKey(null);
    }
  };

  /**
   * Coverage-driven entry into the topic screens. The coverage report knows which
   * subjects actually have a chapter list; this adopts one of them, attaches its
   * real chapters, and lands the student in Subjects & Chapters, where a topic is
   * recorded against an existing chapter. It adds rows — it never removes any.
   */

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
        class_level: profileClass,
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
          // Imported chapters belong to the class the student is working in;
          // otherwise the import would vanish from every class-scoped screen.
          class_level: profileClass,
          status: 'active',
          color: '#38BDF8',
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
        title="Official templates"
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

      {/*
        The numbers in this notice are computed from the loaded data, not typed
        into the sentence. Two earlier versions of this copy went stale the
        moment an import landed — a warning that overstates (or understates) the
        gap is exactly the failure it exists to prevent.
      */}
      <Notice tone="neutral" title="These are reference lists, not your subjects.">
        Adopting one copies it into your curriculum, where you can rename or edit anything. Nothing here is marked
        complete until you have checked it yourself.
      </Notice>

      {scopedCurriculum ? (
        <CoveragePanel
          curriculum={scopedCurriculum}
          adoptedSubjectIds={adoptedCurriculumSubjectIds}
          onStudySubject={(versionId, subjectId, subjectName) =>
            void studySubject(versionId, subjectId, subjectName)
          }
          busyKey={busyKey}
        />
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
              placeholder="Physics 2nd Paper, পদার্থবিজ্ঞান ২য়, …"
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
                    const chapters = bundle.curriculum.chapters
                      .filter((c) => c.curriculum_subject_id === subject.id)
                      .sort((a, b) => a.sort_order - b.sort_order);
                    const adopted = adoptedCurriculumSubjectIds.has(subject.id);
                    const missingChapters = chapters.filter(
                      (c) => !userChaptersByCurriculumChapter.has(c.id),
                    ).length;
                    const subjectView = progressByCurriculumSubject.get(subject.id);
                    return (
                      <PaperRow
                        key={subject.id}
                        subject={subject}
                        version={version}
                        chapters={chapters}
                        adopted={adopted}
                        missingChapters={missingChapters}
                        busy={busyKey}
                        onAdopt={() => void adoptSubject(version.id, subject.id, subject.name)}
                        onAddChapters={() => void addAllChapters(version.id, subject.id, subject.name)}
                        progress={subjectView?.progress ?? null}
                        chapterViews={chapterViewsByCurriculumSubject.get(subject.id) ?? []}
                        adoptedChapterIds={userChaptersByCurriculumChapter}
                      />
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
          defaultValues={{ mode: 'custom', custom_name: '', custom_paper_label: '', color: '#38BDF8' }}
          submitLabel="Create subject"
          fields={[
            { name: 'mode', label: 'Source', type: 'select', options: [{ value: 'custom', label: 'My own subject' }] },
            { name: 'custom_name', label: 'Subject name', type: 'text', placeholder: 'e.g. Physics' },
            { name: 'custom_paper_label', label: 'Paper / label', type: 'text', placeholder: 'e.g. 1st Paper', optional: true },
            { name: 'color', label: 'Colour', type: 'text', help: 'Hex colour, e.g. #38BDF8' },
          ]}
          onSubmit={createCustomSubject}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  );
}

export function OfficialTemplatesPage() {
  return (
    <WorkspaceGate>{() => <TemplateContent />}</WorkspaceGate>
  );
}
