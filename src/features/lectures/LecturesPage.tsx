import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IonAlert, IonIcon } from '@ionic/react';
import { addOutline, filterOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { lectureSchema, type LectureValues } from '@/domain/schemas';
import { findSimilarLectures, LECTURE_SOURCE_LABELS } from '@/domain/lectures';
import { addDaysISO, weekRange } from '@/domain/dates';
import { emptyToNull } from '@/utils/errors';
import { errorMessage } from '@/utils/errors';
import type { LectureRecord } from '@/types/domain';

const SOURCE_OPTIONS = Object.entries(LECTURE_SOURCE_LABELS).map(([value, label]) => ({ value, label }));

function LecturesContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LectureRecord | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ values: LectureValues; titles: string[] } | null>(null);

  const allLectures = useMemo(() => data?.bundle.lectures ?? [], [data?.bundle.lectures]);
  const filtered = useMemo(() => {
    return allLectures
      .filter((lecture) => (subjectFilter === 'all' ? true : lecture.user_subject_id === subjectFilter))
      .filter((lecture) => (onlyIncomplete ? !lecture.is_completed : true))
      .sort((a, b) => (a.lecture_date < b.lecture_date ? 1 : a.lecture_date > b.lecture_date ? -1 : 0));
  }, [allLectures, subjectFilter, onlyIncomplete]);

  if (!data) return null;
  const { view, bundle } = data;
  const week = weekRange(view.today);
  const lecturesThisWeek = bundle.lectures.filter((l) => l.lecture_date >= week.start && l.lecture_date <= week.end);

  const chapterOptionsFor = (subjectId: string) => {
    const subject = view.subjectById.get(subjectId);
    return (subject?.chapters ?? []).map((c) => ({ value: c.chapter.id, label: c.title }));
  };

  const saveLecture = async (values: LectureValues, force = false) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;

    if (!force && !editing) {
      const similar = findSimilarLectures(
        {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          title: values.title,
          lecture_number: values.lecture_number,
          lecture_date: values.lecture_date,
        },
        bundle.lectures,
      );
      if (similar.length > 0) {
        setDuplicatePrompt({ values, titles: similar.map((s) => `${s.lecture_date} · ${s.title}`) });
        return;
      }
    }

    if (editing) {
      await mutate((repo) =>
        repo.update('lecture_records', editing.id, {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          title: values.title,
          lecture_number: values.lecture_number,
          source: values.source,
          platform: emptyToNull(values.platform),
          instructor: emptyToNull(values.instructor),
          lecture_date: values.lecture_date,
          duration_minutes: values.duration_minutes,
          is_completed: values.is_completed,
          notes: emptyToNull(values.notes),
          follow_up: emptyToNull(values.follow_up),
        }),
      );
      await notify('Lecture updated.');
    } else {
      await mutate((repo) =>
        repo.create('lecture_records', {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          title: values.title,
          lecture_number: values.lecture_number,
          source: values.source,
          platform: emptyToNull(values.platform),
          instructor: emptyToNull(values.instructor),
          lecture_date: values.lecture_date,
          duration_minutes: values.duration_minutes,
          is_completed: values.is_completed,
          notes: emptyToNull(values.notes),
          follow_up: emptyToNull(values.follow_up),
          is_demo: false,
        }),
      );
      await notify('Lecture recorded.');
    }
    setDialogOpen(false);
    setEditing(null);
    setDuplicatePrompt(null);
  };

  const toggleCompleted = async (lecture: LectureRecord) => {
    try {
      await mutate((repo) =>
        repo.update('lecture_records', lecture.id, { is_completed: !lecture.is_completed }),
      );
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const deleteLecture = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('lecture_records', id));
      await notify('Lecture deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  const lectureCounts = view.subjects.map((subject) => {
    const lectures = bundle.lectures.filter((l) => l.user_subject_id === subject.subject.id);
    const completed = lectures.filter((l) => l.is_completed).length;
    const targets = subject.chapters.filter((c) => c.progress.lectures.target !== null);
    const targetTotal = targets.reduce((sum, c) => sum + (c.progress.lectures.target ?? 0), 0);
    const completedAgainstTarget = targets.reduce((sum, c) => sum + c.progress.lectures.completed, 0);
    return { subject, lectures, completed, targetTotal, completedAgainstTarget };
  });

  return (
    <>
      <PageHeader
        title="Lecture Log"
        description="Live, recorded, offline and coaching lectures. A lecture series target is only shown when you enter one."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> Record lecture
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Lectures recorded (all time)" value={bundle.lectures.length} hint="Not an estimate of lectures taught" />
        <StatCard label="This week" value={lecturesThisWeek.length} hint={`Week ${week.start} → ${week.end}`} />
        <StatCard label="Marked completed" value={bundle.lectures.filter((l) => l.is_completed).length} hint="Completion is your own record" />
        <StatCard
          label="Subjects with a lecture target"
          value={view.subjects.filter((s) => s.chapters.some((c) => c.progress.lectures.target !== null)).length}
          hint="Empty targets mean “not recorded”"
        />
      </div>

      <div style={{ height: 16 }} />

      <SectionCard title="Filters" hint="Narrow the log without losing any records">
        <div className="row">
          <label className="field" style={{ minWidth: 220, flex: 1 }}>
            <span className="field__label">Subject</span>
            <select className="select" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="all">All subjects</option>
              {view.subjects.map((subject) => (
                <option key={subject.subject.id} value={subject.subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox" style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={onlyIncomplete} onChange={(event) => setOnlyIncomplete(event.target.checked)} />
            <span>
              <IonIcon icon={filterOutline} aria-hidden="true" /> Only unfinished
            </span>
          </label>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Lecture history" hint={`${filtered.length} record(s) shown`}>
        {bundle.lectures.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={addOutline} aria-hidden="true" />}
            title="No lectures recorded"
            message="Record the first lecture you attended or watched. You do not need to know how many lectures exist."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
                Record a lecture
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <p className="small muted">No lecture matches these filters.</p>
        ) : (
          <div className="list">
            {filtered.map((lecture) => {
              const subject = view.subjectById.get(lecture.user_subject_id);
              const chapter = lecture.user_chapter_id ? view.chapterById.get(lecture.user_chapter_id) : null;
              return (
                <div className="list-row" key={lecture.id}>
                  <label className="checkbox" style={{ padding: 0, marginTop: 2 }}>
                    <input
                      type="checkbox"
                      checked={lecture.is_completed}
                      onChange={() => void toggleCompleted(lecture)}
                      aria-label={`Mark ${lecture.title} completed`}
                    />
                  </label>
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {lecture.lecture_number !== null ? `#${lecture.lecture_number} · ` : ''}
                      {lecture.title}
                    </div>
                    <div className="list-row__meta">
                      <span>{lecture.lecture_date}</span>
                      <span>{subject?.label ?? 'Subject removed'}</span>
                      {chapter ? (
                        <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link>
                      ) : (
                        <span className="muted">no chapter</span>
                      )}
                      <span>{LECTURE_SOURCE_LABELS[lecture.source]}</span>
                      {lecture.duration_minutes ? <span>{lecture.duration_minutes} min</span> : null}
                      {lecture.platform ? <span>{lecture.platform}</span> : null}
                    </div>
                    {lecture.notes ? <p className="tiny muted">{lecture.notes}</p> : null}
                    {lecture.follow_up ? <p className="tiny">Follow-up: {lecture.follow_up}</p> : null}
                  </div>
                  <div className="list-row__actions">
                    {lecture.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setEditing(lecture);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => deleteLecture(lecture.id)} label="Delete" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Progress by subject" hint="Completed counts and targets are shown only where you recorded them">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Recorded</th>
                <th>Completed</th>
                <th>Chapter targets</th>
              </tr>
            </thead>
            <tbody>
              {lectureCounts.map(({ subject, lectures, completed, targetTotal, completedAgainstTarget }) => (
                <tr key={subject.subject.id}>
                  <td>{subject.label}</td>
                  <td>{lectures.length}</td>
                  <td>{completed}</td>
                  <td>
                    {targetTotal > 0
                      ? `${completedAgainstTarget} of ${targetTotal}`
                      : 'No targets recorded'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          If no target exists, no percentage is shown. The app never assumes a lecture count.
        </p>
      </SectionCard>

      {dialogOpen ? (
        <RecordDialog<LectureValues>
          title={editing ? 'Edit lecture' : 'Record a lecture'}
          description="Record what actually happened. Later edits keep an audit event in your account."
          schema={lectureSchema}
          defaultValues={{
            user_subject_id: editing?.user_subject_id ?? view.subjects[0]?.subject.id ?? '',
            user_chapter_id: editing?.user_chapter_id ?? '',
            title: editing?.title ?? '',
            lecture_number: editing?.lecture_number ?? '',
            source: editing?.source ?? 'live',
            platform: editing?.platform ?? '',
            instructor: editing?.instructor ?? '',
            lecture_date: editing?.lecture_date ?? addDaysISO(view.today, 0),
            duration_minutes: editing?.duration_minutes ?? '',
            is_completed: editing?.is_completed ?? true,
            notes: editing?.notes ?? '',
            follow_up: editing?.follow_up ?? '',
          }}
          submitLabel={editing ? 'Save changes' : 'Record lecture'}
          fields={[
            {
              name: 'user_subject_id',
              label: 'Subject',
              type: 'select',
              options: view.subjects.map((s) => ({ value: s.subject.id, label: s.label })),
            },
            {
              name: 'user_chapter_id',
              label: 'Chapter',
              type: 'select',
              optional: true,
              placeholder: 'No chapter / chapter not in my list',
              options: (values) => chapterOptionsFor(String(values['user_subject_id'] ?? '')),
            },
            { name: 'title', label: 'Lecture title', type: 'text', placeholder: 'e.g. Lecture 4 — projectile motion' },
            {
              name: 'lecture_number',
              label: 'Lecture number',
              type: 'number',
              optional: true,
              inputMode: 'numeric',
              help: 'Your numbering, not an official count.',
            },
            { name: 'source', label: 'Source', type: 'select', options: SOURCE_OPTIONS },
            { name: 'platform', label: 'Platform', type: 'text', optional: true, placeholder: 'YouTube, coaching name…' },
            { name: 'instructor', label: 'Instructor', type: 'text', optional: true },
            { name: 'lecture_date', label: 'Date', type: 'date' },
            {
              name: 'duration_minutes',
              label: 'Duration (minutes)',
              type: 'number',
              optional: true,
              inputMode: 'numeric',
              help: 'Time alone is not proof of learning; it is context.',
            },
            { name: 'is_completed', label: 'I completed this lecture', type: 'checkbox' },
            { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, optional: true },
            { name: 'follow_up', label: 'Follow-up task', type: 'text', optional: true },
          ]}
          onSubmit={(values) => saveLecture(values)}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      <IonAlert
        isOpen={duplicatePrompt !== null}
        onDidDismiss={() => setDuplicatePrompt(null)}
        header="Possible duplicate"
        message={
          duplicatePrompt
            ? `A lecture on the same date with the same title or number already exists:\n\n${duplicatePrompt.titles.join(
                '\n',
              )}\n\nSave this anyway only if it is genuinely a different lecture.`
            : ''
        }
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Save anyway',
            handler: () => {
              const prompt = duplicatePrompt;
              setDuplicatePrompt(null);
              if (prompt) void saveLecture(prompt.values, true);
            },
          },
        ]}
      />

      {view.subjects.length === 0 ? (
        <Notice tone="warn">
          Add a subject first — <Link to="/curriculum">My Curriculum</Link>.
        </Notice>
      ) : null}
    </>
  );
}

export function LecturesPage() {
  return <WorkspaceGate>{() => <LecturesContent />}</WorkspaceGate>;
}
