import { useEffect, useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { addOutline, checkmarkCircle, searchOutline } from 'ionicons/icons';
import { Dialog } from '@/components/ui/Dialog';
import { Badge, DemoBadge } from '@/components/ui/Page';
import { classLabel, type ClassLevel } from '@/domain/classLevels';
import { subjectDisplayName } from '@/domain/curriculum';
import { groupLabel, normaliseGroup, versionBelongsToProfile } from '@/domain/studentProfile';
import type { CurriculumChapter, CurriculumSubject, CurriculumVersion } from '@/types/domain';

/**
 * Add a subject, from the class's own subject list.
 *
 * The old dialog offered only a blank text box, so the app could hold a complete
 * NCTB subject structure and still show the student an empty form. This lists
 * every subject that applies to the active class and group, with multi-select,
 * so a Class 11 Science student adds Physics, Chemistry and Higher Mathematics in
 * one action — and still has one obvious way out to a custom subject.
 *
 * Nothing here is presented as final: rows keep the reference list's own
 * verification badges, and a class with no reference data says so plainly and
 * offers common names instead of pretending to have an official list.
 */

/** Common school subjects, offered only where no reference list is loaded. */
const STARTER_NAMES: Record<'primary' | 'middle' | 'higher', string[]> = {
  primary: ['Bangla', 'English', 'Mathematics', 'Science', 'Religion', 'Drawing & Crafts'],
  middle: ['Bangla', 'English', 'Mathematics', 'Science', 'Information & Communication Technology', 'Religion'],
  higher: ['Bangla', 'English', 'Information & Communication Technology'],
};

function startersFor(level: ClassLevel): string[] {
  if (level <= 5) return STARTER_NAMES.primary;
  if (level <= 8) return STARTER_NAMES.middle;
  return STARTER_NAMES.higher;
}

export interface LibraryPick {
  versionId: string;
  subjectId: string;
  chapterIds: string[];
}

export function SubjectLibraryDialog({
  open,
  classLevel,
  group,
  versions,
  subjects,
  chapters,
  adoptedSubjectIds,
  busy,
  onAdd,
  onCustom,
  onClose,
}: {
  open: boolean;
  classLevel: ClassLevel;
  group: string | null;
  versions: CurriculumVersion[];
  subjects: CurriculumSubject[];
  chapters: CurriculumChapter[];
  /** Curriculum subject ids already in the student's own subjects. */
  adoptedSubjectIds: ReadonlySet<string>;
  busy: boolean;
  onAdd: (picks: LibraryPick[]) => Promise<void>;
  /** Opens the custom-subject form, optionally pre-filled with a starter name. */
  onCustom: (name?: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected([]);
    }
  }, [open, classLevel, group]);

  const normalisedGroup = normaliseGroup(group);

  /*
   * Scoped here as well as on the templates page. A subject is only offered if
   * its own version belongs to this class and group, so this picker cannot
   * become the back door that leaks another stream's papers into Class 11.
   */
  const applicable = useMemo(() => {
    const scoped = versions.filter((version) =>
      versionBelongsToProfile(version, classLevel, normalisedGroup),
    );
    /*
     * When a reference list exists for this class, the demo structure is noise:
     * it repeats a few real paper names and adds placeholder chapters. The demo
     * version stays reachable on the templates page, labelled as demo.
     */
    const official = scoped.filter((version) => !version.is_demo);
    const visibleVersions = official.length > 0 ? official : scoped;
    const versionById = new Map(visibleVersions.map((version) => [version.id, version]));
    const rows = subjects
      .filter((subject) => versionById.has(subject.curriculum_version_id))
      .map((subject) => ({
        subject,
        version: versionById.get(subject.curriculum_version_id) as CurriculumVersion,
        chapterCount: chapters.filter((chapter) => chapter.curriculum_subject_id === subject.id).length,
      }))
      .sort(
        (a, b) =>
          Number(b.subject.is_compulsory) - Number(a.subject.is_compulsory) ||
          a.subject.sort_order - b.subject.sort_order,
      );

    return rows;
  }, [versions, subjects, chapters, classLevel, normalisedGroup]);

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return applicable;
    return applicable.filter(({ subject }) =>
      [subject.name, subject.name_bn, subject.paper_label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [applicable, term]);

  const toggle = (subjectId: string) => {
    setSelected((current) =>
      current.includes(subjectId) ? current.filter((id) => id !== subjectId) : [...current, subjectId],
    );
  };

  const addSelected = async () => {
    const picks = filtered
      .filter(({ subject }) => selected.includes(subject.id))
      .map(({ subject, version }) => ({
        versionId: version.id,
        subjectId: subject.id,
        chapterIds: chapters
          .filter((chapter) => chapter.curriculum_subject_id === subject.id)
          .map((chapter) => chapter.id),
      }));
    if (picks.length === 0) return;
    await onAdd(picks);
    setSelected([]);
  };

  const scopeLabel = groupLabel(normalisedGroup);
  const scope = scopeLabel ? `${classLabel(classLevel)} · ${scopeLabel}` : classLabel(classLevel);

  return (
    <Dialog
      open={open}
      title="Add subjects"
      description={
        applicable.length === 0
          ? `No official subject list is loaded for ${scope} yet.`
          : `Every subject that applies to ${scope}. Pick as many as you like.`
      }
      onClose={onClose}
      width="34rem"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onCustom()} disabled={busy}>
            <IonIcon icon={addOutline} aria-hidden="true" /> Custom subject
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void addSelected()}
            disabled={busy || selected.length === 0}
          >
            {busy
              ? 'Adding…'
              : selected.length === 0
                ? 'Select subjects'
                : `Add ${selected.length} subject${selected.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      {applicable.length === 0 ? (
        <div className="stack">
          <p className="small">
            No official subject list is loaded for {scope}. Add the subjects you actually study — you can rename or
            remove them at any time.
          </p>
          <div className="field">
            <span className="field__label">Common names</span>
            <div className="chip-row">
              {startersFor(classLevel).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="chip chip--action"
                  onClick={() => onCustom(name)}
                  disabled={busy}
                >
                  {name}
                </button>
              ))}
            </div>
            <span className="field__help">
              Suggestions only, not an official list. Tapping one opens the form with that name.
            </span>
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="field__label">Search</span>
            <div className="input-with-icon">
              <IonIcon icon={searchOutline} aria-hidden="true" />
              <input
                className="input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Physics 2nd Paper, পদার্থবিজ্ঞান, …"
                aria-label="Search subjects"
              />
            </div>
          </label>

          {filtered.length === 0 ? (
            <p className="small muted">No subject matches “{query.trim()}”. Use Custom subject to add it yourself.</p>
          ) : (
            <ul className="subject-library">
              {filtered.map(({ subject, version, chapterCount }) => {
                const adopted = adoptedSubjectIds.has(subject.id);
                const checked = selected.includes(subject.id);
                return (
                  <li key={subject.id}>
                    <label className={`subject-library__row${adopted ? ' subject-library__row--adopted' : ''}`}>
                      <input
                        type="checkbox"
                        checked={adopted || checked}
                        disabled={adopted || busy}
                        onChange={() => toggle(subject.id)}
                        aria-label={`${subject.name}${subject.paper_label ? ` ${subject.paper_label}` : ''}`}
                      />
                      <span className="subject-library__body">
                        <span className="subject-library__name">
                          {subjectDisplayName(subject)}
                          {subject.paper_label ? <span className="muted"> · {subject.paper_label}</span> : null}
                        </span>
                        <span className="subject-library__meta">
                          {adopted
                            ? 'In your subjects'
                            : chapterCount > 0
                              ? `${chapterCount} chapter(s) available`
                              : 'No chapter list yet — add your own'}
                        </span>
                      </span>
                      <span className="subject-library__badges">
                        {adopted ? (
                          <IonIcon icon={checkmarkCircle} aria-hidden="true" className="subject-library__tick" />
                        ) : null}
                        {subject.is_compulsory ? <Badge tone="neutral">Core</Badge> : null}
                        {version.is_demo ? <DemoBadge /> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
