import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, ProgressBar, SectionCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { userChapterSchema, userTopicSchema, type ChapterFormValues, type UserTopicValues } from '@/domain/schemas';
import { TOPIC_STATUS_LABELS, estimateCompletion } from '@/domain/syllabus';
import { TOPIC_STATUSES, type TopicStatus, type UserTopic } from '@/types/domain';
import { errorMessage } from '@/utils/errors';

function statusTone(status: TopicStatus) {
  return status === 'complete'
    ? 'good'
    : status === 'needs_revision'
      ? 'warn'
      : status === 'in_progress'
        ? 'info'
        : 'neutral';
}

function SyllabusContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [classGrade, setClassGrade] = useState('');
  const [stream, setStream] = useState('');
  const [versionId, setVersionId] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [topicDialog, setTopicDialog] = useState<{ chapterId: string; editing: UserTopic | null } | null>(null);
  const [chapterDialog, setChapterDialog] = useState<string | null>(null);

  const versions = useMemo(() => data?.bundle.curriculum.versions ?? [], [data]);
  const classGrades = useMemo(() => [...new Set(versions.map((version) => version.class_grade))].sort(), [versions]);
  const streams = useMemo(
    () => [...new Set(versions.map((version) => version.stream).filter((value): value is string => Boolean(value)))].sort(),
    [versions],
  );
  const versionOptions = useMemo(
    () =>
      versions.filter(
        (version) =>
          (!classGrade || version.class_grade === classGrade) && (!stream || version.stream === stream),
      ),
    [versions, classGrade, stream],
  );
  const version = versionOptions.find((candidate) => candidate.id === versionId) ?? null;
  const curriculumTopics = data?.bundle.curriculum.topics ?? [];

  if (!data) return null;
  const { view, bundle } = data;
  const { phase2 } = view;
  const subjects = view.subjects.filter(
    (subject) =>
      (!subjectId || subject.subject.id === subjectId) &&
      (!version || subject.subject.curriculum_version_id === version.id),
  );

  // Minutes actually logged per chapter, used as the pace sample for the estimate.
  const minutesByChapter = new Map<string, number>();
  for (const session of bundle.sessions) {
    if (!session.user_chapter_id) continue;
    minutesByChapter.set(
      session.user_chapter_id,
      (minutesByChapter.get(session.user_chapter_id) ?? 0) + session.duration_minutes,
    );
  }
  const visible = subjects.flatMap((subject) => subject.chapters);
  const remainingChapters = visible.filter((chapter) => chapter.chapter.status !== 'complete');
  const completedMinutes = visible
    .filter((chapter) => chapter.chapter.status === 'complete')
    .map((chapter) => minutesByChapter.get(chapter.chapter.id) ?? 0);
  const weeklyCapacity = Object.values(bundle.profile.study_windows ?? {}).reduce(
    (sum, minutes) => sum + Number(minutes || 0),
    0,
  );
  const estimate = estimateCompletion({
    chaptersRemaining: remainingChapters.length,
    completedChapterMinutes: completedMinutes,
    weeklyCapacityMinutes: weeklyCapacity,
    // Explicit planning figure, named as an assumption in the output — never a claim.
    defaultChapterMinutes: 120,
  });

  const topicsFor = (chapterId: string) => phase2.topicsByChapter.get(chapterId) ?? [];
  const visibleChapters = (subjectChapters: typeof subjects[number]['chapters']) =>
    subjectChapters.filter((chapter) => !onlyIncomplete || chapter.chapter.status !== 'complete');

  const saveTopic = async (values: UserTopicValues) => {
    if (!topicDialog) return;
    const payload = {
      user_chapter_id: topicDialog.chapterId,
      curriculum_topic_id: values.curriculum_topic_id || null,
      custom_title: values.curriculum_topic_id ? null : values.custom_title ?? null,
      status: values.status,
      notes: values.notes ? values.notes : null,
    };
    if (topicDialog.editing) {
      await mutate((repo) => repo.update('user_topics', topicDialog.editing!.id, payload));
      await notify('Topic updated.');
    } else {
      await mutate((repo) => repo.create('user_topics', { ...payload, is_demo: false }));
      await notify('Topic added.');
    }
    setTopicDialog(null);
  };

  const setStatus = async (topic: UserTopic, status: TopicStatus) => {
    try {
      await mutate((repo) => repo.update('user_topics', topic.id, { status }));
      await notify(`${topic.custom_title ?? 'Topic'} → ${TOPIC_STATUS_LABELS[status]}`);
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const removeTopic = async (topic: UserTopic) => {
    try {
      await mutate((repo) => repo.remove('user_topics', topic.id));
      await notify('Topic removed.', 'medium');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const saveChapter = async (subject: string, values: ChapterFormValues) => {
    const existing = view.subjects
      .find((entry) => entry.subject.id === subject)
      ?.chapters.some((chapter) => chapter.title.toLowerCase() === values.title.trim().toLowerCase());
    if (existing) {
      await notify('That chapter already exists in this subject.', 'warning');
      return;
    }
    await mutate((repo) =>
      repo.create('user_chapters', {
        user_subject_id: subject,
        curriculum_chapter_id: null,
        curriculum_version_id: null,
        custom_title: values.title,
        status: values.status,
        lecture_target_count: values.lecture_target_count,
        import_batch_id: null,
        is_demo: false,
      }),
    );
    await notify('Custom chapter added.');
    setChapterDialog(null);
  };

  return (
    <>
      <PageHeader
        title="Syllabus tracker"
        description="Track reading, lectures, notes, formula sheets, practice, board and admission questions, MCQs, written work, revision and self-tests — one line per chapter. Percentages always show their denominator."
      />

      <SectionCard title="Filters" hint="Filters change the reference curriculum you browse, never your records.">
        <div className="grid grid--two">
          <label className="field">
            <span className="field__label">Class</span>
            <select className="input" value={classGrade} onChange={(event) => setClassGrade(event.target.value)}>
              <option value="">All classes</option>
              {classGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Group / stream</span>
            <select className="input" value={stream} onChange={(event) => setStream(event.target.value)}>
              <option value="">All groups</option>
              {streams.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Syllabus version</span>
            <select className="input" value={versionId} onChange={(event) => setVersionId(event.target.value)}>
              <option value="">Any version</option>
              {versionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title} · {option.academic_year}
                </option>
              ))}
            </select>
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
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={onlyIncomplete}
              onChange={(event) => setOnlyIncomplete(event.target.checked)}
            />
            <span>Only chapters that are not complete</span>
          </label>
        </div>
        {version ? (
          <Notice tone={version.verification_status === 'verified' ? 'info' : 'warn'} title="Syllabus source">
            {version.authority} · {version.education_level} · {version.academic_year} · version{' '}
            {version.version_label} · verification: <strong>{version.verification_status}</strong>
            {version.source_url ? (
              <>
                {' '}
                · <a href={version.source_url} target="_blank" rel="noreferrer">source</a>
              </>
            ) : (
              ' · no source URL recorded'
            )}
            . Chapter titles inherited from this version keep their own verification status; demo content is
            never presented as official.
          </Notice>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Finish estimate"
        hint="A planning estimate from your records, not a prediction"
      >
        <p className="small">{estimate.message}</p>
        {estimate.assumptions.length > 0 ? (
          <ul className="small muted" style={{ margin: '6px 0 0 18px' }}>
            {estimate.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        ) : null}
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Status: {estimate.status.replace(/_/g, ' ')} · remaining chapters{' '}
          {remainingChapters.length} · weekly availability {weeklyCapacity} minutes. Estimates never replace your own
          records and are never used for marks.
        </p>
      </SectionCard>

      {subjects.length === 0 ? (
        <EmptyState
          title="No subjects match these filters"
          message="Adopt a subject from the curriculum, or clear the filters. A subject with no chapters is not a failure."
        />
      ) : (
        subjects.map((subject) => {
          const coverage = phase2.subjectCoverageById.get(subject.subject.id);
          const chapters = visibleChapters(subject.chapters);
          return (
            <SectionCard
              key={subject.subject.id}
              title={subject.label}
              hint={`${coverage?.chaptersComplete ?? 0}/${coverage?.chapters ?? 0} chapters complete · ${coverage?.topicsComplete ?? 0}/${coverage?.topics ?? 0} topics complete`}
              action={
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setChapterDialog(subject.subject.id)}>
                  Add custom chapter
                </button>
              }
            >
              <div className="grid grid--2">
                <ProgressBar
                  percent={coverage?.chapterPercent ?? null}
                  done={coverage?.chaptersComplete}
                  total={coverage?.chapters}
                  label="Chapters complete"
                />
                <ProgressBar
                  percent={coverage?.topicPercent ?? null}
                  done={coverage?.topicsComplete}
                  total={coverage?.topics}
                  label="Topics complete"
                />
              </div>
              {chapters.length === 0 ? (
                <p className="small muted">No chapters to show here. Add a chapter or clear the filter.</p>
              ) : (
                <div className="stack">
                  {chapters.map((chapter) => {
                    const chapterCoverage = phase2.coverageByChapter.get(chapter.chapter.id);
                    const topics = topicsFor(chapter.chapter.id);
                    return (
                      <div key={chapter.chapter.id} className="card card--nested">
                        <div className="row row--between">
                          <div>
                            <Link to={`/chapters/${chapter.chapter.id}`} className="card__title">
                              {chapter.title}
                            </Link>
                            <p className="tiny muted">
                              {chapter.chapter.custom_title ? 'Custom chapter' : 'Curriculum chapter'}
                              {chapter.number ? ` · Chapter ${chapter.number}` : ''} · status{' '}
                              {chapter.chapter.status.replace(/_/g, ' ')}
                            </p>
                          </div>
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => setTopicDialog({ chapterId: chapter.chapter.id, editing: null })}
                            >
                              Add topic
                            </button>
                          </div>
                        </div>

                        <ProgressBar
                          percent={chapterCoverage?.topic.percent ?? null}
                          done={chapterCoverage?.topic.complete}
                          total={chapterCoverage?.topic.total}
                          label="Topics complete"
                        />

                        <div className="chip-row" aria-label="Activity tracking">
                          {(chapterCoverage?.activities ?? []).map((activity) => (
                            <span
                              key={activity.key}
                              className={`chip ${activity.done > 0 ? 'chip--on' : ''}`}
                              title={activity.total === null ? 'No denominator recorded' : `${activity.done}/${activity.total}`}
                            >
                              {activity.label}
                              <span className="mono-num">
                                {' '}
                                {activity.total === null ? activity.done : `${activity.done}/${activity.total}`}
                              </span>
                            </span>
                          ))}
                        </div>

                        {topics.length === 0 ? (
                          <p className="small muted">
                            No topics recorded for this chapter. Topics are optional; chapters still track progress.
                          </p>
                        ) : (
                          <ul className="list">
                            {topics.map((topic) => (
                              <li key={topic.id} className="list-row">
                                <div className="list-row__main">
                                  <strong>
                                    {topic.custom_title ??
                                      curriculumTopics.find((entry) => entry.id === topic.curriculum_topic_id)?.title ??
                                      'Topic'}
                                  </strong>
                                  {topic.status === 'needs_revision' ? (
                                    <span className="tiny muted"> · marked for revision</span>
                                  ) : null}
                                </div>
                                <div className="list-row__actions">
                                  <Badge tone={statusTone(topic.status)}>{TOPIC_STATUS_LABELS[topic.status]}</Badge>
                                  <select
                                    className="input input--inline"
                                    aria-label={`Status for ${topic.custom_title ?? 'topic'}`}
                                    value={topic.status}
                                    onChange={(event) => void setStatus(topic, event.target.value as TopicStatus)}
                                  >
                                    {TOPIC_STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {TOPIC_STATUS_LABELS[status]}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    onClick={() => setTopicDialog({ chapterId: chapter.chapter.id, editing: topic })}
                                  >
                                    Edit
                                  </button>
                                  <ConfirmDeleteButton
                                    label="Remove"
                                    header="Remove this topic?"
                                    message="Only the topic record is removed. Sessions and notes stay attached to the chapter."
                                    onConfirm={() => removeTopic(topic)}
                                  />
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          );
        })
      )}

      <Notice tone="neutral">
        A chapter or topic marked complete is your own record, not a claim of mastery. The app does not infer mastery
        from a single checkbox.
      </Notice>

      {topicDialog ? (
        <RecordDialog<UserTopicValues>
          title={topicDialog.editing ? 'Edit topic' : 'Add a topic'}
          description="Choose a curriculum topic or type your own. Duplicate titles are allowed — they are your records."
          fields={[
            {
              name: 'curriculum_topic_id',
              label: 'Curriculum topic',
              type: 'select',
              optional: true,
              options: [
                { value: '', label: 'No curriculum topic (custom title)' },
                ...curriculumTopics
                  .filter((entry) => entry.curriculum_chapter_id === view.chapterById.get(topicDialog.chapterId)?.chapter.curriculum_chapter_id)
                  .map((entry) => ({ value: entry.id, label: entry.title })),
              ],
            },
            { name: 'custom_title', label: 'Custom title', type: 'text', optional: true, placeholder: 'e.g. Projectile from the coaching sheet' },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: TOPIC_STATUSES.map((status) => ({ value: status, label: TOPIC_STATUS_LABELS[status] })),
            },
            { name: 'notes', label: 'Notes', type: 'textarea', optional: true, rows: 3 },
          ]}
          schema={userTopicSchema}
          defaultValues={{
            user_chapter_id: topicDialog.chapterId,
            curriculum_topic_id: topicDialog.editing?.curriculum_topic_id ?? '',
            custom_title: topicDialog.editing?.custom_title ?? '',
            status: topicDialog.editing?.status ?? 'not_recorded',
            notes: topicDialog.editing?.notes ?? '',
          }}
          submitLabel={topicDialog.editing ? 'Save topic' : 'Add topic'}
          onSubmit={saveTopic}
          onClose={() => setTopicDialog(null)}
        />
      ) : null}

      {chapterDialog ? (
        <RecordDialog<ChapterFormValues>
          title="Add a custom chapter"
          description="For coaching, school or personal chapters that are not in the recorded curriculum."
          fields={[
            { name: 'title', label: 'Chapter title', type: 'text' },
            { name: 'chapter_number', label: 'Chapter number', type: 'text', optional: true },
            {
              name: 'lecture_target_count',
              label: 'Planned lectures',
              type: 'number',
              optional: true,
              help: 'Optional. Leave blank if you do not know yet.',
            },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: [
                { value: 'not_recorded', label: 'Not recorded' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'needs_practice', label: 'Needs practice' },
                { value: 'needs_revision', label: 'Needs revision' },
                { value: 'complete', label: 'Complete' },
                { value: 'blocked', label: 'Blocked' },
              ],
            },
          ]}
          schema={userChapterSchema}
          defaultValues={{ user_subject_id: chapterDialog, title: '', chapter_number: '', lecture_target_count: '', status: 'not_recorded' }}
          submitLabel="Add chapter"
          onSubmit={(values) => saveChapter(chapterDialog, values)}
          onClose={() => setChapterDialog(null)}
        />
      ) : null}
    </>
  );
}

export function SyllabusPage() {
  return <WorkspaceGate>{() => <SyllabusContent />}</WorkspaceGate>;
}
