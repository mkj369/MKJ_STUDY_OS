/**
 * Community progress sharing — PRIVATE by default.
 *
 * Nothing is shared until the student explicitly enables it. The public row
 * contains only a pseudonym and aggregate numbers (never email, notes or
 * per-chapter records) and RLS hides it the moment sharing is switched off.
 * Local mode has no server: we say so instead of faking a leaderboard.
 */
import { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { peopleOutline, refreshOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useAuth, useRepository } from '@/app/AppProviders';
import { useMutate, useWorkspaceQuery } from '@/hooks/useWorkspace';
import { EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { PageSkeleton } from '@/components/ui/BrandLoader';
import { TextField, CheckboxField, FormError } from '@/components/ui/Form';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { TRACK_LABELS, type AcademicTrack } from '@/domain/tracks';
import { weekRange } from '@/domain/dates';
import type { CommunityProfile } from '@/types/domain';
import { errorMessage } from '@/utils/errors';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function CommunityContent() {
  const { mode } = useAuth();
  const repository = useRepository();
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();

  const [pseudonym, setPseudonym] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareAcademics, setShareAcademics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<CommunityProfile[] | null>(null);
  const [loadingShared, setLoadingShared] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const existing = data?.bundle.communityProfile ?? null;

  if (!initialized && data) {
    if (existing) {
      setPseudonym(existing.pseudonym);
      setSharing(existing.sharing_enabled);
      setShareAcademics(existing.share_academic_info);
    }
    setInitialized(true);
  }

  const loadShared = async () => {
    if (mode !== 'cloud') return;
    setLoadingShared(true);
    try {
      setShared(await repository.listSharedCommunityProfiles());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingShared(false);
    }
  };

  useEffect(() => {
    void loadShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (!data) return <PageSkeleton />;
  const { view } = data;
  const overview = view.syllabusOverview;
  const week = weekRange(view.today);
  const weeklyMinutes = data.bundle.sessions
    .filter((s) => s.session_date >= week.start && s.session_date <= week.end)
    .reduce((sum, s) => sum + s.duration_minutes, 0);

  const save = async () => {
    const name = pseudonym.trim();
    if (name.length < 2 || name.length > 40) {
      setError('Choose a pseudonym of 2–40 characters. Do not use your real name, email or phone number.');
      return;
    }
    if (/@|\d{7,}/.test(name)) {
      setError('The pseudonym must not contain an email address or phone number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutate((repo) =>
        repo.saveCommunityProfile({
          pseudonym: name,
          academic_track: shareAcademics ? view.profile.academic_track : null,
          study_group: shareAcademics ? view.profile.study_group : null,
          sharing_enabled: sharing,
          share_academic_info: shareAcademics,
          overall_percent: overview.overallPercent,
          chapters_completed: overview.chaptersComplete,
          chapters_total: overview.chaptersCounted,
          weekly_minutes: weeklyMinutes,
          snapshot_at: new Date().toISOString(),
        }),
      );
      await notify(sharing ? 'Sharing enabled. Only your pseudonym and totals are public.' : 'Saved. Your profile stays private.');
      await loadShared();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutate((repo) => repo.deleteCommunityProfile());
      setSharing(false);
      setPseudonym('');
      await notify('Public snapshot deleted. You are fully private again.');
      await loadShared();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Community"
        description="Compare overall progress with other students — only if you choose to. Private by default, pseudonymous by design."
      />

      <Notice tone="info" icon={<IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />} title="What is never shared">
        Your email, real name, notes, chapter records, lectures, locations and contact details never leave your
        account. Sharing publishes only a pseudonym, overall percentage, chapter counts and weekly minutes.
      </Notice>

      <SectionCard title="Your public snapshot" hint={sharing ? 'Visible to other signed-in students' : 'Private — nobody can see this'}>
        <FormError message={error} />
        <div className="form">
          <TextField
            name="pseudonym"
            label="Pseudonym"
            value={pseudonym}
            onChange={(event) => setPseudonym(event.target.value)}
            placeholder="e.g. NightOwl27"
            maxLength={40}
            help="A nickname, not your real name. No emails or phone numbers."
          />
          <CheckboxField
            name="share_academic_info"
            label="Also show my track and group (e.g. HSC · Science)"
            checked={shareAcademics}
            onChange={(event) => setShareAcademics(event.target.checked)}
          />
          <CheckboxField
            name="sharing_enabled"
            label="Share my progress snapshot with the community"
            checked={sharing}
            onChange={(event) => setSharing(event.target.checked)}
            help="Off by default. Turning this off hides your row immediately."
          />
          <div className="card" aria-label="Preview of your public snapshot">
            <div className="community-card" style={{ border: 'none', padding: 0 }}>
              <div className="community-card__avatar" aria-hidden="true">{initials(pseudonym || '?')}</div>
              <div className="community-card__main">
                <div className="community-card__name">{pseudonym || 'Your pseudonym'}</div>
                <div className="community-card__meta">
                  {shareAcademics && view.profile.academic_track
                    ? `${TRACK_LABELS[view.profile.academic_track as AcademicTrack]}${view.profile.study_group ? ` · ${view.profile.study_group}` : ''} · `
                    : ''}
                  {overview.chaptersComplete}/{overview.chaptersCounted} chapters · {weeklyMinutes} min this week
                </div>
              </div>
              <div className="community-card__pct">{overview.overallPercent}%</div>
            </div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>Exactly this — and nothing else — becomes public.</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : sharing ? 'Update & share snapshot' : 'Save (stay private)'}
            </button>
            {existing ? (
              <button type="button" className="btn btn--danger" onClick={() => void stopSharing()} disabled={busy}>
                Delete public snapshot
              </button>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Community progress"
        hint="Optional ranking by overall completion"
        action={
          mode === 'cloud' ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadShared()} disabled={loadingShared}>
              <IonIcon icon={refreshOutline} aria-hidden="true" /> {loadingShared ? 'Loading…' : 'Refresh'}
            </button>
          ) : undefined
        }
      >
        {mode !== 'cloud' ? (
          <EmptyState
            icon={<IonIcon icon={peopleOutline} aria-hidden="true" />}
            title="Community needs a cloud account"
            message="This workspace lives only on your device, so there is no server to share with. Sign in with a configured Supabase account to see and join the community. Nothing is simulated here."
          />
        ) : shared === null ? (
          <PageSkeleton />
        ) : shared.length === 0 ? (
          <EmptyState
            icon={<IonIcon icon={peopleOutline} aria-hidden="true" />}
            title="No shared profiles yet"
            message="Nobody has opted in yet (or you are the first). Share yours above to get things started."
          />
        ) : (
          <div>
            {shared.map((profile, index) => (
              <div className="community-card" key={profile.user_id}>
                <div className="community-card__avatar" aria-hidden="true">{initials(profile.pseudonym)}</div>
                <div className="community-card__main">
                  <div className="community-card__name">
                    <span className="muted tiny">#{index + 1}</span> {profile.pseudonym}
                  </div>
                  <div className="community-card__meta">
                    {profile.share_academic_info && profile.academic_track
                      ? `${TRACK_LABELS[profile.academic_track]}${profile.study_group ? ` · ${profile.study_group}` : ''} · `
                      : ''}
                    {profile.chapters_completed}/{profile.chapters_total} chapters · {profile.weekly_minutes} min/wk
                  </div>
                </div>
                <div className="community-card__pct">{profile.overall_percent}%</div>
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Ranked by self-reported overall completion. Snapshots update when each student refreshes theirs.
            </p>
          </div>
        )}
      </SectionCard>
    </>
  );
}

export function CommunityPage() {
  return <WorkspaceGate>{() => <CommunityContent />}</WorkspaceGate>;
}
