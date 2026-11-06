/**
 * Lecture management inside a chapter: multiple lectures per chapter, each
 * with its own configurable checklist, completion flag and notes. Counts are
 * per chapter — nothing assumes a uniform lecture count.
 */
import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { addOutline, chevronDownOutline, createOutline, videocamOutline } from 'ionicons/icons';
import { z } from 'zod';
import { useMutate, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { Badge, Notice, ProgressBar, SectionCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { useNotify } from '@/features/shared/WorkspaceGate';
import { errorMessage } from '@/utils/errors';
import type { ChapterView } from '@/features/shared/selectors';
import type { LectureChecklistItem, LectureRecord } from '@/types/domain';

const lectureEditSchema = z.object({
  title: z.string().trim().min(1, 'Lecture title is required.').max(120),
  lecture_number: z
    .union([z.coerce.number().int().min(0).max(1000), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  lecture_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  notes: z.string().max(2000).optional(),
});
type LectureEditValues = z.infer<typeof lectureEditSchema>;

const itemSchema = z.object({ label: z.string().trim().min(1, 'A label is required.').max(80) });

function LectureCard({ lecture, chapter }: { lecture: LectureRecord; chapter: ChapterView }) {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const items: LectureChecklistItem[] = data?.view.lectureChecklistByLecture.get(lecture.id) ?? [];
  const done = items.filter((item) => item.is_done).length;
  const bodyId = `lecture-body-${lecture.id}`;

  const ensureDefaults = async () => {
    try {
      await mutate((repo) => repo.ensureLectureChecklistDefaults(lecture.id));
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const toggle = async (item: LectureChecklistItem, checked: boolean) => {
    setSaving(true);
    try {
      await mutate((repo) =>
        repo.update('lecture_checklist_items', item.id, {
          is_done: checked,
          completed_at: checked ? new Date().toISOString() : null,
        }),
      );
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const toggleCompleted = async (checked: boolean) => {
    setSaving(true);
    try {
      await mutate((repo) => repo.update('lecture_records', lecture.id, { is_completed: checked }));
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (values: LectureEditValues) => {
    try {
      await mutate((repo) =>
        repo.update('lecture_records', lecture.id, {
          title: values.title,
          lecture_number: values.lecture_number,
          lecture_date: values.lecture_date,
          notes: values.notes?.trim() ? values.notes.trim() : null,
        }),
      );
      setEditOpen(false);
      await notify('Lecture updated.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const addItem = async (values: { label: string }) => {
    try {
      await mutate((repo) =>
        repo.create('lecture_checklist_items', {
          lecture_record_id: lecture.id,
          label: values.label,
          sort_order: items.length + 1,
        }),
      );
      setItemOpen(false);
      await notify('Checklist item added.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const renameItem = async (itemId: string, values: { label: string }) => {
    try {
      await mutate((repo) => repo.update('lecture_checklist_items', itemId, { label: values.label }));
      setRenaming(null);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await mutate((repo) => repo.remove('lecture_checklist_items', itemId));
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const removeLecture = async () => {
    try {
      await mutate((repo) => repo.remove('lecture_records', lecture.id));
      await notify('Lecture and its checklist removed.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const saveNotes = async () => {
    if (notesDraft === null) return;
    try {
      await mutate((repo) => repo.update('lecture_records', lecture.id, { notes: notesDraft.trim() || null }));
      setNotesDraft(null);
      await notify('Lecture notes saved.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <div className="chapter-row">
      <div className="chapter-row__head">
        <label className="row" style={{ gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={lecture.is_completed}
            onChange={(event) => void toggleCompleted(event.target.checked)}
            disabled={saving}
            aria-label={`Mark ${lecture.title} ${lecture.is_completed ? 'not finished' : 'completed'}`}
            style={{ width: 20, height: 20, accentColor: 'var(--mkj-primary)', flexShrink: 0 }}
          />
          <span className="chapter-row__main">
            <span className="chapter-row__title" style={{ textDecoration: lecture.is_completed ? 'none' : undefined }}>
              {lecture.lecture_number !== null ? `L${lecture.lecture_number}: ` : ''}
              {lecture.title}
            </span>
            <span className="chapter-row__meta">
              {lecture.lecture_date} · checklist {done}/{items.length}
              {lecture.duration_minutes ? ` · ${lecture.duration_minutes} min` : ''}
            </span>
          </span>
        </label>
        <Badge tone={lecture.is_completed ? 'good' : 'warn'}>{lecture.is_completed ? 'Done' : 'Open'}</Badge>
        <button
          type="button"
          className="chapter-row__expand"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${lecture.title}`}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            if (next && items.length === 0) void ensureDefaults();
          }}
        >
          <IonIcon icon={chevronDownOutline} aria-hidden="true" />
        </button>
      </div>
      {expanded ? (
        <div className="chapter-row__body" id={bodyId}>
          {items.length > 0 ? (
            <>
              <ProgressBar
                percent={items.length === 0 ? 0 : Math.round((done / items.length) * 100)}
                label={`${lecture.title} checklist`}
              />
              <div className="checklist" style={{ marginTop: 8 }}>
                {items.map((item) => (
                  <div className="checklist-item" key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={item.is_done}
                      onChange={(event) => void toggle(item, event.target.checked)}
                      disabled={saving}
                      aria-label={`${item.label} (${lecture.title})`}
                    />
                    <span className={`checklist-item__label ${item.is_done ? 'is-done' : ''}`} style={{ flex: 1 }}>
                      {item.label}
                    </span>
                    <button
                      type="button"
                      className="link-button tiny"
                      onClick={() => setRenaming(item.id)}
                      aria-label={`Rename ${item.label}`}
                    >
                      Rename
                    </button>
                    <ConfirmDeleteButton
                      label="Remove"
                      header={`Remove “${item.label}”?`}
                      message="Only this lecture checklist item is removed."
                      onConfirm={() => removeItem(item.id)}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="small muted">No checklist items. Add the first one below.</p>
          )}

          <div className="field" style={{ marginTop: 10 }}>
            <label className="field__label" htmlFor={`lecture-notes-${lecture.id}`}>Lecture notes</label>
            <textarea
              id={`lecture-notes-${lecture.id}`}
              className="input"
              rows={2}
              value={notesDraft ?? lecture.notes ?? ''}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder="What was covered, what to revisit…"
            />
            {notesDraft !== null && notesDraft !== (lecture.notes ?? '') ? (
              <div className="row" style={{ marginTop: 6 }}>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveNotes()}>Save notes</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNotesDraft(null)}>Discard</button>
              </div>
            ) : null}
          </div>

          <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setItemOpen(true)}>
              <IonIcon icon={addOutline} aria-hidden="true" /> Checklist item
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditOpen(true)}>
              <IonIcon icon={createOutline} aria-hidden="true" /> Edit lecture
            </button>
            <ConfirmDeleteButton
              label="Remove lecture"
              header={`Remove “${lecture.title}”?`}
              message={`The lecture and its checklist are removed from ${chapter.title}. Study sessions and revisions are kept.`}
              onConfirm={removeLecture}
            />
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <RecordDialog<LectureEditValues>
          title="Edit lecture"
          schema={lectureEditSchema}
          defaultValues={{
            title: lecture.title,
            lecture_number: lecture.lecture_number ?? '',
            lecture_date: lecture.lecture_date,
            notes: lecture.notes ?? '',
          }}
          submitLabel="Save lecture"
          fields={[
            { name: 'title', label: 'Lecture title', type: 'text' },
            { name: 'lecture_number', label: 'Lecture number', type: 'number', optional: true },
            { name: 'lecture_date', label: 'Date', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, optional: true },
          ]}
          onSubmit={saveEdit}
          onClose={() => setEditOpen(false)}
        />
      ) : null}

      {itemOpen ? (
        <RecordDialog<{ label: string }>
          title="Add checklist item"
          schema={itemSchema}
          defaultValues={{ label: '' }}
          submitLabel="Add item"
          fields={[{ name: 'label', label: 'Label', type: 'text', placeholder: 'e.g. Re-solve the example problems' }]}
          onSubmit={addItem}
          onClose={() => setItemOpen(false)}
        />
      ) : null}

      {renaming ? (
        <RecordDialog<{ label: string }>
          title="Rename checklist item"
          schema={itemSchema}
          defaultValues={{ label: items.find((item) => item.id === renaming)?.label ?? '' }}
          submitLabel="Save label"
          fields={[{ name: 'label', label: 'Label', type: 'text' }]}
          onSubmit={(values) => renameItem(renaming, values)}
          onClose={() => setRenaming(null)}
        />
      ) : null}
    </div>
  );
}

export function ChapterLectures({ chapter }: { chapter: ChapterView }) {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [addOpen, setAddOpen] = useState(false);

  const lectures = (data?.bundle.lectures ?? [])
    .filter((lecture) => lecture.user_chapter_id === chapter.chapter.id)
    .sort(
      (a, b) =>
        (a.lecture_number ?? Number.MAX_SAFE_INTEGER) - (b.lecture_number ?? Number.MAX_SAFE_INTEGER) ||
        a.lecture_date.localeCompare(b.lecture_date) ||
        a.created_at.localeCompare(b.created_at),
    );
  const completed = lectures.filter((lecture) => lecture.is_completed).length;
  const target = chapter.chapter.lecture_target_count;

  const addLecture = async (values: LectureEditValues) => {
    try {
      await mutate(async (repo) => {
        const lecture = await repo.create('lecture_records', {
          user_subject_id: chapter.chapter.user_subject_id,
          user_chapter_id: chapter.chapter.id,
          title: values.title,
          lecture_number: values.lecture_number ?? lectures.length + 1,
          source: 'other',
          platform: null,
          instructor: null,
          lecture_date: values.lecture_date,
          duration_minutes: null,
          is_completed: false,
          notes: values.notes?.trim() ? values.notes.trim() : null,
          follow_up: null,
          is_demo: false,
        });
        await repo.ensureLectureChecklistDefaults(lecture.id);
        return lecture;
      });
      setAddOpen(false);
      await notify('Lecture added with its default checklist. Rename items to match your class.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const saveTarget = async (value: string) => {
    const parsed = value.trim() === '' ? null : Number(value);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 500)) {
      await notify('Lecture target must be a whole number between 0 and 500, or blank.', 'danger');
      return;
    }
    try {
      await mutate((repo) => repo.update('user_chapters', chapter.chapter.id, { lecture_target_count: parsed }));
      await notify(parsed === null ? 'Lecture target cleared.' : `Lecture target set to ${parsed}.`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <SectionCard
      title="Lectures"
      hint={
        target !== null
          ? `${completed}/${target} completed · ${lectures.length} recorded`
          : `${completed} completed · ${lectures.length} recorded`
      }
      action={
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setAddOpen(true)}>
          <IonIcon icon={addOutline} aria-hidden="true" /> Add lecture
        </button>
      }
    >
      {target !== null ? (
        <ProgressBar
          percent={target === 0 ? 0 : Math.min(100, Math.round((completed / target) * 100))}
          done={completed}
          total={target}
          label="Lecture completion against your target"
        />
      ) : (
        <Notice tone="neutral">
          No lecture target set for this chapter — counts differ per chapter, so nothing is assumed. Set the real
          number when you know it (Edit chapter → Lecture target).
        </Notice>
      )}

      <div style={{ marginTop: 10 }}>
        {lectures.length === 0 ? (
          <p className="small muted">
            <IonIcon icon={videocamOutline} aria-hidden="true" /> No lectures yet. Add them one by one as you watch —
            each gets its own checklist and notes.
          </p>
        ) : (
          lectures.map((lecture) => <LectureCard key={lecture.id} lecture={lecture} chapter={chapter} />)
        )}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="small muted" style={{ cursor: 'pointer' }}>Lecture target for this chapter</summary>
        <form
          className="row"
          style={{ marginTop: 8, gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            const input = (event.currentTarget.elements.namedItem('target') as HTMLInputElement | null)?.value ?? '';
            void saveTarget(input);
          }}
        >
          <input
            name="target"
            type="number"
            min={0}
            max={500}
            className="input"
            style={{ maxWidth: 120 }}
            defaultValue={target ?? ''}
            aria-label="Planned lecture count for this chapter"
            placeholder="e.g. 8"
          />
          <button type="submit" className="btn btn--secondary btn--sm">Save target</button>
        </form>
      </details>

      {addOpen ? (
        <RecordDialog<LectureEditValues>
          title={`Add lecture to ${chapter.title}`}
          description="One lecture record per class/video. It starts unchecked with a small default checklist you can rename, extend or trim."
          schema={lectureEditSchema}
          defaultValues={{
            title: '',
            lecture_number: String(lectures.length + 1),
            lecture_date: new Date().toISOString().slice(0, 10),
            notes: '',
          }}
          submitLabel="Add lecture"
          fields={[
            { name: 'title', label: 'Lecture title', type: 'text', placeholder: 'e.g. Projectile motion — part 1' },
            { name: 'lecture_number', label: 'Lecture number', type: 'number', optional: true },
            { name: 'lecture_date', label: 'Date', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, optional: true },
          ]}
          onSubmit={addLecture}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </SectionCard>
  );
}
