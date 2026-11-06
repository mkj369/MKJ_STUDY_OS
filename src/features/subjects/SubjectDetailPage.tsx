/**
 * One subject, compact expandable chapter rows (inspired by modern tracker
 * UX, built on our own data). Rows stay short: number, title, status, %.
 * Expanding reveals the live checklist — ticks save immediately.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, arrowBackOutline, chevronDownOutline, openOutline } from 'ionicons/icons';
import { useMutate, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { Badge, DemoBadge, EmptyState, Notice, PageHeader, ProgressBar, SectionCard, StatusBadge } from '@/components/ui/Page';
import { PageSkeleton } from '@/components/ui/BrandLoader';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { userChapterSchema, type ChapterFormValues } from '@/domain/schemas';
import { subjectChapterStats, type ChapterView } from '@/features/shared/selectors';
import { errorMessage } from '@/utils/errors';

function ChapterRow({ chapter }: { chapter: ChapterView }) {
  const [expanded, setExpanded] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const mutate = useMutate();
  const notify = useNotify();
  const { progress } = chapter;
  const bodyId = `chapter-row-body-${chapter.chapter.id}`;

  const toggleItem = async (itemId: string, checked: boolean) => {
    setSavingItem(itemId);
    try {
      await mutate((repo) => repo.setChecklistProgress(chapter.chapter.id, itemId, checked));
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSavingItem(null);
    }
  };

  return (
    <div className="chapter-row">
      <div className="chapter-row__head">
        <div className="chapter-row__main">
          <Link to={`/chapters/${chapter.chapter.id}`} className="chapter-row__title">
            {chapter.number ? `${chapter.number}. ` : ''}
            {chapter.title}
          </Link>
          <div className="chapter-row__meta">
            <StatusBadge status={progress.status} />{' '}
            <span>
              checklist {progress.checklist.done}/{progress.checklist.total} · lectures {progress.lectures.completed}
              {progress.lectures.target !== null ? `/${progress.lectures.target}` : ''}
            </span>
          </div>
        </div>
        <span className="chapter-row__pct">{progress.checklist.percent}%</span>
        <button
          type="button"
          className="chapter-row__expand"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} checklist for ${chapter.title}`}
          onClick={() => setExpanded(!expanded)}
        >
          <IonIcon icon={chevronDownOutline} aria-hidden="true" />
        </button>
      </div>
      {expanded ? (
        <div className="chapter-row__body" id={bodyId}>
          <div className="chapter-row__bar" aria-hidden="true">
            <span style={{ width: `${progress.checklist.percent}%` }} />
          </div>
          {chapter.checklist.length === 0 ? (
            <p className="small muted">No checklist items yet — open the chapter to add the defaults.</p>
          ) : (
            <div className="checklist">
              {chapter.checklist.map((entry) => (
                <label className="checklist-item" key={entry.item.id}>
                  <input
                    type="checkbox"
                    checked={entry.progress?.is_done ?? false}
                    onChange={(event) => void toggleItem(entry.item.id, event.target.checked)}
                    disabled={savingItem === entry.item.id}
                    aria-label={`${entry.item.label} (${chapter.title})`}
                  />
                  <span className={`checklist-item__label ${entry.progress?.is_done ? 'is-done' : ''}`}>
                    {entry.item.label}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <Link to={`/chapters/${chapter.chapter.id}`} className="btn btn--secondary btn--sm">
              <IonIcon icon={openOutline} aria-hidden="true" /> Open chapter page
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubjectDetailContent() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [chapterDialog, setChapterDialog] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all');

  if (!data) return <PageSkeleton />;
  const subject = subjectId ? data.view.subjectById.get(subjectId) : undefined;

  if (!subject) {
    return (
      <SectionCard>
        <EmptyState
          title="Subject not found"
          message="It may have been removed or archived. Your other subjects are safe."
          action={<Link to="/syllabus" className="btn btn--primary btn--sm">Back to syllabus</Link>}
        />
      </SectionCard>
    );
  }

  const { complete, counted, skipped, percent } = subjectChapterStats(subject.chapters);
  const visible = subject.chapters.filter((c) =>
    filter === 'all' ? true : filter === 'complete' ? c.progress.status === 'complete' : c.progress.status !== 'complete',
  );

  const createChapter = async (values: ChapterFormValues) => {
    try {
      await mutate(async (repo) => {
        const chapter = await repo.create('user_chapters', {
          user_subject_id: subject.subject.id,
          curriculum_chapter_id: null,
          curriculum_version_id: null,
          custom_title: values.title,
          status: values.status,
          lecture_target_count: values.lecture_target_count ?? null,
          notes: null,
          import_batch_id: null,
          is_demo: false,
        });
        await repo.ensureChecklistDefaults(chapter.id);
        return chapter;
      });
      setChapterDialog(false);
      await notify('Chapter added with the standard checklist.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title={subject.label}
        description={`${complete}/${counted} chapters complete${skipped > 0 ? ` · ${skipped} skipped` : ''}${subject.progress.checklistPercent !== null ? ` · avg checklist ${subject.progress.checklistPercent}%` : ''}`}
        actions={
          <>
            <Link to="/syllabus" className="btn btn--ghost btn--sm">
              <IonIcon icon={arrowBackOutline} aria-hidden="true" /> Syllabus
            </Link>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setChapterDialog(true)}>
              <IonIcon icon={addOutline} aria-hidden="true" /> Chapter
            </button>
          </>
        }
        meta={subject.subject.is_demo ? <DemoBadge /> : undefined}
      />

      <SectionCard>
        <ProgressBar percent={percent} label={`${complete} of ${subject.chapters.length} chapters complete`} />
        <div className="chip-row" style={{ marginTop: 10 }} role="group" aria-label="Filter chapters">
          {(['all', 'incomplete', 'complete'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`preset-chip ${filter === value ? 'is-selected' : ''}`}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {value === 'all'
                ? `All (${subject.chapters.length})`
                : value === 'complete'
                  ? `Complete (${complete})`
                  : `Remaining (${subject.chapters.length - complete})`}
            </button>
          ))}
        </div>
      </SectionCard>

      {subject.chapters.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="No chapters in this subject yet"
            message="Add chapters manually or import a verified list from My Curriculum. Official chapter names are never invented for you."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setChapterDialog(true)}>
                Add the first chapter
              </button>
            }
          />
        </SectionCard>
      ) : (
        <div aria-label="Chapters">
          {visible.length === 0 ? (
            <Notice tone="info">No chapters match this filter.</Notice>
          ) : (
            visible.map((chapter) => <ChapterRow key={chapter.chapter.id} chapter={chapter} />)
          )}
        </div>
      )}

      {subject.progress.attentionReasons.length > 0 ? (
        <div className="chip-row" style={{ marginTop: 12 }}>
          {subject.progress.attentionReasons.map((reason) => (
            <Badge key={reason} tone="warn">{reason}</Badge>
          ))}
        </div>
      ) : null}

      {chapterDialog ? (
        <RecordDialog<ChapterFormValues>
          title={`Add a chapter to ${subject.label}`}
          description="Your own chapter record. Rename it, set a lecture target and edit the checklist any time."
          schema={userChapterSchema}
          defaultValues={{ user_subject_id: subject.subject.id, title: '', chapter_number: '', lecture_target_count: '', status: 'not_recorded' }}
          submitLabel="Add chapter"
          fields={[
            { name: 'title', label: 'Chapter title', type: 'text' },
            {
              name: 'lecture_target_count',
              label: 'Planned lectures',
              type: 'number',
              optional: true,
              help: 'How many lectures you expect for THIS chapter. Leave blank if unknown — never assumed uniform.',
            },
          ]}
          onSubmit={createChapter}
          onClose={() => setChapterDialog(false)}
        />
      ) : null}
    </>
  );
}

export function SubjectDetailPage() {
  return <WorkspaceGate>{() => <SubjectDetailContent />}</WorkspaceGate>;
}
