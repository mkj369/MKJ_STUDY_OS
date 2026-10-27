import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, chevronForwardOutline, createOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, DemoBadge, EmptyState, Notice, PageHeader, ProgressBar, SectionCard, StatusBadge } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { userChapterSchema, userSubjectSchema, type ChapterFormValues, type SubjectFormValues } from '@/domain/schemas';
import { errorMessage } from '@/utils/errors';
import { DEFAULT_STALE_DAYS } from '@/domain/progress';

const CHAPTER_STATUS_OPTIONS = [
  { value: 'not_recorded', label: 'Not recorded (let the app derive it)' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'needs_practice', label: 'Needs practice' },
  { value: 'needs_revision', label: 'Needs revision' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

function SubjectsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [subjectDialog, setSubjectDialog] = useState(false);
  const [chapterDialogSubjectId, setChapterDialogSubjectId] = useState<string | null>(null);
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false);

  if (!data) return null;
  const { view } = data;

  const createSubject = async (values: SubjectFormValues) => {
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
  };

  const createChapter = async (values: ChapterFormValues) => {
    await mutate(async (repo) => {
      const chapter = await repo.create('user_chapters', {
        user_subject_id: values.user_subject_id,
        curriculum_chapter_id: null,
        curriculum_version_id: null,
        custom_title: values.title,
        status: values.status,
        lecture_target_count: values.lecture_target_count ?? null,
        import_batch_id: null,
        is_demo: false,
      });
      await repo.ensureChecklistDefaults(chapter.id);
      return chapter;
    });
    setChapterDialogOpen(false);
    await notify('Chapter added with the standard checklist.');
  };

  const archiveSubject = async (id: string, label: string) => {
    try {
      await mutate((repo) => repo.update('user_subjects', id, { status: 'archived' }));
      await notify(`${label} archived. Find it under “Archived subjects” to restore.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const deleteSubject = async (id: string, label: string) => {
    try {
      await mutate((repo) => repo.remove('user_subjects', id));
      await notify(`${label} removed. Existing records were kept but unlinked.`, 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Subjects & Chapters"
        description="Every chapter keeps its checklist, lecture target, revisions and difficulties. Checklist completion is never treated as mastery."
        actions={
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setSubjectDialog(true)}>
              <IonIcon icon={addOutline} aria-hidden="true" /> Subject
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                const first = view.subjects[0];
                if (!first) {
                  void notify('Create a subject first.', 'warning');
                  return;
                }
                setChapterDialogSubjectId(first.subject.id);
                setChapterDialogOpen(true);
              }}
            >
              <IonIcon icon={createOutline} aria-hidden="true" /> Chapter
            </button>
          </>
        }
      />

      {view.subjects.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<IonIcon icon={addOutline} aria-hidden="true" />}
            title="No subjects yet"
            message="Add a subject from My Curriculum, create your own subject, or import a chapter list."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/curriculum" className="btn btn--primary btn--sm">
                  Open curriculum
                </Link>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSubjectDialog(true)}>
                  Create subject
                </button>
              </div>
            }
          />
        </SectionCard>
      ) : (
        <div className="stack">
          {view.subjects.map((subject) => (
            <SectionCard
              key={subject.subject.id}
              title={subject.label}
              hint={`${subject.chapters.length} chapter(s) · ${subject.progress.chaptersComplete} complete · ${subject.progress.openDifficulties} open difficult topic(s)`}
              action={
                <div className="row" style={{ gap: 6 }}>
                  {subject.subject.is_demo ? <DemoBadge /> : null}
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      setChapterDialogSubjectId(subject.subject.id);
                      setChapterDialogOpen(true);
                    }}
                  >
                    Add chapter
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => void archiveSubject(subject.subject.id, subject.label)}
                  >
                    Archive
                  </button>
                  <ConfirmDeleteButton
                    label="Remove subject"
                    header={`Remove ${subject.label}?`}
                    message="Only possible when the subject has no linked records — the app never deletes your history silently. Use Archive to hide it while keeping everything."
                    onConfirm={() => deleteSubject(subject.subject.id, subject.label)}
                  />
                </div>
              }
            >
              <div id={`subject-${subject.subject.id}`} />
              <div className="stack">
                <ProgressBar
                  percent={subject.progress.checklistPercent}
                  label="Average chapter checklist completion"
                />
                {subject.progress.attentionReasons.length > 0 ? (
                  <div className="chip-row">
                    {subject.progress.attentionReasons.map((reason) => (
                      <Badge key={reason} tone={reason.startsWith('No evidence') ? 'good' : 'warn'}>
                        {reason}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {subject.chapters.length === 0 ? (
                  <Notice tone="neutral">
                    No chapters yet. Add them manually, import a CSV, or copy them from My Curriculum.
                  </Notice>
                ) : (
                  <div className="list">
                    {subject.chapters.map((chapter) => (
                      <div className="list-row" key={chapter.chapter.id}>
                        <div className="list-row__main">
                          <div className="list-row__title">
                            <Link to={`/chapters/${chapter.chapter.id}`} style={{ color: 'inherit' }}>
                              {chapter.number ? `${chapter.number}. ` : ''}
                              {chapter.title}
                            </Link>
                          </div>
                          <div className="list-row__meta">
                            <span>
                              checklist {chapter.progress.checklist.done}/{chapter.progress.checklist.total}
                            </span>
                            <span>
                              lectures {chapter.progress.lectures.completed}
                              {chapter.progress.lectures.target !== null ? `/${chapter.progress.lectures.target}` : ''}
                            </span>
                            <span>
                              revisions {chapter.progress.revisions.count}
                              {chapter.progress.revisions.nextDate ? ` · next ${chapter.progress.revisions.nextDate}` : ''}
                            </span>
                            {chapter.progress.lastActivityDate ? <span>last activity {chapter.progress.lastActivityDate}</span> : null}
                          </div>
                          <div className="row" style={{ marginTop: 6, gap: 6 }}>
                            <StatusBadge status={chapter.progress.status} />
                            {chapter.progress.flags
                              .filter((flag) => flag.severity !== 'info')
                              .slice(0, 2)
                              .map((flag) => (
                                <Badge key={flag.code} tone={flag.severity === 'high' ? 'danger' : 'warn'}>
                                  {flag.label}
                                </Badge>
                              ))}
                          </div>
                        </div>
                        <Link to={`/chapters/${chapter.chapter.id}`} className="btn btn--ghost btn--sm" aria-label={`Open ${chapter.title}`}>
                          <IonIcon icon={chevronForwardOutline} />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                {subject.progress.lastActivityDate === null ? (
                  <p className="tiny muted">
                    No records in this subject yet. “Not recorded” does not mean “not studied” — add what you
                    actually did when you can.
                  </p>
                ) : null}
                <p className="tiny muted">Stale-activity window in flags: {DEFAULT_STALE_DAYS} days.</p>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {data.bundle.subjects.some((s) => s.status === 'archived') ? (
        <>
          <div style={{ height: 16 }} />
          <SectionCard title="Archived subjects" hint="Hidden from planning; records are kept">
            <div className="list">
              {data.bundle.subjects
                .filter((s) => s.status === 'archived')
                .map((subject) => (
                  <div className="list-row" key={subject.id}>
                    <div className="list-row__main">
                      <div className="list-row__title">{subject.custom_name ?? 'Archived curriculum subject'}</div>
                      <div className="list-row__meta">
                        <span>{data.bundle.chapters.filter((c) => c.user_subject_id === subject.id).length} chapter(s)</span>
                        <span>
                          {data.bundle.lectures.filter((l) => l.user_subject_id === subject.id).length} lecture(s)
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={async () => {
                        try {
                          await mutate((repo) => repo.update('user_subjects', subject.id, { status: 'active' }));
                          await notify('Subject restored.');
                        } catch (restoreError) {
                          await notify(errorMessage(restoreError), 'danger');
                        }
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
            </div>
          </SectionCard>
        </>
      ) : null}

      {subjectDialog ? (
        <RecordDialog<SubjectFormValues>
          title="Create a subject"
          schema={userSubjectSchema}
          defaultValues={{ mode: 'custom', custom_name: '', custom_paper_label: '', color: '#0f5132' }}
          submitLabel="Create subject"
          fields={[
            { name: 'mode', label: 'Source', type: 'select', options: [{ value: 'custom', label: 'My own subject' }] },
            { name: 'custom_name', label: 'Subject name', type: 'text', placeholder: 'e.g. Physics' },
            { name: 'custom_paper_label', label: 'Paper / label', type: 'text', optional: true },
            { name: 'color', label: 'Colour', type: 'text', help: 'Hex colour, e.g. #0f5132' },
          ]}
          onSubmit={createSubject}
          onClose={() => setSubjectDialog(false)}
        />
      ) : null}

      {chapterDialogOpen && chapterDialogSubjectId ? (
        <RecordDialog<ChapterFormValues>
          title="Add a chapter"
          description="Chapter titles are yours. Nothing is copied from an unverified syllabus unless you ask for it."
          schema={userChapterSchema}
          defaultValues={{
            user_subject_id: chapterDialogSubjectId,
            title: '',
            chapter_number: '',
            lecture_target_count: '',
            status: 'not_recorded',
          }}
          submitLabel="Add chapter"
          fields={[
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            { name: 'title', label: 'Chapter title', type: 'text', placeholder: 'e.g. Motion in a straight line' },
            { name: 'chapter_number', label: 'Chapter number', type: 'text', optional: true },
            {
              name: 'lecture_target_count',
              label: 'Lecture target',
              type: 'number',
              optional: true,
              inputMode: 'numeric',
              help: 'Leave empty unless you know the real number of lectures. The app never guesses it.',
            },
            { name: 'status', label: 'Your label', type: 'select', options: CHAPTER_STATUS_OPTIONS },
          ]}
          onSubmit={createChapter}
          onClose={() => {
            setChapterDialogOpen(false);
            setChapterDialogSubjectId(null);
          }}
        />
      ) : null}
    </>
  );
}

export function SubjectsPage() {
  return <WorkspaceGate>{() => <SubjectsContent />}</WorkspaceGate>;
}

