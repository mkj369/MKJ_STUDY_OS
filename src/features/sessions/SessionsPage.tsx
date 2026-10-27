import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard, StatCard } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { studySessionSchema, type StudySessionValues } from '@/domain/schemas';
import { minutesToHuman, weekRange } from '@/domain/dates';
import { emptyToNull, errorMessage } from '@/utils/errors';
import type { StudySession } from '@/types/domain';
import { ACTIVITY_TYPES } from '@/types/domain';

const ACTIVITY_LABELS: Record<string, string> = {
  reading: 'Reading',
  notes: 'Notes',
  concept_review: 'Concept review',
  practice: 'Practice',
  board_questions: 'Board questions',
  admission_questions: 'Admission questions',
  mcq: 'MCQ practice',
  written: 'Written practice',
  test: 'Test',
  other: 'Other',
};

const ACTIVITY_OPTIONS = ACTIVITY_TYPES.map((value) => ({ value, label: ACTIVITY_LABELS[value] ?? value }));

function SessionsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);

  if (!data) return null;
  const { view, bundle } = data;
  const week = weekRange(view.today);
  const sessions = [...bundle.sessions].sort((a, b) => (a.session_date < b.session_date ? 1 : -1));
  const weekSessions = sessions.filter((s) => s.session_date >= week.start && s.session_date <= week.end);
  const totalAll = sessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalWeek = weekSessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const activeDays = new Set(weekSessions.map((s) => s.session_date)).size;

  const saveSession = async (values: StudySessionValues) => {
    const chapter = values.user_chapter_id ? view.chapterById.get(values.user_chapter_id) : null;
    const chapterId = chapter && chapter.chapter.user_subject_id === values.user_subject_id ? chapter.chapter.id : null;
    if (editing) {
      await mutate((repo) =>
        repo.update('study_sessions', editing.id, {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          activity_type: values.activity_type,
          session_date: values.session_date,
          duration_minutes: values.duration_minutes,
          focus_rating: values.focus_rating,
          result: emptyToNull(values.result),
          notes: emptyToNull(values.notes),
        }),
      );
      await notify('Study session updated.');
    } else {
      await mutate((repo) =>
        repo.create('study_sessions', {
          user_subject_id: values.user_subject_id,
          user_chapter_id: chapterId,
          activity_type: values.activity_type,
          session_date: values.session_date,
          started_at: null,
          ended_at: null,
          duration_minutes: values.duration_minutes,
          focus_rating: values.focus_rating,
          result: emptyToNull(values.result),
          notes: emptyToNull(values.notes),
          is_demo: false,
        }),
      );
      await notify('Study session logged.');
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const deleteSession = async (id: string) => {
    try {
      await mutate((repo) => repo.remove('study_sessions', id));
      await notify('Session deleted.', 'warning');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Study Sessions"
        description="What you did, for how long, and what came out of it. Time is context, never proof of learning."
        actions={
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <IonIcon icon={addOutline} aria-hidden="true" /> Log session
          </button>
        }
      />

      <div className="grid grid--stats">
        <StatCard label="Logged this week" value={minutesToHuman(totalWeek)} hint={`${weekSessions.length} session(s) · ${week.start} → ${week.end}`} />
        <StatCard label="Active days this week" value={activeDays} hint="Days with at least one recorded session" />
        <StatCard label="All recorded time" value={minutesToHuman(totalAll)} hint="Only what you logged" />
        <StatCard
          label="Practice sessions"
          value={sessions.filter((s) => ['practice', 'mcq', 'board_questions', 'written', 'test'].includes(s.activity_type)).length}
          hint="Practice evidence used by the progress engine"
        />
      </div>

      <div style={{ height: 16 }} />

      <Notice tone="neutral" title="Manual entry is the default.">
        Timers are optional convenience. If you studied without the app, add the session manually — the app
        never treats missing time as missing effort.
      </Notice>

      <div style={{ height: 16 }} />

      <SectionCard title="Session history" hint={`${sessions.length} record(s)`}>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={addOutline} aria-hidden="true" />}
            title="No study sessions yet"
            message="Log one session — even 15 minutes — with what you actually did."
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialogOpen(true)}>
                Log a session
              </button>
            }
          />
        ) : (
          <div className="list">
            {sessions.map((session) => {
              const subject = view.subjectById.get(session.user_subject_id);
              const chapter = session.user_chapter_id ? view.chapterById.get(session.user_chapter_id) : null;
              return (
                <div className="list-row" key={session.id}>
                  <div className="list-row__main">
                    <div className="list-row__title">
                      {ACTIVITY_LABELS[session.activity_type] ?? session.activity_type} ·{' '}
                      {minutesToHuman(session.duration_minutes)}
                    </div>
                    <div className="list-row__meta">
                      <span>{session.session_date}</span>
                      <span>{subject?.label ?? 'Subject removed'}</span>
                      {chapter ? <Link to={`/chapters/${chapter.chapter.id}`}>{chapter.title}</Link> : null}
                      {session.focus_rating ? <span>focus {session.focus_rating}/5</span> : null}
                      {session.result ? <span>result: {session.result}</span> : null}
                    </div>
                    {session.notes ? <p className="tiny muted">{session.notes}</p> : null}
                  </div>
                  <div className="list-row__actions">
                    {session.is_demo ? <Badge tone="accent">Demo</Badge> : null}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setEditing(session);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => deleteSession(session.id)} label="Delete" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {dialogOpen ? (
        <RecordDialog<StudySessionValues>
          title={editing ? 'Edit study session' : 'Log a study session'}
          schema={studySessionSchema}
          defaultValues={{
            user_subject_id: editing?.user_subject_id ?? view.subjects[0]?.subject.id ?? '',
            user_chapter_id: editing?.user_chapter_id ?? '',
            activity_type: editing?.activity_type ?? 'reading',
            session_date: editing?.session_date ?? view.today,
            duration_minutes: editing?.duration_minutes ?? 30,
            focus_rating: editing?.focus_rating ?? '',
            result: editing?.result ?? '',
            notes: editing?.notes ?? '',
          }}
          submitLabel={editing ? 'Save changes' : 'Log session'}
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
              placeholder: 'No chapter',
              options: (values) => {
                const subject = view.subjectById.get(String(values['user_subject_id'] ?? ''));
                return (subject?.chapters ?? []).map((c) => ({ value: c.chapter.id, label: c.title }));
              },
            },
            { name: 'activity_type', label: 'Activity', type: 'select', options: ACTIVITY_OPTIONS },
            { name: 'session_date', label: 'Date', type: 'date' },
            {
              name: 'duration_minutes',
              label: 'Duration (minutes)',
              type: 'number',
              inputMode: 'numeric',
              min: 1,
              max: 1440,
              help: 'Timer is optional; enter what actually happened.',
            },
            {
              name: 'focus_rating',
              label: 'Focus (1–5)',
              type: 'number',
              optional: true,
              inputMode: 'numeric',
              min: 1,
              max: 5,
            },
            { name: 'result', label: 'Result', type: 'text', optional: true, placeholder: 'e.g. 8/10 MCQs correct' },
            { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, optional: true },
          ]}
          onSubmit={saveSession}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

export function SessionsPage() {
  return <WorkspaceGate>{() => <SessionsContent />}</WorkspaceGate>;
}
