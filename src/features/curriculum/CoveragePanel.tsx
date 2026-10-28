/**
 * Curriculum coverage report.
 *
 * Deliberately not a percentage. A single "62% complete" number hides the only
 * question that matters here — whether a given subject's chapter list exists at
 * all — and invites reading a half-built curriculum as a finished one. Instead
 * this panel shows, per level / group / academic year: how many subjects are on
 * file, how many of them have any chapters, and which official document is
 * blocking the rest.
 */
import { IonIcon } from '@ionic/react';
import { alertCircleOutline, cloudOfflineOutline, documentTextOutline } from 'ionicons/icons';
import { Badge, EmptyState, Notice, SectionCard } from '@/components/ui/Page';
import {
  CHAPTER_STATE_TONE,
  INVENTORY_LABEL,
  blockedRequirements,
  curriculumTotals,
  groupCoverage,
  subjectCoverage,
} from '@/domain/curriculumCoverage';
import type { CurriculumAccessState, CurriculumPendingRequirement, CurriculumSource } from '@/types/domain';
import type { UserDataBundle } from '@/services/repository';

const ACCESS_LABEL: Record<CurriculumAccessState, { text: string; tone: 'good' | 'info' | 'warn' | 'danger' | 'neutral' }> = {
  rendered: { text: 'Read in full', tone: 'good' },
  partial: { text: 'Partly readable', tone: 'info' },
  blocked: { text: 'Content blocked', tone: 'danger' },
  unreachable: { text: 'Host unreachable', tone: 'danger' },
  not_attempted: { text: 'Not opened yet', tone: 'neutral' },
};

const REQUIREMENT_LABEL: Record<
  CurriculumPendingRequirement['status'],
  { text: string; tone: 'good' | 'info' | 'warn' | 'danger' | 'neutral' }
> = {
  awaiting_publication: { text: 'Not published by NCTB yet', tone: 'neutral' },
  awaiting_source: { text: 'Awaiting source document', tone: 'warn' },
  source_blocked: { text: 'Published but unreadable here', tone: 'danger' },
  source_identified: { text: 'Source identified', tone: 'info' },
};

function SourceLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a className="tiny" href={url} target="_blank" rel="noreferrer noopener">
      Open source
    </a>
  );
}

