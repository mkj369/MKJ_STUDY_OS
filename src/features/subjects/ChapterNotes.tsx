/**
 * Free-form notes attached to the chapter itself (user_chapters.notes).
 * Private to the student — never part of community sharing.
 */
import { useState } from 'react';
import { useMutate } from '@/hooks/useWorkspace';
import { SectionCard } from '@/components/ui/Page';
import { useNotify } from '@/features/shared/WorkspaceGate';
import { errorMessage } from '@/utils/errors';
import type { ChapterView } from '@/features/shared/selectors';

export function ChapterNotes({ chapter }: { chapter: ChapterView }) {
  const mutate = useMutate();
  const notify = useNotify();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const current = chapter.chapter.notes ?? '';
  const value = draft ?? current;
  const dirty = draft !== null && draft !== current;

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await mutate((repo) => repo.update('user_chapters', chapter.chapter.id, { notes: draft.trim() || null }));
      setDraft(null);
      await notify('Chapter notes saved.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Chapter notes" hint="Private — only you can see these">
      <textarea
        className="input"
        rows={4}
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Key ideas, mistakes to avoid, exam hints for this chapter…"
        aria-label={`Notes for ${chapter.title}`}
        maxLength={8000}
      />
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save notes'}
        </button>
        {dirty ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(null)} disabled={saving}>
            Discard changes
          </button>
        ) : (
          <span className="tiny muted">{current ? 'All changes saved.' : 'Nothing written yet.'}</span>
        )}
      </div>
    </SectionCard>
  );
}
