import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { noteSchema, type NoteValues } from '@/domain/schemas';
import { NOTE_KINDS, type NoteKind, type StudyNote } from '@/types/domain';
import { errorMessage } from '@/utils/errors';

const KIND_LABELS: Record<NoteKind, string> = {
  note: 'Note',
  formula: 'Formula',
  definition: 'Definition',
  bookmark: 'Bookmark',
};

const KIND_OPTIONS = NOTE_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));

function VaultContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<NoteKind | 'all'>('all');
  const [subjectId, setSubjectId] = useState('');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [dialog, setDialog] = useState<{ editing: StudyNote | null } | null>(null);

  const notesSource = data?.scoped.notes;
  const notes = useMemo(() => notesSource ?? [], [notesSource]);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return notes
      .filter((note) => kind === 'all' || note.kind === kind)
      .filter((note) => !subjectId || note.user_subject_id === subjectId)
      .filter((note) => !onlyPinned || note.is_pinned)
      .filter(
        (note) =>
          term.length === 0 ||
          note.title.toLowerCase().includes(term) ||
          note.body.toLowerCase().includes(term) ||
          (note.tags ?? []).some((tag) => tag.toLowerCase().includes(term)),
      )
      .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || (a.updated_at < b.updated_at ? 1 : -1));
  }, [notes, kind, subjectId, onlyPinned, query]);

  if (!data) return null;
  const { scoped: bundle, view } = data;

  const saveNote = async (values: NoteValues) => {
    const chapterId = values.user_chapter_id || null;
    const payload = {
      title: values.title,
      body: values.body,
      user_subject_id: values.user_subject_id || null,
      user_chapter_id: chapterId,
      kind: values.kind,
      tags: values.tags,
      is_pinned: values.is_pinned,
    };
    if (dialog?.editing) {
      await mutate((repo) => repo.update('notes', dialog.editing!.id, payload));
      await notify('Vault item updated.');
    } else {
      await mutate((repo) => repo.create('notes', { ...payload, is_demo: false }));
      await notify('Saved to the vault.');
    }
    setDialog(null);
  };

  const togglePin = async (note: StudyNote) => {
    try {
      await mutate((repo) => repo.update('notes', note.id, { is_pinned: !note.is_pinned }));
      await notify(note.is_pinned ? 'Unpinned.' : 'Pinned to the top.', 'medium');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const counts = NOTE_KINDS.map((value) => ({ kind: value, count: notes.filter((note) => note.kind === value).length }));

  return (
    <>
      <PageHeader
        title="Formula vault"
        description="Search every note, formula, definition and bookmark you have saved. Pinned items stay at the top; nothing here is fetched from outside."
        actions={
          <>
            <Link to="/notes" className="btn btn--secondary btn--sm">
              Notes &amp; resources
            </Link>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ editing: null })}>
              New vault item
            </button>
          </>
        }
      />

      <SectionCard title="Search" hint={`${notes.length} item(s) in total`}>
        <div className="grid grid--two">
          <label className="field">
            <span className="field__label">Search title, body and tags</span>
            <input
              className="input"
              type="search"
              value={query}
              placeholder="e.g. projectile, Newton, pH"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Subject</span>
            <select className="input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">All subjects</option>
              {view.subjects.map((subject) => (
                <option key={subject.subject.id} value={subject.subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${kind === 'all' ? 'chip--on' : ''}`}
            onClick={() => setKind('all')}
          >
            All <span className="mono-num">{notes.length}</span>
          </button>
          {counts.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className={`chip ${kind === entry.kind ? 'chip--on' : ''}`}
              onClick={() => setKind(entry.kind)}
            >
              {KIND_LABELS[entry.kind]} <span className="mono-num">{entry.count}</span>
            </button>
          ))}
          <label className="chip">
            <input type="checkbox" checked={onlyPinned} onChange={(event) => setOnlyPinned(event.target.checked)} />
            Pinned only
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Results" hint={`${results.length} item(s) match`}>
        {results.length === 0 ? (
          <EmptyState
            title={notes.length === 0 ? 'The vault is empty' : 'No item matches this search'}
            message={
              notes.length === 0
                ? 'Save a formula, a definition or a note with the “New vault item” button. A search over nothing is not proof you know nothing.'
                : 'Try a shorter term, or clear the filters.'
            }
          />
        ) : (
          <ul className="list">
            {results.map((note) => {
              const subject = note.user_subject_id ? view.subjectById.get(note.user_subject_id) : null;
              return (
                <li key={note.id} className="list-row">
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {note.title} <Badge tone={note.kind === 'formula' ? 'info' : 'neutral'}>{KIND_LABELS[note.kind ?? 'note']}</Badge>{' '}
                      {note.is_pinned ? <Badge tone="good">Pinned</Badge> : null}
                    </div>
                    <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
                      {note.body.length > 400 ? `${note.body.slice(0, 400)}…` : note.body}
                    </p>
                    <div className="list-row__meta">
                      {subject ? <span>{subject.label}</span> : <span>No subject</span>}
                      {note.user_chapter_id ? (
                        <span>{view.phase2.chapterTitles[note.user_chapter_id] ?? 'Chapter'}</span>
                      ) : null}
                      {(note.tags ?? []).map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                      <span>updated {note.updated_at.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="list-row__actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void togglePin(note)}>
                      {note.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDialog({ editing: note })}>
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Notice tone="neutral">
          The vault searches only what you saved. It does not read your textbook, and it never presents AI-generated
          content as a formula you should trust without checking.
        </Notice>
      </SectionCard>

      <SectionCard title="Vault items by subject" hint="Counts only — no ranking of importance.">
        {bundle.notes.length === 0 ? (
          <p className="small muted">Nothing saved yet.</p>
        ) : (
          <div className="chip-row">
            {view.subjects.map((subject) => {
              const count = bundle.notes.filter((note) => note.user_subject_id === subject.subject.id).length;
              return (
                <span key={subject.subject.id} className="chip">
                  {subject.label} <span className="mono-num">{count}</span>
                </span>
              );
            })}
            <span className="chip">
              Unassigned <span className="mono-num">{bundle.notes.filter((note) => !note.user_subject_id).length}</span>
            </span>
          </div>
        )}
      </SectionCard>

      {dialog ? (
        <RecordDialog<NoteValues>
          title={dialog.editing ? 'Edit vault item' : 'New vault item'}
          description="Formulas and definitions are notes with a kind, so search and export treat them consistently."
          fields={[
            { name: 'title', label: 'Title', type: 'text' },
            { name: 'kind', label: 'Kind', type: 'select', options: KIND_OPTIONS },
            { name: 'body', label: 'Body', type: 'textarea', rows: 7 },
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              optional: true,
              options: view.subjects.map((subject) => ({ value: subject.subject.id, label: subject.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              options: (values) =>
                values.user_subject_id
                  ? (view.subjectById.get(String(values.user_subject_id))?.chapters ?? []).map((chapter) => ({
                      value: chapter.chapter.id,
                      label: chapter.title,
                    }))
                  : [],
            },
            { name: 'tags', label: 'Tags', type: 'text', optional: true, placeholder: 'comma separated, up to 10' },
            { name: 'is_pinned', label: 'Pin to the top', type: 'checkbox' },
          ]}
          schema={noteSchema}
          defaultValues={{
            title: dialog.editing?.title ?? '',
            kind: dialog.editing?.kind ?? 'note',
            body: dialog.editing?.body ?? '',
            user_subject_id: dialog.editing?.user_subject_id ?? '',
            user_chapter_id: dialog.editing?.user_chapter_id ?? '',
            tags: dialog.editing?.tags?.join(', ') ?? '',
            is_pinned: dialog.editing?.is_pinned ?? false,
          }}
          submitLabel={dialog.editing ? 'Save item' : 'Save to vault'}
          onSubmit={saveNote}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

export function VaultPage() {
  return <WorkspaceGate>{() => <VaultContent />}</WorkspaceGate>;
}
