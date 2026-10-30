import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { PAPER_LABEL_SUGGESTIONS, classLabel, paperLabelRelevant, type ClassLevel } from '@/domain/classLevels';
import { findDuplicateSubject } from '@/domain/chapterGeneration';

export interface SubjectDraft {
  name: string;
  nameBn: string;
  paperLabel: string;
  /** Identity colour for the subject's card mark. */
  color: string;
}

/**
 * Eight distinguishable fills. Deliberately not the theme presets: a subject's
 * colour is a label, and it must stay recognisable while the student changes the
 * app's accent.
 */
export const SUBJECT_COLORS = ['#0EA5E9', '#8A50F5', '#F59E0B', '#10B981', '#F43F5E', '#2563EB', '#0F766E', '#C2410C'];

const EMPTY: SubjectDraft = { name: '', nameBn: '', paperLabel: '', color: SUBJECT_COLORS[0] as string };

/**
 * Add a subject.
 *
 * Three fields, two of them optional, and no mention of sources, editions or
 * verification — those belong to imported official data, not to a student
 * typing "Physics" on a Tuesday night.
 */
export function AddSubjectDialog({
  open,
  classLevel,
  existing,
  onClose,
  onSave,
  initial,
  initialName,
}: {
  open: boolean;
  classLevel: ClassLevel;
  /** Active subjects in this class, for the duplicate check. */
  existing: { id: string; name: string; paperLabel: string | null }[];
  onClose: () => void;
  onSave: (draft: SubjectDraft) => Promise<void>;
  /** Pre-filled values: the same dialog edits an existing subject. */
  initial?: SubjectDraft | null;
  /** A suggested name from the subject library, for a brand-new subject. */
  initialName?: string | null;
}) {
  const [draft, setDraft] = useState<SubjectDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(initial);

  useEffect(() => {
    if (open) {
      setDraft(initial ?? (initialName ? { ...EMPTY, name: initialName } : EMPTY));
      setError(null);
      setBusy(false);
    }
    // Only reset when the dialog opens or the subject being edited changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.name, initial?.nameBn, initial?.paperLabel, initialName]);

  const duplicate = draft.name.trim()
    ? findDuplicateSubject((initial ? existing.filter((s) => s.name !== initial.name || s.paperLabel !== (initial.paperLabel || null)) : existing).map((s) => ({ ...s, classLevel })), {
        name: draft.name,
        paperLabel: draft.paperLabel || null,
        classLevel,
      })
    : null;

  const canSave = draft.name.trim().length > 0 && !duplicate && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that subject.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={editing ? 'Edit subject' : 'Add subject'}
      description={`${classLabel(classLevel)} · you can rename or remove it any time.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={!canSave}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save subject'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span className="field__label">Subject name</span>
          <input
            className="input"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Physics"
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field__label">
            Bengali name <span className="field__optional">optional</span>
          </span>
          <input
            className="input bn"
            value={draft.nameBn}
            onChange={(event) => setDraft((current) => ({ ...current, nameBn: event.target.value }))}
            placeholder="পদার্থবিজ্ঞান"
            lang="bn"
          />
        </label>

        {paperLabelRelevant(classLevel, Boolean(draft.paperLabel)) ? (
          <div className="field">
            <span className="field__label">
              Paper <span className="field__optional">optional</span>
            </span>
            <div className="chip-row" style={{ marginBottom: 6 }}>
              {PAPER_LABEL_SUGGESTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`chip chip--action${draft.paperLabel === label ? ' chip--active' : ''}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      paperLabel: current.paperLabel === label ? '' : label,
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="input"
              value={draft.paperLabel}
              onChange={(event) => setDraft((current) => ({ ...current, paperLabel: event.target.value }))}
              placeholder="Or type your own"
            />
            <span className="field__help">
              Use a paper when the subject is examined in two books, e.g. Physics 1st Paper and Physics 2nd
              Paper. Leave it empty for ordinary subjects.
            </span>
          </div>
        ) : null}

        <div className="field">
          <span className="field__label">Colour</span>
          <div className="swatch-row" role="radiogroup" aria-label="Subject colour">
            {SUBJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.color === color}
                aria-label={`Colour ${color}`}
                className={`swatch${draft.color === color ? ' swatch--active' : ''}`}
                style={{ background: color }}
                onClick={() => setDraft((current) => ({ ...current, color }))}
              />
            ))}
          </div>
          <span className="field__help">Used for this subject&rsquo;s mark, so papers stay easy to tell apart.</span>
        </div>

        {duplicate ? (
          <p className="field__error" role="alert">
            {duplicate.name} is already in {classLabel(classLevel)}. Open it instead of adding a second copy.
          </p>
        ) : null}
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
