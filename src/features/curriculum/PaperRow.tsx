import { useMemo } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline, documentTextOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { Badge } from '@/components/ui/Page';
import { VERIFICATION_LABEL, paperLabelBn, subjectDisplayName } from '@/domain/curriculum';
import type { SubjectProgress } from '@/domain/progress';
import type { ChapterView } from '@/features/shared/selectors';
import type { CurriculumChapter, CurriculumSubject, CurriculumVersion } from '@/types/domain';

/**
 * One paper, as a card.
 *
 * HSC Science is examined two books at a time — Physics ১ম পত্র and ২য় পত্র are
 * separate papers with separate chapters, separate progress and separate exam
 * results. Flattening them into a single "Physics" row (which the old list did)
 * makes the two halves impossible to tell apart once both are adopted, so every
 * card here is one paper and the paper label is part of the title, not a suffix
 * in grey text.
 *
 * The card is deliberately unwilling to look complete:
 *   * the chapter count says how many are verified versus how many are partial;
 *   * a paper with no chapter list says so in the card body, not only in a note;
 *   * the progress bar only appears when there is a real denominator the
 *     student owns, and it is computed from saved chapter records.
 */

export interface PaperRowProps {
  subject: CurriculumSubject;
  version: CurriculumVersion;
  /** Official chapter rows for this paper, in printed order. */
  chapters: CurriculumChapter[];
  adopted: boolean;
  /** Adopted chapters not yet in the student's workspace. */
  missingChapters: number;
  busy: string | null;
  onAdopt: () => void;
  onAddChapters: () => void;
  /** Saved progress for this paper, when it is in the workspace. */
  progress: SubjectProgress | null;
  /** Per-chapter views, when the paper is in the workspace. */
  chapterViews: ChapterView[];
  /** Curriculum chapter ids already carried into the workspace. */
  adoptedChapterIds: Set<string>;
}

const STATUS_TONE: Record<string, 'good' | 'warn' | 'neutral' | 'danger'> = {
  verified: 'good',
  partially_verified: 'warn',
  needs_verification: 'neutral',
  draft: 'neutral',
  retired: 'danger',
};

