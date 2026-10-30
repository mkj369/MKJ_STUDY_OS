import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { PageHeader } from '@/components/ui/Page';
import { useMutate, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { useNotify, WorkspaceGate } from '@/features/shared/WorkspaceGate';
import { ClassPicker } from '@/features/curriculum/ClassPicker';
import { AddSubjectDialog, type SubjectDraft } from '@/features/curriculum/AddSubjectDialog';
import { SubjectLibraryDialog, type LibraryPick } from '@/features/curriculum/SubjectLibraryDialog';
import { AddChapterDialog } from '@/features/curriculum/AddChapterDialog';
import { NoSubjects, SubjectCard, type ChapterRow } from '@/features/curriculum/SubjectCard';
import { isPlaceholderTitle, planReorder, type ExistingChapter } from '@/domain/chapterGeneration';
import { classLabel, parseClassLevel, DEFAULT_CLASS, type ClassLevel } from '@/domain/classLevels';
import type { UserChapter, UserSubject } from '@/types/domain';

/**
 * My Curriculum — the class-based subject and chapter manager.
 *
 * One job: pick a class, add subjects, generate chapters, rename them. Official
 * templates live on their own page; this one is entirely the student's own data.
 */
function CurriculumContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const navigate = useNavigate();

  const [classOverride, setClassOverride] = useState<ClassLevel | null>(null);
  const [subjectDialog, setSubjectDialog] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [customSeed, setCustomSeed] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState<UserSubject | null>(null);
  const [chapterDialogFor, setChapterDialogFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'subject' | 'chapter'; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const bundle = data?.bundle;
  const view = data?.view;

  const activeClass: ClassLevel = classOverride ?? parseClassLevel(bundle?.profile.active_class) ?? DEFAULT_CLASS;

  const subjectsForClass = useMemo(() => {
    if (!bundle) return [];
    return bundle.subjects
      .filter((subject) => subject.status === 'active')
      .filter((subject) => (subject.class_level ?? null) === activeClass)
      .sort((a, b) => a.sort_order - b.sort_order || (a.custom_name ?? '').localeCompare(b.custom_name ?? ''));
  }, [bundle, activeClass]);

  const classesWithSubjects = useMemo(() => {
    const set = new Set<number>();
    for (const subject of bundle?.subjects ?? []) {
      if (subject.status !== 'active') continue;
      if (typeof subject.class_level === 'number') set.add(subject.class_level);
    }
    return set;
  }, [bundle]);

  /**
   * Subjects created before classes existed (imported, demo, or an older
   * account) have no `class_level`. They are never hidden: the migration only
   * added the column, it did not decide which class a real subject belongs to.
   */
  const unassignedSubjects = useMemo(
    () =>
      (bundle?.subjects ?? [])
        .filter((subject) => subject.status === 'active' && (subject.class_level ?? null) === null)
        .sort((a, b) => a.sort_order - b.sort_order || (a.custom_name ?? '').localeCompare(b.custom_name ?? '')),
    [bundle],
  );

  /** Archived subjects stay visible so archiving never looks like deletion. */
  const archivedForClass = useMemo(
    () =>
      (bundle?.subjects ?? []).filter(
        (subject) => subject.status === 'archived' && (subject.class_level ?? null) === activeClass,
      ),
    [bundle, activeClass],
  );

  if (!bundle || !view) return null;

  const chapterRowsFor = (subjectId: string): ChapterRow[] =>
    bundle.chapters
      .filter((chapter) => chapter.user_subject_id === subjectId)
      .slice()
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          (a.chapter_number ?? 9999) - (b.chapter_number ?? 9999),
      )
      .map((chapter) => {
        const curriculumChapter = chapter.curriculum_chapter_id
          ? bundle.curriculum.chapters.find((c) => c.id === chapter.curriculum_chapter_id) ?? null
          : null;
        const viewChapter = view.subjects
          .flatMap((subject) => subject.chapters)
          .find((candidate) => candidate.chapter.id === chapter.id);
        const title = chapter.custom_title ?? curriculumChapter?.title ?? 'Chapter';
        const number = chapter.chapter_number ?? null;
        return {
          chapter,
          title,
          titleBn: chapter.chapter_title_bn ?? curriculumChapter?.title_bn ?? null,
          number: number ?? (curriculumChapter?.chapter_number ? Number(curriculumChapter.chapter_number) : null),
          progress: viewChapter?.progress ?? null,
          isPlaceholder: isPlaceholderTitle(title),
          sourceLabel: curriculumChapter?.source_document ?? null,
          sourceUrl: curriculumChapter?.source_url ?? null,
        } satisfies ChapterRow;
      });

  const existingFor = (subjectId: string): ExistingChapter[] =>
    bundle.chapters
      .filter((chapter) => chapter.user_subject_id === subjectId)
      .map((chapter) => ({
        id: chapter.id,
        chapter_number: chapter.chapter_number ?? null,
        title: chapter.custom_title ?? '',
        sort_order: chapter.sort_order ?? 0,
      }));

  const changeClass = async (level: ClassLevel) => {
    setClassOverride(level);
    try {
      await mutate(async (repository) => {
        await repository.setActiveClass(level);
      });
    } catch {
      // The view already changed; the preference will save next time.
    }
  };

  /**
   * Add one or more reference subjects in a single action.
   *
   * Each pick adopts the subject under the class being edited and attaches
   * whatever real chapters exist for it. Adding twenty subjects one at a time
   * from a second page was the actual reason the main Add flow felt incomplete.
   */
  const addFromLibrary = async (picks: LibraryPick[]) => {
    setBusy(true);
    try {
      let chapters = 0;
      await mutate(async (repository) => {
        for (const pick of picks) {
          await repository.adoptCurriculumSubject(pick.versionId, pick.subjectId, activeClass);
          const missing = pick.chapterIds.filter(
            (id) => !bundle.chapters.some((chapter) => chapter.curriculum_chapter_id === id),
          );
          if (missing.length > 0) {
            const result = await repository.addChaptersFromCurriculum(pick.versionId, pick.subjectId, missing);
            chapters += result.created;
          }
        }
      });
      setLibraryOpen(false);
      notify(
        `${picks.length} subject${picks.length === 1 ? '' : 's'} added to ${classLabel(activeClass)}${
          chapters > 0 ? ` with ${chapters} chapter(s)` : ''
        }.`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not add those subjects.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const openCustom = (seed?: string) => {
    setLibraryOpen(false);
    setCustomSeed(seed ?? null);
    setSubjectDialog(true);
  };

  const addSubject = async (draft: SubjectDraft) => {
    await mutate(async (repository) => {
      await repository.createPersonalSubject({
        classLevel: activeClass,
        name: draft.name,
        nameBn: draft.nameBn || null,
        paperLabel: draft.paperLabel || null,
        color: draft.color,
      });
    });
    notify(`${draft.name} added to ${classLabel(activeClass)}.`);
  };

  const editSubject = async (draft: SubjectDraft) => {
    if (!editingSubject) return;
    await mutate(async (repository) => {
      await repository.update('user_subjects', editingSubject.id, {
        custom_name: draft.name,
        name_bn: draft.nameBn || null,
        custom_paper_label: draft.paperLabel || null,
        color: draft.color,
      } as Partial<UserSubject>);
    });
    setEditingSubject(null);
    notify('Subject updated.');
  };

  const generateChapters = async (subjectId: string, count: number) => {
    setBusy(true);
    try {
      const created = await mutate(async (repository) => repository.generateChapters(subjectId, count));
      notify(created.length === 1 ? '1 chapter added.' : `${created.length} chapters added.`);
    } finally {
      setBusy(false);
    }
  };

  const createCustomChapter = async (subjectId: string, title: string, titleBn: string) => {
    setBusy(true);
    try {
      await mutate(async (repository) =>
        repository.createPersonalChapter({ subjectId, title, titleBn: titleBn || null }),
      );
      notify('Chapter added.');
    } finally {
      setBusy(false);
    }
  };

  const renameChapter = async (chapterId: string, title: string, titleBn: string, number: number | null) => {
    await mutate(async (repository) =>
      repository.updateChapter(chapterId, { title, titleBn: titleBn || null, chapterNumber: number }),
    );
  };

  const toggleDone = async (chapter: UserChapter, done: boolean) => {
    await mutate(async (repository) => {
      await repository.updateChapter(chapter.id, { status: done ? 'complete' : 'not_recorded' });
      /*
       * Completion is mirrored onto the checklist, because that is what every
       * other screen reads (dashboard, reports, progress bars). Writing only the
       * status column would make this tick invisible everywhere else.
       */
      const items = await repository.ensureChecklistDefaults(chapter.id);
      for (const item of items) {
        await repository.setChecklistProgress(chapter.id, item.id, done);
      }
    });
  };

  const moveChapter = async (subjectId: string, chapterId: string, direction: -1 | 1) => {
    const rows = chapterRowsFor(subjectId);
    const index = rows.findIndex((row) => row.chapter.id === chapterId);
    if (index < 0) return;
    const next = planReorder(
      rows.map((row, position) => ({
        id: row.chapter.id,
        chapter_number: row.number,
        title: row.title,
        sort_order: position,
      })),
      index,
      index + direction,
    );
    if (next.length === 0) return;
    await mutate(async (repository) => {
      await repository.reorderChapters(
        subjectId,
        next.map((entry) => entry.id),
      );
    });
  };

  const removeChapter = async (chapterId: string) => {
    await mutate(async (repository) => {
      await repository.remove('user_chapters', chapterId);
    });
    notify('Chapter removed.');
  };

  const archiveSubject = async (subjectId: string) => {
    await mutate(async (repository) => {
      await repository.setSubjectArchived(subjectId, true);
    });
    notify('Archived. Chapters and records are kept.');
  };

  const restoreSubject = async (subjectId: string) => {
    await mutate(async (repository) => {
      await repository.setSubjectArchived(subjectId, false);
    });
    notify('Subject restored.');
  };

  const deleteSubject = async (subjectId: string) => {
    await mutate(async (repository) => {
      await repository.remove('user_subjects', subjectId);
    });
    notify('Subject deleted.');
  };

  const dialogSubject = chapterDialogFor
    ? (bundle.subjects.find((subject) => subject.id === chapterDialogFor) ?? null)
    : null;

  const setSubjectClass = async (subjectId: string, level: number) => {
    await mutate(async (repository) => {
      await repository.setSubjectClass(subjectId, level);
    });
    notify(`Moved to Class ${level}.`);
  };

  const renderCard = (subject: (typeof bundle.subjects)[number]) => {
    const curriculumSubject = subject.curriculum_subject_id
      ? (bundle.curriculum.subjects.find((candidate) => candidate.id === subject.curriculum_subject_id) ?? null)
      : null;
    return (
    <SubjectCard
      key={subject.id}
      subject={subject}
      classLevel={subject.class_level ?? null}
      displayName={subject.custom_name ?? curriculumSubject?.name ?? 'Subject'}
      paperLabel={subject.custom_paper_label ?? curriculumSubject?.paper_label ?? null}
      chapters={chapterRowsFor(subject.id)}
      busy={busy}
      onAddChapter={() => setChapterDialogFor(subject.id)}
      onOpenChapter={(chapterId) => navigate(`/chapters/${chapterId}`)}
      onOpenSubject={() => navigate(`/subjects/${subject.id}`)}
      onRename={renameChapter}
      onToggleDone={(chapterId, done) => {
        const chapter = bundle.chapters.find((candidate) => candidate.id === chapterId);
        return chapter ? toggleDone(chapter, done) : Promise.resolve();
      }}
      onRemoveChapter={(chapterId, title) => setConfirm({ kind: 'chapter', id: chapterId, label: title })}
      onMoveChapter={(chapterId, direction) => void moveChapter(subject.id, chapterId, direction)}
      onArchive={() => void archiveSubject(subject.id)}
      onEdit={() => setEditingSubject(subject)}
      onSetClass={(level) => setSubjectClass(subject.id, level)}
      onDelete={() =>
        setConfirm({
          kind: 'subject',
          id: subject.id,
          label: subject.custom_name ?? curriculumSubject?.name ?? 'this subject',
        })
      }
    />
    );
  };

  return (
    <>
      <PageHeader
        title="My Curriculum"
        description="Pick your class, then add subjects and chapters."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setLibraryOpen(true)}>
            <IonIcon icon={addOutline} aria-hidden="true" /> Add subject
          </button>
        }
      />

      <ClassPicker
        active={activeClass}
        classesWithSubjects={classesWithSubjects}
        onChange={(level) => void changeClass(level)}
      />

      <div className="row row--between">
        <h2 className="strong" style={{ fontSize: '1rem' }}>
          {classLabel(activeClass)}
        </h2>
        <span className="tiny muted">
          {subjectsForClass.length} {subjectsForClass.length === 1 ? 'subject' : 'subjects'}
        </span>
      </div>

      {subjectsForClass.length === 0 ? (
        <NoSubjects onAdd={() => setLibraryOpen(true)} />
      ) : (
        <div className="grid grid--two">{subjectsForClass.map((subject) => renderCard(subject))}</div>
      )}

      {unassignedSubjects.length > 0 ? (
        <section className="stack">
          <div className="row row--between">
            <h2 className="strong" style={{ fontSize: '1rem' }}>
              Not in a class yet
            </h2>
            <span className="tiny muted">{unassignedSubjects.length}</span>
          </div>
          <p className="tiny muted">
            These subjects came from before classes existed. Their chapters and records are intact — set a class
            from the subject menu whenever you like.
          </p>
          <div className="grid grid--two">{unassignedSubjects.map((subject) => renderCard(subject))}</div>
        </section>
      ) : null}

      {archivedForClass.length > 0 ? (
        <section className="card">
          <h2 className="card__title" style={{ marginBottom: 8 }}>
            Archived
          </h2>
          <div className="list">
            {archivedForClass.map((subject) => (
              <div className="list-row" key={subject.id}>
                <div className="list-row__main">
                  <div className="list-row__title">
                    {subject.custom_name}
                    {subject.custom_paper_label ? ` · ${subject.custom_paper_label}` : ''}
                  </div>
                  <div className="list-row__meta">
                    {bundle.chapters.filter((chapter) => chapter.user_subject_id === subject.id).length} chapters ·
                    records kept
                  </div>
                </div>
                <div className="list-row__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => void restoreSubject(subject.id)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="tiny muted">
        Official chapter lists are optional.{' '}
        <button type="button" className="link-button" onClick={() => navigate('/curriculum/templates')}>
          Browse templates
        </button>
      </p>

      <SubjectLibraryDialog
        open={libraryOpen}
        classLevel={activeClass}
        group={bundle.profile.active_group ?? null}
        versions={bundle.curriculum.versions}
        subjects={bundle.curriculum.subjects}
        chapters={bundle.curriculum.chapters}
        adoptedSubjectIds={
          new Set(
            bundle.subjects
              .map((subject) => subject.curriculum_subject_id)
              .filter((id): id is string => Boolean(id)),
          )
        }
        busy={busy}
        onAdd={addFromLibrary}
        onCustom={openCustom}
        onClose={() => setLibraryOpen(false)}
      />

      <AddSubjectDialog
        open={subjectDialog}
        classLevel={activeClass}
        initialName={customSeed}
        onClose={() => {
          setSubjectDialog(false);
          setCustomSeed(null);
        }}
        existing={subjectsForClass.map((subject) => ({
          id: subject.id,
          name: subject.custom_name ?? '',
          paperLabel: subject.custom_paper_label,
        }))}
        onSave={addSubject}
      />

      <AddSubjectDialog
        open={editingSubject !== null}
        classLevel={activeClass}
        existing={subjectsForClass.map((subject) => ({
          id: subject.id,
          name: subject.custom_name ?? '',
          paperLabel: subject.custom_paper_label,
        }))}
        initial={
          editingSubject
            ? {
                name: editingSubject.custom_name ?? '',
                nameBn: editingSubject.name_bn ?? '',
                paperLabel: editingSubject.custom_paper_label ?? '',
                color: editingSubject.color,
              }
            : null
        }
        onClose={() => setEditingSubject(null)}
        onSave={editSubject}
      />

      {dialogSubject ? (
        <AddChapterDialog
          open
          subjectName={`${dialogSubject.custom_name ?? 'Subject'}${
            dialogSubject.custom_paper_label ? ` · ${dialogSubject.custom_paper_label}` : ''
          }`}
          existing={existingFor(dialogSubject.id)}
          onClose={() => setChapterDialogFor(null)}
          onGenerate={(count) => generateChapters(dialogSubject.id, count)}
          onCreateCustom={(title, titleBn) => createCustomChapter(dialogSubject.id, title, titleBn)}
        />
      ) : null}

      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.kind === 'chapter' ? 'Delete chapter?' : 'Delete subject?'}
        message={
          confirm?.kind === 'chapter'
            ? `"${confirm.label}" and the study records attached to it will be removed. This cannot be undone.`
            : `"${confirm?.label}" and all of its chapters will be removed. Archive it instead to keep the records.`
        }
        confirmLabel={confirm?.kind === 'chapter' ? 'Delete chapter' : 'Delete subject'}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (!target) return;
          if (target.kind === 'chapter') void removeChapter(target.id);
          else void deleteSubject(target.id);
        }}
      />
    </>
  );
}

export function CurriculumPage() {
  return <WorkspaceGate>{() => <CurriculumContent />}</WorkspaceGate>;
}
