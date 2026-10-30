import { useState } from 'react';
import { readableOn } from '@/domain/theme';
import { IonIcon } from '@ionic/react';
import {
  addOutline,
  checkmarkOutline,
  chevronDownOutline,
  ellipsisHorizontal,
  openOutline,
  pencilOutline,
  trashOutline,
  archiveOutline,
  layersOutline,
} from 'ionicons/icons';
import type { ChapterProgress } from '@/domain/progress';
import type { UserChapter, UserSubject } from '@/types/domain';

/**
 * One subject, as the student sees it.
 *
 * Everything visible is something the student can act on: the name, how many
 * chapters exist, how many are done, a progress bar, and two actions. Source
 * notes, verification state and gap warnings are not here — they belong to the
 * official template browser, and repeating them on a personal subject says
 * nothing useful.
 */

export interface ChapterRow {
  chapter: UserChapter;
  /** Display title: the student's, or the generated placeholder. */
  title: string;
  titleBn: string | null;
  number: number | null;
  progress: ChapterProgress | null;
  /** True when the title is still "Chapter N" and has never been edited. */
  isPlaceholder: boolean;
  /** Set when this chapter came from an official list. */
  sourceLabel?: string | null;
  sourceUrl?: string | null;
}

export function SubjectCard({
  subject,
  chapters,
  busy,
  onAddChapter,
  onOpenChapter,
  onRename,
  onToggleDone,
  onRemoveChapter,
  onMoveChapter,
  onArchive,
  onDelete,
  onOpenSubject,
  onSetClass,
  onEdit,
  classLevel,
  displayName,
  paperLabel,
}: {
  subject: UserSubject;
  chapters: ChapterRow[];
  /** Resolved name, including a curriculum subject when the student adopted one. */
  displayName?: string;
  /** Paper label from the student or the curriculum source. */
  paperLabel?: string | null;
  /** The class this subject is filed under, or null for pre-class records. */
  classLevel?: number | null;
  busy: boolean;
  onAddChapter: () => void;
  onOpenChapter: (chapterId: string) => void;
  onRename: (chapterId: string, title: string, titleBn: string, number: number | null) => Promise<void>;
  onToggleDone: (chapterId: string, done: boolean) => Promise<void>;
  onRemoveChapter: (chapterId: string, title: string) => void;
  onMoveChapter: (chapterId: string, direction: -1 | 1) => void;
  onArchive: () => void;
  onDelete: () => void;
  onOpenSubject: () => void;
  onSetClass?: (level: number) => Promise<void>;
  /** Rename the subject, change its Bengali name or paper label. */
  onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBn, setDraftBn] = useState('');
  const [draftNumber, setDraftNumber] = useState('');

  const name = displayName ?? subject.custom_name ?? 'Subject';
  const paper = paperLabel ?? subject.custom_paper_label;
  const total = chapters.length;
  const done = chapters.filter((row) => row.progress?.isFullyChecklisted).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const initials = name.trim().slice(0, 2).toUpperCase();

  const startEdit = (row: ChapterRow) => {
    setEditing(row.chapter.id);
    setDraftTitle(row.title);
    setDraftBn(row.titleBn ?? '');
    setDraftNumber(row.number === null ? '' : String(row.number));
  };

  const saveEdit = async (row: ChapterRow) => {
    const numeric = Number.parseInt(draftNumber, 10);
    await onRename(
      row.chapter.id,
      draftTitle,
      draftBn,
      Number.isFinite(numeric) ? numeric : row.number,
    );
    setEditing(null);
  };

  return (
    <article className="subject-card" data-subject-id={subject.id}>
      <div className="subject-card__head">
        <div
          className="subject-card__mark"
          aria-hidden="true"
          style={{ background: subject.color, color: readableOn(subject.color) }}
        >
          {initials}
        </div>
        <div className="subject-card__identity">
          <h3 className="subject-card__name">
            {name}
            {paper ? <span className="subject-card__paper">{paper}</span> : null}
          </h3>
          {subject.name_bn ? <div className="subject-card__bn">{subject.name_bn}</div> : null}
          <div className="subject-card__meta">
            <span>
              {total} {total === 1 ? 'chapter' : 'chapters'}
            </span>
            <span>{done} completed</span>
            {classLevel === null ? <span className="subject-card__flag">No class</span> : null}
          </div>
        </div>
        <div className="menu">
          <button
            type="button"
            className="btn btn--icon"
            aria-label={`More options for ${name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="menu__panel" role="menu">
              <button
                type="button"
                className="menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSubject();
                }}
              >
                <IonIcon icon={openOutline} aria-hidden="true" /> Open subject
              </button>
              {onEdit ? (
                <button
                  type="button"
                  className="menu__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                >
                  <IonIcon icon={pencilOutline} aria-hidden="true" /> Edit subject
                </button>
              ) : null}
              {onSetClass ? (
                <button
                  type="button"
                  className="menu__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setClassPickerOpen(true);
                  }}
                >
                  <IonIcon icon={layersOutline} aria-hidden="true" /> Set class
                </button>
              ) : null}
              <button
                type="button"
                className="menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onArchive();
                }}
              >
                <IonIcon icon={archiveOutline} aria-hidden="true" /> Archive
              </button>
              <button
                type="button"
                className="menu__item menu__item--danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <IonIcon icon={trashOutline} aria-hidden="true" /> Delete subject
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {classPickerOpen && onSetClass ? (
        <div className="class-inline" role="group" aria-label={`Set class for ${name}`}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((level) => (
            <button
              key={level}
              type="button"
              className={`class-chip${classLevel === level ? ' class-chip--active' : ''}`}
              aria-pressed={classLevel === level}
              onClick={() => {
                setClassPickerOpen(false);
                void onSetClass(level);
              }}
            >
              {level}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <div className="progress-label">
          <span>Progress</span>
          <span className="progress-label__value">
            {done}/{total}
          </span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} progress`}
        >
          <div className="progress__bar" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="subject-card__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onAddChapter} disabled={busy}>
          <IonIcon icon={addOutline} aria-hidden="true" /> Add chapter
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <IonIcon icon={chevronDownOutline} aria-hidden="true" />
          {expanded ? 'Hide chapters' : 'Open chapters'}
        </button>
      </div>

      {expanded ? (
        total === 0 ? (
          <div className="empty" style={{ padding: 'var(--s-5) var(--s-2)' }}>
            <p className="empty__title">No chapters yet.</p>
            <button type="button" className="btn btn--primary btn--sm empty__action" onClick={onAddChapter}>
              <IonIcon icon={addOutline} aria-hidden="true" /> Add chapter
            </button>
          </div>
        ) : (
          <ul className="chapter-rows">
            {chapters.map((row, index) => {
              const isDone = row.progress?.isFullyChecklisted ?? false;
              const isEditing = editing === row.chapter.id;
              return (
                <li key={row.chapter.id}>
                  <div className="chapter-row">
                    <button
                      type="button"
                      className={`chapter-row__done-toggle${isDone ? ' chapter-row__done-toggle--on' : ''}`}
                      aria-label={isDone ? `Mark ${row.title} not done` : `Mark ${row.title} done`}
                      aria-pressed={isDone}
                      onClick={() => void onToggleDone(row.chapter.id, !isDone)}
                    >
                      <IonIcon icon={checkmarkOutline} aria-hidden="true" style={{ fontSize: 13 }} />
                    </button>
                    <span className="chapter-row__num" aria-hidden="true">
                      {row.number ?? index + 1}
                    </span>
                    <div className="chapter-row__body">
                      <button
                        type="button"
                        className={`chapter-row__title${isDone ? ' chapter-row__title--done' : ''} chapter-row__title-btn`}
                        onClick={() => onOpenChapter(row.chapter.id)}
                      >
                        {row.title}
                        {row.titleBn ? <span className="chapter-row__bn">{row.titleBn}</span> : null}
                      </button>
                      {row.sourceLabel ? (
                        <div className="chapter-row__source">
                          {row.sourceUrl ? (
                            <a href={row.sourceUrl} target="_blank" rel="noreferrer noopener">
                              {row.sourceLabel}
                            </a>
                          ) : (
                            row.sourceLabel
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="chapter-row__actions">
                      <button
                        type="button"
                        className="btn btn--icon"
                        aria-label={`Rename ${row.title}`}
                        onClick={() => (isEditing ? setEditing(null) : startEdit(row))}
                      >
                        <IonIcon icon={pencilOutline} aria-hidden="true" style={{ fontSize: 15 }} />
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon"
                        aria-label={`Delete ${row.title}`}
                        onClick={() => onRemoveChapter(row.chapter.id, row.title)}
                      >
                        <IonIcon icon={trashOutline} aria-hidden="true" style={{ fontSize: 15 }} />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="chapter-edit">
                      <label className="field">
                        <span className="field__label">Number</span>
                        <input
                          className="input input--inline"
                          type="number"
                          min={1}
                          value={draftNumber}
                          onChange={(event) => setDraftNumber(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Title</span>
                        <input
                          className="input input--inline"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          autoFocus
                        />
                      </label>
                      <div className="chapter-edit__actions">
                        <label className="field" style={{ flex: '1 1 12rem' }}>
                          <span className="field__label">
                            Bengali title <span className="field__optional">optional</span>
                          </span>
                          <input
                            className="input input--inline bn"
                            lang="bn"
                            value={draftBn}
                            onChange={(event) => setDraftBn(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() => void saveEdit(row)}
                        >
                          Save
                        </button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                        {row.isPlaceholder ? null : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setDraftTitle(`Chapter ${row.number ?? index + 1}`);
                              setDraftBn('');
                            }}
                          >
                            Reset title
                          </button>
                        )}
                      </div>
                      <div className="chapter-edit__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={index === 0}
                          onClick={() => onMoveChapter(row.chapter.id, -1)}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={index === chapters.length - 1}
                          onClick={() => onMoveChapter(row.chapter.id, 1)}
                        >
                          Move down
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </article>
  );
}

/** Empty state for a class with no subjects at all. */
export function NoSubjects({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty">
      <p className="empty__title">No subjects yet.</p>
      <button type="button" className="btn btn--primary empty__action" onClick={onAdd}>
        <IonIcon icon={addOutline} aria-hidden="true" /> Add subject
      </button>
    </div>
  );
}