export function PaperRow({
  subject,
  version,
  chapters,
  adopted,
  missingChapters,
  busy,
  onAdopt,
  onAddChapters,
  progress,
  chapterViews,
  adoptedChapterIds,
}: PaperRowProps) {
  const verification = VERIFICATION_LABEL[subject.verification_status];
  const verifiedCount = chapters.filter((c) => c.verification_status === 'verified').length;
  const partialCount = chapters.filter((c) => c.verification_status === 'partially_verified').length;
  const needsCount = chapters.length - verifiedCount - partialCount;
  const bnTitledCount = chapters.filter((c) => Boolean(c.title_bn)).length;

  // Every chapter of a recovered contents page comes from the same document, so
  // state it once instead of under each row.
  const docs = new Set(chapters.map((c) => c.source_document).filter(Boolean) as string[]);
  const urls = new Set(chapters.map((c) => c.source_url).filter(Boolean) as string[]);
  const sharedDocument = docs.size === 1 ? [...docs][0] : null;
  const singleSourceUrl = urls.size === 1 ? [...urls][0] : null;

  const viewByChapterId = useMemo(() => {
    const map = new Map<string, ChapterView>();
    for (const view of chapterViews) {
      if (view.curriculumChapter) map.set(view.curriculumChapter.id, view);
    }
    return map;
  }, [chapterViews]);

  /** Chapters with every checklist item ticked — the only honest "done". */
  const chaptersComplete = chapterViews.filter((view) => view.progress.isFullyChecklisted).length;
  const hasWorkspaceChapters = chapterViews.length > 0;
  const percent = progress?.checklistPercent ?? null;

  return (
    <div className="list-row paper-row" data-paper={subject.id}>
      <div className="list-row__main">
        <div className="paper-row__head">
          <div className="paper-row__identity">
            <div className="list-row__title paper-row__title">
              {subjectDisplayName(subject)}
              {subject.paper_label ? (
                <span className="paper-row__paper">
                  {' · '}
                  {paperLabelBn(subject.paper_label) ?? subject.paper_label}
                  {paperLabelBn(subject.paper_label) ? (
                    <span className="paper-row__paper-en"> {subject.paper_label}</span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <div className="paper-row__sub">
              {subject.name_bn ? <span>{subject.name_bn}</span> : null}
              <span>
                {version.education_level} · {version.stream ?? 'all groups'} · {version.academic_year}
              </span>
              <span>{subject.is_compulsory ? 'compulsory' : 'optional'}</span>
            </div>
          </div>
          <div className="paper-row__badges">
            <Badge tone={STATUS_TONE[subject.verification_status]}>{verification.text}</Badge>
            {adopted ? <Badge tone="info">In workspace</Badge> : null}
          </div>
        </div>

        {/* Counts come from the rows on file. Nothing here is estimated. */}
        <div className="paper-row__stats">
          {chapters.length === 0 ? (
            <span className="paper-row__none">
              <IonIcon icon={documentTextOutline} aria-hidden="true" /> No chapter list yet
            </span>
          ) : (
            <>
              <span>
                <strong>{chapters.length}</strong> chapter row(s)
              </span>
              <span>
                <strong>{verifiedCount}</strong> verified
              </span>
              <span>
                <strong>{partialCount}</strong> partial
              </span>
              {needsCount > 0 ? (
                <span>
                  <strong>{needsCount}</strong> unverified
                </span>
              ) : null}
              {bnTitledCount < chapters.length ? (
                <span className="paper-row__warn">
                  {chapters.length - bnTitledCount} title(s) without Bengali text
                </span>
              ) : null}
            </>
          )}
          {adopted && hasWorkspaceChapters ? (
            <span className="paper-row__done">
              <strong>
                {chaptersComplete}/{chapterViews.length}
              </strong>{' '}
              chapters complete
            </span>
          ) : null}
        </div>

        {adopted && hasWorkspaceChapters ? (
          <div className="paper-row__progress">
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={percent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${subjectDisplayName(subject)} checklist completion`}
            >
              <div className="progress__bar" style={{ width: `${percent ?? 0}%` }} />
            </div>
            <span className="tiny muted">
              {percent === null ? 'No checklist recorded yet' : `${percent}% of checklist items ticked`}
            </span>
          </div>
        ) : null}

        {chapters.length > 0 ? (
          <details className="paper-row__details">
            <summary className="paper-row__summary">
              <IonIcon icon={chevronDownOutline} aria-hidden="true" />
              Show {chapters.length} chapter(s)
            </summary>
            {sharedDocument ? (
              <p className="chapter-list__doc chapter-list__doc--list">
                All {chapters.length} rows were transcribed from {sharedDocument}
                {singleSourceUrl ? (
                  <>
                    {' — '}
                    <a href={singleSourceUrl} target="_blank" rel="noreferrer noopener">
                      open source <IonIcon icon={openOutline} aria-hidden="true" />
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            <ol className="chapter-list">
              {chapters.map((chapter) => {
                const view = viewByChapterId.get(chapter.id);
                const badge = VERIFICATION_LABEL[chapter.verification_status];
                const inWorkspace = adoptedChapterIds.has(chapter.id);
                return (
                  <li className="chapter-list__row" key={chapter.id}>
                    <span className="chapter-list__num" aria-hidden="true">
                      {chapter.chapter_number ?? '·'}
                    </span>
                    <div className="chapter-list__body">
                      <div className="chapter-list__title">
                        {chapter.title_bn ?? chapter.title}
                        {chapter.title_bn ? (
                          <span className="chapter-list__en"> {chapter.title}</span>
                        ) : null}
                      </div>
                      <div className="chapter-list__meta">
                        {/* The card header already states the paper's status; repeating
                            the same badge on fifteen rows is noise. Show it only when
                            this chapter disagrees with its paper. */}
                        {chapter.verification_status !== subject.verification_status ? (
                          <Badge tone={STATUS_TONE[chapter.verification_status]}>{badge.text}</Badge>
                        ) : null}
                        {inWorkspace ? (
                          view ? (
                            <>
                              <span>
                                {view.progress.isFullyChecklisted
                                  ? 'checklist complete'
                                  : view.progress.checklist.percent !== null
                                    ? `${view.progress.checklist.percent}% checklist`
                                    : 'no checklist yet'}
                              </span>
                              {/* Saved records only. A chapter with nothing logged
                                  says nothing rather than showing zeroes. */}
                              {view.progress.lectures.completed > 0 ? (
                                <span>{view.progress.lectures.completed} lecture(s)</span>
                              ) : null}
                              {view.progress.practiceSessions > 0 ? (
                                <span>{view.progress.practiceSessions} practice</span>
                              ) : null}
                              {view.progress.revisions.count > 0 ? (
                                <span>{view.progress.revisions.count} revision(s)</span>
                              ) : null}
                              {view.progress.revisions.nextDate ? (
                                <span
                                  className={
                                    view.progress.revisions.dueState === 'overdue' ? 'paper-row__warn' : undefined
                                  }
                                >
                                  next revision {view.progress.revisions.nextDate}
                                </span>
                              ) : null}
                              {view.progress.openDifficulties > 0 ? (
                                <span className="paper-row__warn">
                                  {view.progress.openDifficulties} open difficulty
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span>in workspace</span>
                          )
                        ) : (
                          <span>not added</span>
                        )}
                        {chapter.source_url ? (
                          <a
                            href={chapter.source_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="chapter-list__source"
                            title={chapter.source_document ?? 'Chapter source'}
                          >
                            source <IonIcon icon={openOutline} aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="paper-row__warn">no source recorded</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {bnTitledCount < chapters.length ? (
              <p className="chapter-list__note">
                {chapters.length - bnTitledCount} of these {chapters.length} titles exist only in the printed English
                gloss: the Bengali half of the contents page was not readable in the scan, and inventing it would
                turn a partial record into a false one. They stay <em>partially verified</em>.
              </p>
            ) : null}
          </details>
        ) : (
          <p className="paper-row__empty">
            NCTB has not published a contents page this project could read for this paper, so there are no chapter
            rows to show. Adding the subject still works — you can add chapters yourself and they will be yours, not
            an official claim.
          </p>
        )}
      </div>

      <div className="list-row__actions">
        {!adopted ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={busy === subject.id}
            onClick={onAdopt}
          >
            {busy === subject.id
              ? 'Adding…'
              : chapters.length === 0
                ? 'Add subject'
                : `Add subject + ${chapters.length} chapter(s)`}
          </button>
        ) : missingChapters === 0 ? (
          <span className="tiny muted">
            {chapters.length === 0 ? 'Track chapters you add yourself' : 'All chapters added'}
          </span>
        ) : (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busy === `chapters-${subject.id}`}
            onClick={onAddChapters}
          >
            Add {missingChapters} chapter(s)
          </button>
        )}
      </div>
    </div>
  );
}

/** Small stamp used where a card needs to show where its data came from. */
export function SourceStamp({ url, label }: { url: string | null; label: string }) {
  if (!url) {
    return (
      <p className="tiny muted">
        <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" /> No source recorded for {label}.
      </p>
    );
  }
  return (
    <p className="tiny muted source-stamp">
      <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />
      <a href={url} target="_blank" rel="noreferrer noopener">
        {label} <IonIcon icon={openOutline} aria-hidden="true" />
      </a>
    </p>
  );
}
