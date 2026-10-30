import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline, documentTextOutline, linkOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { noteSchema, resourceSchema, type NoteValues, type ResourceValues } from '@/domain/schemas';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { StudyNote, StudyResource } from '@/types/domain';
import { NOTE_KINDS, RESOURCE_TYPES } from '@/types/domain';

const NOTE_KIND_LABELS: Record<string, string> = {
  note: 'Note',
  formula: 'Formula / equation',
  definition: 'Definition',
  bookmark: 'Bookmark',
};

const RESOURCE_LABELS: Record<string, string> = {
  book: 'Book',
  pdf: 'PDF / document',
  video: 'Video',
  link: 'Web link',
  coaching: 'Coaching material',
  other: 'Other',
};
const RESOURCE_OPTIONS = RESOURCE_TYPES.map((value) => ({ value, label: RESOURCE_LABELS[value] ?? value }));
const NOTE_KIND_OPTIONS = NOTE_KINDS.map((value) => ({ value, label: NOTE_KIND_LABELS[value] ?? value }));

function NotesContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [tab, setTab] = useState<'notes' | 'resources'>('notes');
  const [noteDialog, setNoteDialog] = useState(false);
  const [editingNote, setEditingNote] = useState<StudyNote | null>(null);
  const [resourceDialog, setResourceDialog] = useState(false);
  const [editingResource, setEditingResource] = useState<StudyResource | null>(null);

  if (!data) return null;
  const { view, scoped: bundle } = data;
  const notes = [...bundle.notes].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const resources = [...bundle.resources].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const saveNote = async (values: NoteValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    const payload = {
      title: values.title,
      body: values.body,
      user_subject_id: values.user_subject_id || null,
      user_chapter_id: chapterId,
      kind: values.kind,
      tags: values.tags,
      is_pinned: values.is_pinned,
    };
    if (editingNote) {
      await mutate((repo) => repo.update('notes', editingNote.id, payload));
      await notify('Note saved.');
    } else {
      await mutate((repo) => repo.create('notes', { ...payload, is_demo: false }));
      await notify('Note created.');
    }
    setNoteDialog(false);
    setEditingNote(null);
  };

  const saveResource = async (values: ResourceValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    const tags = values.tags
      ? values.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 10)
      : null;
    const payload = {
      title: values.title,
      resource_type: values.resource_type,
      user_subject_id: values.user_subject_id || null,
      user_chapter_id: chapterId,
      url: emptyToNull(values.url),
      storage_path: null,
      description: emptyToNull(values.description),
      tags,
    };
    if (editingResource) {
      await mutate((repo) => repo.update('study_resources', editingResource.id, payload));
      await notify('Resource updated.');
    } else {
      await mutate((repo) => repo.create('study_resources', { ...payload, is_demo: false }));
      await notify('Resource saved.');
    }
    setResourceDialog(false);
    setEditingResource(null);
  };

  const deleteNote = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('notes', id));
      await notify('Note deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const deleteResource = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('study_resources', id));
      await notify('Resource deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Notes & Resources"
        description="Private notes and links. Personal uploads are stored per user; copyright and provider access rules still apply."
        actions={
          tab === 'notes' ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setEditingNote(null);
                setNoteDialog(true);
              }}
            >
              <IonIcon icon={addOutline} aria-hidden="true" /> New note
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setEditingResource(null);
                setResourceDialog(true);
              }}
            >
              <IonIcon icon={addOutline} aria-hidden="true" /> Add resource
            </button>
          )
        }
      />

      <div className="segmented" role="tablist" aria-label="Notes or resources">
        <button type="button" role="tab" aria-selected={tab === 'notes'} aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>
          Notes ({notes.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'resources'}
          aria-pressed={tab === 'resources'}
          onClick={() => setTab('resources')}
        >
          Resources ({resources.length})
        </button>
      </div>

      <div style={{ height: 12 }} />

      {tab === 'notes' ? (
        <SectionCard title="Your notes" hint="Visible only to your account">
          {notes.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={documentTextOutline} aria-hidden="true" />}
              title="No notes yet"
              message="Write short notes you will actually re-read: a formula, a corrected idea, a question to ask."
              action={
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setNoteDialog(true)}>
                  Write a note
                </button>
              }
            />
          ) : (
            <div className="list">
              {notes.map((note) => {
                const subject = note.user_subject_id ? view.subjectById.get(note.user_subject_id) : null;
                const chapter = note.user_chapter_id ? view.chapterById.get(note.user_chapter_id) : null;
                return (
                  <div className="list-row" key={note.id}>
                    <div className="list-row__main">
                      <div className="list-row__title">{note.title}</div>
                      <div className="list-row__meta">
                        <span>{note.updated_at.slice(0, 10)}</span>
                        {subject ? <span>{subject.label}</span> : null}
                        {chapter ? <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link> : null}
                      </div>
                      <p className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
                        {note.body.length > 320 ? `${note.body.slice(0, 320)}…` : note.body}
                      </p>
                    </div>
                    <div className="list-row__actions">
                      {note.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => {
                          setEditingNote(note);
                          setNoteDialog(true);
                        }}
                      >
                        Edit
                      </button>
                      <ConfirmDeleteButton onConfirm={() => deleteNote(note.id)} label="Delete" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Resources" hint="Links to material you are allowed to access">
          <Notice tone="warn" title="Respect copyright.">
            Link to material instead of re-uploading paid or protected content. Do not share coaching PDFs or
            textbook scans you do not have rights to distribute.
          </Notice>
          <div style={{ height: 12 }} />
          {resources.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={linkOutline} aria-hidden="true" />}
              title="No resources yet"
              message="Save a link to a lecture playlist, a practice sheet or a book reference — with your own short description."
              action={
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setResourceDialog(true)}>
                  Add a resource
                </button>
              }
            />
          ) : (
            <div className="list">
              {resources.map((resource) => {
                const subject = resource.user_subject_id ? view.subjectById.get(resource.user_subject_id) : null;
                const chapter = resource.user_chapter_id ? view.chapterById.get(resource.user_chapter_id) : null;
                return (
                  <div className="list-row" key={resource.id}>
                    <div className="list-row__main">
                      <div className="list-row__title">
                        {resource.url ? (
                          <a href={resource.url} target="_blank" rel="noreferrer noopener">
                            {resource.title}
                          </a>
                        ) : (
                          resource.title
                        )}
                      </div>
                      <div className="list-row__meta">
                        <span>{RESOURCE_LABELS[resource.resource_type] ?? resource.resource_type}</span>
                        {subject ? <span>{subject.label}</span> : null}
                        {chapter ? <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link> : null}
                        {resource.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
                      </div>
                      {resource.description ? <p className="tiny muted">{resource.description}</p> : null}
                    </div>
                    <div className="list-row__actions">
                      {resource.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => {
                          setEditingResource(resource);
                          setResourceDialog(true);
                        }}
                      >
                        Edit
                      </button>
                      <ConfirmDeleteButton onConfirm={() => deleteResource(resource.id)} label="Delete" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {noteDialog ? (
        <RecordDialog<NoteValues>
          title={editingNote ? 'Edit note' : 'New note'}
          schema={noteSchema}
          defaultValues={{
            title: editingNote?.title ?? '',
            body: editingNote?.body ?? '',
            user_subject_id: editingNote?.user_subject_id ?? '',
            user_chapter_id: editingNote?.user_chapter_id ?? '',
            kind: editingNote?.kind ?? 'note',
            tags: editingNote?.tags?.join(', ') ?? '',
            is_pinned: editingNote?.is_pinned ?? false,
          }}
          submitLabel="Save note"
          fields={[
            { name: 'title', label: 'Title', type: 'text' },
            { name: 'kind', label: 'Kind', type: 'select', options: NOTE_KIND_OPTIONS },
            { name: 'body', label: 'Note', type: 'textarea', rows: 8 },
            { name: 'tags', label: 'Tags', type: 'text', optional: true, placeholder: 'comma separated' },
            { name: 'is_pinned', label: 'Pin this item', type: 'checkbox' },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              placeholder: 'No subject',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              placeholder: 'No chapter',
              options: (values) => {
                const subject = view.subjectById.get(String(values['user_subject_id'] ?? ''));
                return (subject?.chapters ?? []).map((c) => ({ value: c.chapter.id, label: c.title }));
              },
            },
          ]}
          onSubmit={saveNote}
          onClose={() => {
            setNoteDialog(false);
            setEditingNote(null);
          }}
        />
      ) : null}

      {resourceDialog ? (
        <RecordDialog<ResourceValues>
          title={editingResource ? 'Edit resource' : 'Add resource'}
          schema={resourceSchema}
          defaultValues={{
            title: editingResource?.title ?? '',
            resource_type: editingResource?.resource_type ?? 'link',
            user_subject_id: editingResource?.user_subject_id ?? '',
            user_chapter_id: editingResource?.user_chapter_id ?? '',
            url: editingResource?.url ?? '',
            description: editingResource?.description ?? '',
            tags: editingResource?.tags?.join(', ') ?? '',
          }}
          submitLabel="Save resource"
          fields={[
            { name: 'title', label: 'Title', type: 'text' },
            { name: 'resource_type', label: 'Type', type: 'select', options: RESOURCE_OPTIONS },
            { name: 'url', label: 'URL', type: 'url', optional: true, placeholder: 'https://…' },
            {
              name: 'description',
              label: 'Description',
              type: 'textarea',
              rows: 2,
              optional: true,
              help: 'Why is this useful? What chapter does it cover?',
            },
            {
              name: 'tags',
              label: 'Tags',
              type: 'text',
              optional: true,
              placeholder: 'practice, derivation (comma separated)',
            },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              placeholder: 'No subject',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              placeholder: 'No chapter',
              options: (values) => {
                const subject = view.subjectById.get(String(values['user_subject_id'] ?? ''));
                return (subject?.chapters ?? []).map((c) => ({ value: c.chapter.id, label: c.title }));
              },
            },
          ]}
          onSubmit={saveResource}
          onClose={() => {
            setResourceDialog(false);
            setEditingResource(null);
          }}
        />
      ) : null}
    </>
  );
}

export function NotesPage() {
  return <WorkspaceGate>{() => <NotesContent />}</WorkspaceGate>;
}
