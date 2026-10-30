import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, archiveOutline, chevronForwardOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, DemoBadge, EmptyState, PageHeader, ProgressBar, SectionCard, StatusBadge } from '@/components/ui/Page';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { InlineMenu } from '@/components/ui/InlineMenu';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { isClassLevel } from '@/domain/classLevels';
import { subjectBelongsToClass } from '@/domain/studentProfile';
import { AddChapterDialog } from '@/features/curriculum/AddChapterDialog';
import { errorMessage } from '@/utils/errors';


function SubjectsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [chapterDialogSubjectId, setChapterDialogSubjectId] = useState<string | null>(null);

  if (!data) return null;
  const { view, bundle } = data;
  const activeClass = isClassLevel(bundle.profile.active_class) ? bundle.profile.active_class : null;

  /**
   * Chapters are added through the same dialog the curriculum screen uses, so
   * numbering, the preview and the Bengali title behave identically in both
   * places. This page shows them; it does not own a second way to create them.
   */
  const generateChapters = async (subjectId: string, count: number) => {
    const created = await mutate((repo) => repo.generateChapters(subjectId, count));
    await notify(created.length === 1 ? '1 chapter added.' : `${created.length} chapters added.`);
  };

  const createChapter = async (title: string, titleBn: string) => {
    if (!chapterDialogSubjectId) return;
    await mutate((repo) => repo.createPersonalChapter({ subjectId: chapterDialogSubjectId, title, titleBn }));
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
        title="Study"
        description="Your subjects, chapter by chapter."
        actions={
          /*
           * One place adds subjects. The old "Subject" button opened a second
           * creation form (with a hex colour field) and the "Chapter" button
           * silently added to whichever subject happened to be first.
           */
          <Link to="/curriculum" className="btn btn--primary btn--sm">
            <IonIcon icon={addOutline} aria-hidden="true" /> Add subject
          </Link>
        }
      />

      {view.subjects.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<IonIcon icon={addOutline} aria-hidden="true" />}
            title="No subjects yet"
            message="Pick your class, then add your first subject."
            action={
              <Link to="/curriculum" className="btn btn--primary btn--sm">
                Open curriculum
              </Link>
            }
          />
        </SectionCard>
      ) : (
        <div className="stack">
          {view.subjects.map((subject) => (
            <SectionCard
              key={subject.subject.id}
              title={subject.label}
              hint={`${subject.chapters.length} ${subject.chapters.length === 1 ? 'chapter' : 'chapters'} · ${subject.progress.chaptersComplete} completed`}
              action={
                /*
                 * Two visible controls, one menu. Four buttons in a row wrapped
                 * onto a second line at 390px and put a solid red "Remove" next
                 * to the primary action.
                 */
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  {subject.subject.is_demo ? <DemoBadge /> : null}
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setChapterDialogSubjectId(subject.subject.id)}
                  >
                    Add chapter
                  </button>
                  <InlineMenu label={`More options for ${subject.label}`}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void archiveSubject(subject.subject.id, subject.label)}
                    >
                      <IonIcon icon={archiveOutline} aria-hidden="true" /> Archive
                    </button>
                    <ConfirmDeleteButton
                      label="Remove subject"
                      header={`Remove ${subject.label}?`}
                      message="Only possible when the subject has no linked records — the app never deletes your history silently. Use Archive to hide it while keeping everything."
                      onConfirm={() => deleteSubject(subject.subject.id, subject.label)}
                    />
                  </InlineMenu>
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
                  <div className="row row--between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="small muted">No chapters yet.</span>
                    <Link to="/curriculum" className="btn btn--secondary btn--sm">
                      <IonIcon icon={addOutline} aria-hidden="true" /> Add chapters
                    </Link>
                  </div>
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
                  <p className="tiny muted">Nothing recorded yet.</p>
                ) : null}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {data.bundle.subjects.some((s) => s.status === 'archived' && subjectBelongsToClass(s.class_level, activeClass)) ? (
        <>
          <div style={{ height: 16 }} />
          <SectionCard title="Archived subjects" hint="Hidden from planning; records are kept">
            <div className="list">
              {data.bundle.subjects
                .filter((s) => s.status === 'archived' && subjectBelongsToClass(s.class_level, activeClass))
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

      {chapterDialogSubjectId ? (
        <AddChapterDialog
          open
          subjectName={
            view.subjects.find((subject) => subject.subject.id === chapterDialogSubjectId)?.label ?? 'Subject'
          }
          existing={(data.bundle.chapters.filter(
            (chapter) => chapter.user_subject_id === chapterDialogSubjectId,
          ) ?? []).map((chapter) => ({
            id: chapter.id,
            chapter_number: chapter.chapter_number ?? null,
            title: chapter.custom_title ?? chapter.chapter_title_bn ?? 'Chapter',
            sort_order: chapter.sort_order ?? 0,
          }))}
          onClose={() => setChapterDialogSubjectId(null)}
          onGenerate={async (count) => {
            if (!chapterDialogSubjectId) return;
            await generateChapters(chapterDialogSubjectId, count);
            setChapterDialogSubjectId(null);
          }}
          onCreateCustom={async (title, titleBn) => {
            await createChapter(title, titleBn);
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