export function CoveragePanel({
  curriculum,
  adoptedSubjectIds,
  onStudySubject,
  busyKey,
}: {
  curriculum: UserDataBundle['curriculum'];
  /** Subjects already in the student's workspace, so the action is not a no-op. */
  adoptedSubjectIds?: ReadonlySet<string>;
  /** Adopt the subject with its chapters and continue in the topic screens. */
  onStudySubject?: (versionId: string, subjectId: string, subjectName: string) => void;
  busyKey?: string | null;
}) {
  /*
   * Demo rows are excluded on purpose. The demo curriculum ships 18 placeholder
   * chapters, and counting them would put "18 chapters" next to "82 subjects"
   * and make the official syllabus look a fifth of the way imported when none
   * of it is. The demo version is shown separately, with its own Demo badge.
   */
  const officialVersionIds = new Set(
    curriculum.versions.filter((version) => !version.is_demo).map((version) => version.id),
  );
  const officialVersions = curriculum.versions.filter((version) => officialVersionIds.has(version.id));
  const officialSubjects = curriculum.subjects.filter((subject) =>
    officialVersionIds.has(subject.curriculum_version_id),
  );
  const officialSubjectIds = new Set(officialSubjects.map((subject) => subject.id));
  const officialChapters = curriculum.chapters.filter((chapter) =>
    officialSubjectIds.has(chapter.curriculum_subject_id),
  );

  const rows = subjectCoverage(officialVersions, officialSubjects, officialChapters, curriculum.topics);
  const groups = groupCoverage(officialVersions, rows, curriculum.requirements);
  const totals = curriculumTotals(groups);
  const blocked = blockedRequirements(curriculum.requirements);
  const unpublished = curriculum.requirements.filter(
    (requirement) => requirement.status === 'awaiting_publication',
  );

  return (
    <SectionCard
      title="Curriculum coverage"
      hint="What is actually on file, per level, group and academic year — and what is still missing"
      action={
        <Badge tone={totals.complete ? 'good' : 'warn'}>
          {totals.complete ? 'Complete and verified' : 'Incomplete — not verified'}
        </Badge>
      }
    >
      <div className="stack">
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Official NCTB versions only, HSC first. The demo curriculum is listed separately with its own Demo
          badge and is not counted here. Being listed first is only about reading order — it is not a claim
          that HSC is complete.
        </p>
        <div className="row">
          <Badge tone="neutral">{totals.versions} version(s)</Badge>
          <Badge tone="neutral">{totals.subjects} subject(s)</Badge>
          <Badge tone={totals.chapters === 0 ? 'danger' : 'neutral'}>{totals.chapters} chapter(s)</Badge>
          <Badge tone="neutral">{totals.topics} topic(s)</Badge>
          {totals.chapters > 0 ? (
            <Badge tone="good">{totals.verified_chapters} verified chapter(s)</Badge>
          ) : null}
        </div>

        {totals.chapters === 0 ? (
          <Notice tone="warn" title="No chapter or topic data has been imported.">
            Subject names are on file; chapter titles are not. Every chapter row has to come from the
            table-of-contents page of the official NCTB textbook, and those files could not be read from this
            environment. Nothing has been guessed to fill the gap.
          </Notice>
        ) : null}

        <div className="table-scroll">
          <table className="data-table">
            <caption className="tiny muted" style={{ captionSide: 'top', textAlign: 'left', paddingBottom: 6 }}>
              Coverage per level, group and academic year. Verified / partly / no chapters split the
              subject count three ways; they always add up to the subject total.
            </caption>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Group</th>
                <th scope="col">Year</th>
                <th scope="col">Subjects</th>
                <th scope="col">Verified</th>
                <th scope="col">Partly</th>
                <th scope="col">No chapters</th>
                <th scope="col">Chapters</th>
                <th scope="col">Topics</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.version_id}>
                  <td>{group.education_level}</td>
                  <td>{group.stream}</td>
                  <td>{group.academic_year}</td>
                  <td>{group.subjects}</td>
                  <td>{group.verified_subjects}</td>
                  <td>{group.partial_subjects}</td>
                  <td>{group.missing_subjects}</td>
                  <td>{group.chapters}</td>
                  <td>{group.topics}</td>
                  <td>
                    <Badge tone={group.inventory_state === 'complete' ? 'good' : group.inventory_state === 'missing' ? 'danger' : 'warn'}>
                      {INVENTORY_LABEL[group.inventory_state]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totals.chapters > 0 ? (
          <details>
            <summary role="button" aria-label="Show per-subject coverage">
              Per-subject detail ({rows.length})
            </summary>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col">Paper</th>
                    <th scope="col">Chapters</th>
                    <th scope="col">Topics</th>
                    <th scope="col">Chapter list</th>
                    <th scope="col">Study</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.curriculum_subject_id}>
                      <td>{row.name}</td>
                      <td>{row.paper_label ?? '—'}</td>
                      <td>{row.chapter_count}</td>
                      <td>{row.topic_count}</td>
                      <td>
                        <Badge tone={CHAPTER_STATE_TONE[row.chapter_state]}>
                          {row.chapter_state === 'none' ? 'None' : row.chapter_state.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td>
                        {row.chapter_count === 0 ? (
                          <span className="tiny muted">No chapter list yet</span>
                        ) : onStudySubject ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={busyKey === `study-${row.curriculum_subject_id}`}
                            onClick={() =>
                              onStudySubject(row.curriculum_version_id, row.curriculum_subject_id, row.name)
                            }
                          >
                            {adoptedSubjectIds?.has(row.curriculum_subject_id)
                              ? 'Open chapters'
                              : 'Add to my subjects'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        {blocked.length > 0 ? (
          <div>
            <h3 className="section-card__title" style={{ fontSize: '0.95rem' }}>
              <IonIcon icon={alertCircleOutline} aria-hidden="true" /> Blocked on source material ({blocked.length})
            </h3>
            <div className="list">
              {blocked.map((requirement) => (
                <div className="list-row" key={requirement.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {requirement.education_level} · {requirement.academic_year} — {requirement.requirement}
                    </div>
                    <div className="list-row__meta">
                      <Badge tone={REQUIREMENT_LABEL[requirement.status].tone}>
                        {REQUIREMENT_LABEL[requirement.status].text}
                      </Badge>
                      <span className="tiny muted">{requirement.note}</span>
                    </div>
                  </div>
                  <SourceLink url={requirement.source_url} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {unpublished.length > 0 ? (
          <div>
            <h3 className="section-card__title" style={{ fontSize: '0.95rem' }}>
              <IonIcon icon={cloudOfflineOutline} aria-hidden="true" /> Not published yet ({unpublished.length})
            </h3>
            <p className="tiny muted">
              {unpublished.map((requirement) => requirement.academic_year).join(', ')} — NCTB has not released
              these textbook lists, so no subjects are recorded for them. They will stay empty rather than
              guessed.
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="section-card__title" style={{ fontSize: '0.95rem' }}>
            <IonIcon icon={documentTextOutline} aria-hidden="true" /> Official sources checked (
            {curriculum.sources.length})
          </h3>
          {curriculum.sources.length === 0 ? (
            <EmptyState
              icon={<IonIcon icon={documentTextOutline} aria-hidden="true" />}
              title="No sources recorded"
              message="Nothing has been checked against an official document yet."
            />
          ) : (
            <div className="list">
              {curriculum.sources.map((source: CurriculumSource) => (
                <div className="list-row" key={source.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">{source.title}</div>
                    <div className="list-row__meta">
                      <Badge tone={ACCESS_LABEL[source.access_state].tone}>
                        {ACCESS_LABEL[source.access_state].text}
                      </Badge>
                      <span>
                        {source.document_type.replace('_', ' ')}
                        {source.education_level ? ` · ${source.education_level}` : ''}
                        {source.academic_year ? ` · ${source.academic_year}` : ''}
                      </span>
                      {source.note ? <span className="tiny muted">{source.note}</span> : null}
                    </div>
                  </div>
                  <SourceLink url={source.url} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
