import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import {
  describeGeneration,
  nextChapterNumber,
  planChapterGeneration,
  type ExistingChapter,
} from '@/domain/chapterGeneration';

type Mode = 'one' | 'many' | 'custom';

/**
 * Add chapters.
 *
 * Three ways, all one screen away:
 *   one    — the next number, no typing.
 *   many   — "how many?", previewed before saving.
 *   custom — a title the student already knows.
 *
 * The preview is not decoration: it is the only way to see that adding 12 to a
 * subject holding 1–4 lands on 5–16 rather than 1–12, which is the mistake this
 * dialog exists to prevent.
 */
export function AddChapterDialog({
  open,
  subjectName,
  existing,
  onClose,
  onGenerate,
  onCreateCustom,
}: {
  open: boolean;
  subjectName: string;
  existing: ExistingChapter[];
  onClose: () => void;
  onGenerate: (count: number) => Promise<void>;
  onCreateCustom: (title: string, titleBn: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('many');
  const [count, setCount] = useState('10');
  const [title, setTitle] = useState('');
  const [titleBn, setTitleBn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextNumber = nextChapterNumber(existing);
  const numericCount = Number.parseInt(count, 10);

  const planned = useMemo(() => {
    if (mode === 'one') return planChapterGeneration(existing, 1);
    if (mode === 'many') return planChapterGeneration(existing, Number.isFinite(numericCount) ? numericCount : 0);
    return [];
  }, [mode, existing, numericCount]);

  useEffect(() => {
    if (!open) return;
    setMode(existing.length === 0 ? 'many' : 'one');
    setCount('10');
    setTitle('');
    setTitleBn('');
    setError(null);
    setBusy(false);
  }, [open, existing.length]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add those chapters.');
      setBusy(false);
    }
  };

  const canSubmit =
    !busy && (mode === 'custom' ? title.trim().length > 0 : planned.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    if (mode === 'custom') {
      void run(() => onCreateCustom(title, titleBn));
      return;
    }
    void run(() => onGenerate(planned.length));
  };

  return (
    <Dialog
      open={open}
      title="Add chapters"
      description={subjectName}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Adding…' : mode === 'custom' ? 'Add chapter' : `Add ${planned.length} chapter${planned.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="gen-options" role="radiogroup" aria-label="How to add chapters">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'one'}
          className={`gen-option${mode === 'one' ? ' gen-option--active' : ''}`}
          onClick={() => setMode('one')}
        >
          <span className="gen-option__title">Add one</span>
          <span className="gen-option__hint">Chapter {nextNumber}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'many'}
          className={`gen-option${mode === 'many' ? ' gen-option--active' : ''}`}
          onClick={() => setMode('many')}
        >
          <span className="gen-option__title">Add several</span>
          <span className="gen-option__hint">Numbered automatically</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'custom'}
          className={`gen-option${mode === 'custom' ? ' gen-option--active' : ''}`}
          onClick={() => setMode('custom')}
        >
          <span className="gen-option__title">Write a title</span>
          <span className="gen-option__hint">When you know the name</span>
        </button>
      </div>

      {mode === 'many' ? (
        <label className="field">
          <span className="field__label">How many chapters?</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            autoFocus
          />
        </label>
      ) : null}

      {mode === 'custom' ? (
        <>
          <label className="field">
            <span className="field__label">Chapter title</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="ভেক্টর"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field__label">
              Bengali title <span className="field__optional">optional</span>
            </span>
            <input
              className="input bn"
              lang="bn"
              value={titleBn}
              onChange={(event) => setTitleBn(event.target.value)}
              placeholder="যদি আলাদা লিখতে চান"
            />
          </label>
        </>
      ) : null}

      {mode !== 'custom' && planned.length > 0 ? (
        <p className="gen-preview">
          {describeGeneration(planned)}
          {planned[0] && planned[0].chapter_number > 1
            ? ' · starts after your last chapter'
            : ' · starts from the beginning'}
        </p>
      ) : null}

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
