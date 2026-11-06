/**
 * First-launch academic setup wizard (also reachable later from Settings).
 *
 * Sections: Class 1–5, Class 6–8, SSC, HSC, HSC Admission.
 * School tracks pick a specific class; board tracks pick group/session/board;
 * Admission additionally records an optional target and reuses HSC rows.
 *
 * Steps: Section → Class/Group & session → Subjects → Confirm.
 * Saves to the profile and adopts the chosen curriculum subjects (including
 * their chapters when the curriculum has them). Existing subjects and
 * progress are NEVER removed — changing track keeps every record.
 *
 * Honesty: the HSC Science reference syllabus is imported with its source and
 * stays needs_verification; other levels are structure-only. The wizard says
 * so instead of pretending every syllabus is complete.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { arrowBackOutline, arrowForwardOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { useRepository } from '@/app/AppProviders';
import { useMutate, useWorkspaceBundle, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { PageSkeleton } from '@/components/ui/BrandLoader';
import { Notice, PageHeader } from '@/components/ui/Page';
import { TextField, FormError } from '@/components/ui/Form';
import {
  ACADEMIC_TRACKS,
  CLASS_LEVELS,
  TRACK_DESCRIPTIONS,
  TRACK_LABELS,
  groupsForTrack,
  resolveVersion,
  sessionsForTrack,
  trackFromLegacyLevel,
  trackUsesClassLevel,
  type AcademicTrack,
} from '@/domain/tracks';
import { errorMessage } from '@/utils/errors';
import type { CurriculumSubject } from '@/types/domain';

const BOARDS = [
  'Dhaka',
  'Rajshahi',
  'Cumilla',
  'Jashore',
  'Chattogram',
  'Barishal',
  'Sylhet',
  'Dinajpur',
  'Mymensingh',
  'Madrasah',
  'Technical',
  'Other',
] as const;

const STEPS = ['Section', 'Class & session', 'Subjects', 'Confirm'] as const;

export function SetupPage() {
  const repository = useRepository();
  const navigate = useNavigate();
  const mutate = useMutate();
  const { isLoading } = useWorkspaceQuery();
  const bundle = useWorkspaceBundle();

  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<AcademicTrack | null>(null);
  const [classLevel, setClassLevel] = useState('');
  const [group, setGroup] = useState('');
  const [session, setSession] = useState('');
  const [board, setBoard] = useState('');
  const [admissionTarget, setAdmissionTarget] = useState('');
  const [pickedSubjects, setPickedSubjects] = useState<Set<string>>(new Set());
  const [keepExisting, setKeepExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const versions = useMemo(() => bundle?.curriculum.versions ?? [], [bundle]);
  const profile = bundle?.profile;

  // Prefill from the existing profile once (edit mode / legacy upgrade).
  if (!initialized && profile) {
    const existingTrack = profile.academic_track ?? trackFromLegacyLevel(profile.academic_level);
    if (existingTrack) setTrack(existingTrack);
    if (profile.class_level) setClassLevel(profile.class_level);
    if (profile.study_group) setGroup(profile.study_group);
    if (profile.academic_session) setSession(profile.academic_session);
    if (profile.board) setBoard(profile.board);
    if (profile.admission_target) setAdmissionTarget(profile.admission_target);
    if ((bundle?.subjects.length ?? 0) > 0) setKeepExisting(true);
    setInitialized(true);
  }

  const isSchoolTrack = track !== null && trackUsesClassLevel(track);
  const groups = useMemo(() => (track ? groupsForTrack(versions, track) : []), [versions, track]);
  const sessions = useMemo(
    () => (track ? sessionsForTrack(versions, track, group) : []),
    [versions, track, group],
  );
  const version = useMemo(
    () => (track && !trackUsesClassLevel(track) ? resolveVersion(versions, track, group, session) : null),
    [versions, track, group, session],
  );
  const subjects: CurriculumSubject[] = useMemo(() => {
    if (!version || !bundle) return [];
    return bundle.curriculum.subjects
      .filter((s) => s.curriculum_version_id === version.id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [bundle, version]);
  const versionChapters = useMemo(() => {
    if (!version || !bundle) return [];
    const subjectIds = new Set(subjects.map((s) => s.id));
    return bundle.curriculum.chapters.filter((c) => subjectIds.has(c.curriculum_subject_id));
  }, [bundle, version, subjects]);

  const adoptedIds = useMemo(
    () => new Set((bundle?.subjects ?? []).map((s) => s.curriculum_subject_id).filter(Boolean)),
    [bundle],
  );

  if (isLoading || !bundle || !profile) return <PageSkeleton />;

  const toggleSubject = (id: string) => {
    setPickedSubjects((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canContinue =
    step === 0
      ? track !== null
      : step === 1
        ? isSchoolTrack
          ? classLevel.trim().length > 0
          : group.trim().length > 0
        : step === 2
          ? isSchoolTrack || keepExisting || pickedSubjects.size > 0 || adoptedIds.size > 0
          : true;

  const finish = async () => {
    if (!track) return;
    setBusy(true);
    setError(null);
    try {
      await mutate(async (repo) => {
        if (version) {
          for (const subjectId of pickedSubjects) {
            await repo.adoptCurriculumSubject(version.id, subjectId);
            // When the curriculum has real chapter rows (imported reference
            // syllabus), bring them into the workspace in the same step, so
            // the tracker is usable immediately. Structure-only versions
            // have no chapters — nothing is invented.
            const chapterIds = versionChapters
              .filter((c) => c.curriculum_subject_id === subjectId)
              .map((c) => c.id);
            if (chapterIds.length > 0) {
              await repo.addChaptersFromCurriculum(version.id, subjectId, chapterIds);
            }
          }
        }
        await repo.updateProfile({
          academic_track: track,
          class_level: isSchoolTrack ? classLevel.trim() || null : null,
          admission_target: track === 'hsc_admission' ? admissionTarget.trim() || null : null,
          study_group: !isSchoolTrack ? group.trim() || null : null,
          academic_session: session.trim() || null,
          board: !isSchoolTrack ? board.trim() || null : null,
          setup_completed_at: profile.setup_completed_at ?? new Date().toISOString(),
        });
      });
      navigate('/syllabus', { replace: true });
    } catch (finishError) {
      setError(errorMessage(finishError));
    } finally {
      setBusy(false);
    }
  };

  const existingSubjectCount = bundle.subjects.length;
  void repository;

  return (
    <div className="setup-shell">
      <PageHeader
        title="Academic setup"
        description="Tell MKJ StudyOS what you are studying. You can change this later in Settings — your progress is always kept."
      />
      <div className="setup-steps" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        {STEPS.map((label, index) => (
          <span key={label} className={index <= step ? 'is-done' : ''} />
        ))}
      </div>
      <FormError message={error} />

      {step === 0 ? (
        <section aria-label="Choose your section" className="stack">
          <h2 className="section-title">What are you studying?</h2>
          <div className="choice-grid">
            {ACADEMIC_TRACKS.map((value) => (
              <button
                key={value}
                type="button"
                className={`choice-card ${track === value ? 'is-selected' : ''}`}
                onClick={() => {
                  setTrack(value);
                  setClassLevel('');
                  setGroup('');
                  setSession('');
                  setPickedSubjects(new Set());
                }}
                aria-pressed={track === value}
              >
                <div className="choice-card__title">{TRACK_LABELS[value]}</div>
                <div className="choice-card__desc">{TRACK_DESCRIPTIONS[value]}</div>
              </button>
            ))}
          </div>
          {track === 'hsc_admission' ? (
            <Notice tone="info" title="Same syllabus, no duplicate work.">
              Admission preparation uses your HSC curriculum and keeps all HSC progress.
            </Notice>
          ) : null}
          {isSchoolTrack ? (
            <Notice tone="info" title="School classes use your own subjects.">
              No verified curriculum is seeded for school classes yet — you will add your own subjects and chapters.
              Nothing is invented, and a verified curriculum can be added later without losing work.
            </Notice>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section aria-label="Class, group and session" className="stack">
          <h2 className="section-title">{isSchoolTrack ? 'Class & session' : 'Group & session'}</h2>

          {isSchoolTrack && track ? (
            <div className="choice-grid" role="group" aria-label="Choose your class">
              {(CLASS_LEVELS[track] ?? []).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`choice-card ${classLevel === value ? 'is-selected' : ''}`}
                  onClick={() => setClassLevel(value)}
                  aria-pressed={classLevel === value}
                >
                  <div className="choice-card__title">{value}</div>
                </button>
              ))}
            </div>
          ) : (
            <>
              {groups.length > 0 ? (
                <div className="choice-grid">
                  {groups.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`choice-card ${group === value ? 'is-selected' : ''}`}
                      onClick={() => setGroup(value)}
                      aria-pressed={group === value}
                    >
                      <div className="choice-card__title">{value}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <Notice tone="warn" title="No groups listed for this track yet.">
                    Type your group below — the curriculum structure is still being verified.
                  </Notice>
                  <TextField name="group" label="Group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Science" />
                </>
              )}
            </>
          )}

          <TextField
            name="session"
            label={isSchoolTrack ? 'Academic year (optional)' : 'Session (academic year)'}
            value={session}
            onChange={(e) => setSession(e.target.value)}
            placeholder={sessions[0] ?? 'e.g. 2026'}
            help={sessions.length > 0 ? `Seeded structure covers: ${sessions.join(', ')}. You can type another session.` : 'Type your session or year, e.g. 2026.'}
          />

          {!isSchoolTrack ? (
            <div className="field">
              <label className="field__label" htmlFor="setup-board">Board (optional)</label>
              <select id="setup-board" className="input" value={board} onChange={(e) => setBoard(e.target.value)}>
                <option value="">Select a board…</option>
                {BOARDS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
          ) : null}

          {track === 'hsc_admission' ? (
            <TextField
              name="admission-target"
              label="Admission target (optional)"
              value={admissionTarget}
              onChange={(e) => setAdmissionTarget(e.target.value)}
              placeholder="e.g. DU A-unit, BUET, Medical"
              help="Your own goal, in your own words. The syllabus stays the HSC one."
            />
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-label="Choose subjects" className="stack">
          <h2 className="section-title">Your subjects</h2>
          {existingSubjectCount > 0 ? (
            <label className={`subject-pick ${keepExisting ? 'is-selected' : ''}`}>
              <input type="checkbox" checked={keepExisting} onChange={(e) => setKeepExisting(e.target.checked)} />
              <span>
                <strong>Keep my {existingSubjectCount} existing subject{existingSubjectCount === 1 ? '' : 's'}</strong>
                <span className="block small muted">All chapters, checklists and history stay exactly as they are.</span>
              </span>
            </label>
          ) : null}
          {isSchoolTrack ? (
            <Notice tone="info" title="Add your own subjects after setup.">
              School-class curricula are not seeded (no verified source yet). After finishing, create subjects from
              the Syllabus screen and add the chapters from your own textbooks. Every record you save is kept.
            </Notice>
          ) : version ? (
            <>
              {versionChapters.length > 0 ? (
                <Notice tone="info" title="Chapter list included — source recorded.">
                  This curriculum includes {versionChapters.length} imported chapters (see the source on My
                  Curriculum). Picking a subject brings its chapters into your tracker. Rows stay marked{' '}
                  <strong>needs verification</strong> until checked against the official textbooks.
                </Notice>
              ) : (
                <Notice tone="warn" title="Structure only — chapter lists need verification.">
                  Subject names come from the seeded curriculum structure and are marked{' '}
                  <strong>needs verification</strong>. Chapter lists are not filled in yet; add chapters manually or
                  import a verified list from My Curriculum. Nothing here is presented as an official syllabus.
                </Notice>
              )}
              <div role="group" aria-label="Curriculum subjects">
                {subjects.map((subject) => {
                  const adopted = adoptedIds.has(subject.id);
                  const checked = adopted || pickedSubjects.has(subject.id);
                  const chapterCount = versionChapters.filter((c) => c.curriculum_subject_id === subject.id).length;
                  return (
                    <label key={subject.id} className={`subject-pick ${checked ? 'is-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={adopted}
                        onChange={() => toggleSubject(subject.id)}
                      />
                      <span>
                        <strong>{subject.name}</strong>
                        {subject.paper_label ? <span className="muted"> — {subject.paper_label}</span> : null}
                        {subject.is_compulsory ? <span className="tiny muted"> · compulsory</span> : null}
                        {chapterCount > 0 ? <span className="tiny muted"> · {chapterCount} chapters</span> : null}
                        {adopted ? <span className="tiny muted"> · already added</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <Notice tone="info" title="No curriculum version matches yet.">
              You can still finish setup and add subjects manually from the Subjects screen.
            </Notice>
          )}
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-label="Confirm setup" className="stack">
          <h2 className="section-title">Ready to go</h2>
          <div className="card">
            <dl className="kv">
              <div><dt>Section</dt><dd>{track ? TRACK_LABELS[track] : '—'}</dd></div>
              {isSchoolTrack ? <div><dt>Class</dt><dd>{classLevel || '—'}</dd></div> : null}
              {!isSchoolTrack ? <div><dt>Group</dt><dd>{group || '—'}</dd></div> : null}
              <div><dt>Session</dt><dd>{session || '—'}</dd></div>
              {!isSchoolTrack ? <div><dt>Board</dt><dd>{board || '—'}</dd></div> : null}
              {track === 'hsc_admission' ? <div><dt>Target</dt><dd>{admissionTarget || '—'}</dd></div> : null}
              <div>
                <dt>Subjects</dt>
                <dd>
                  {isSchoolTrack
                    ? 'Add your own after setup'
                    : keepExisting
                      ? `Keeping ${existingSubjectCount} existing`
                      : `${pickedSubjects.size || adoptedIds.size} selected`}
                  {!isSchoolTrack && keepExisting && pickedSubjects.size > 0 ? ` + ${pickedSubjects.size} new` : ''}
                </dd>
              </div>
            </dl>
          </div>
          <Notice tone="info" title="Your data is safe.">
            Setup never deletes subjects, chapters or progress. You can change every choice later in Settings →
            Academic setup.
          </Notice>
        </section>
      ) : null}

      <div className="row row--between" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
          disabled={busy}
        >
          <IonIcon icon={arrowBackOutline} aria-hidden="true" /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setStep(step + 1)}
            disabled={!canContinue}
          >
            Continue <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => void finish()} disabled={busy}>
            <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" /> {busy ? 'Saving…' : 'Finish setup'}
          </button>
        )}
      </div>
    </div>
  );
}
