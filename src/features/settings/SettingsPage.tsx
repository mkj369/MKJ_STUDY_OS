import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonAlert, IonIcon } from '@ionic/react';
import { downloadOutline, shieldCheckmarkOutline, trashOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { useAuth, useServices } from '@/app/AppProviders';
import { useI18n } from '@/i18n';
import { Badge, DemoBadge, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { FormError } from '@/components/ui/Form';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { profileSchema } from '@/domain/schemas';
import { TIMEZONE_OPTIONS } from '@/services/reminderDefaults';
import { errorMessage } from '@/utils/errors';
import type { Locale } from '@/types/domain';
import { AppearanceSection } from '@/features/settings/AppearanceSection';
import { ClassAndGroupSection } from '@/features/settings/ClassAndGroupSection';
import { SupportDialog } from '@/features/settings/SupportDialog';
import { LogoMark } from '@/components/brand/Logo';
import { heartOutline } from 'ionicons/icons';

function SettingsContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const auth = useAuth();
  const services = useServices();
  const { locale, setLocale } = useI18n();
  const notify = useNotify();
  const [profileForm, setProfileForm] = useState(() => ({
    display_name: data?.bundle.profile.display_name ?? '',
    timezone: data?.bundle.profile.timezone ?? 'Asia/Dhaka',
    academic_level: data?.bundle.profile.academic_level ?? 'HSC',
  }));
  const [error, setError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [deletingData, setDeletingData] = useState(false);
  const [deleteAccountAlert, setDeleteAccountAlert] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  if (!data) return null;
  const { bundle, view } = data;

  const saveProfile = async () => {
    const parsed = profileSchema.safeParse({ ...profileForm, locale });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setError(null);
    setSavingProfile(true);
    try {
      await mutate((repo) => repo.updateProfile(parsed.data));
      await notify('Profile saved.');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingProfile(false);
    }
  };

  const changeLocale = async (next: Locale) => {
    setLocale(next);
    try {
      await mutate((repo) => repo.updateProfile({ locale: next }));
    } catch (localeError) {
      await notify(`${errorMessage(localeError)} The interface language changed for this device only.`, 'warning');
    }
  };

  const exportData = async () => {
    try {
      const exported = await mutate(async (repo) => repo.exportAll());
      const json = JSON.stringify(exported, null, 2);
      setExportJson(json);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mkj-studyos-export-${view.today}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      await notify('Export prepared. A download started if your browser allows it.');
    } catch (exportError) {
      await notify(errorMessage(exportError), 'danger');
    }
  };

  const copyExport = async () => {
    if (!exportJson) return;
    try {
      await navigator.clipboard.writeText(exportJson);
      await notify('Export JSON copied to the clipboard.');
    } catch {
      await notify('Clipboard is blocked in this browser. Select the text and copy it manually.', 'warning');
    }
  };

  const loadDemo = async () => {
    try {
      await mutate((repo) => repo.seedDemoWorkspace());
      await notify('Demo data loaded and labelled everywhere it appears.');
    } catch (demoError) {
      await notify(errorMessage(demoError), 'danger');
    }
  };

  const removeDemo = async () => {
    try {
      const result = await mutate((repo) => repo.removeDemoData());
      await notify(`Demo data removed (${result.removed} row(s)). Your own records were kept.`, 'warning');
    } catch (demoError) {
      await notify(errorMessage(demoError), 'danger');
    }
  };

  const deleteAllRecords = async () => {
    setDeletingData(true);
    try {
      const result = await mutate((repo) => repo.deleteAllUserData());
      setExportJson(null);
      await notify(
        `Deleted ${result.deleted} record(s). Your profile and reminder settings remain.`,
        'warning',
      );
    } catch (deleteError) {
      await notify(errorMessage(deleteError), 'danger');
    } finally {
      setDeletingData(false);
    }
  };

  const deleteAccount = async () => {
    if (!services.auth.deleteAccount) {
      await notify('Account deletion is only available in cloud mode.', 'warning');
      return;
    }
    setDeletingAccount(true);
    try {
      await services.auth.deleteAccount();
      await notify('Account deleted. Signing out…');
      await auth.signOut();
    } catch (deleteError) {
      await notify(errorMessage(deleteError), 'danger');
    } finally {
      setDeletingAccount(false);
      setDeleteAccountAlert(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Profile, Privacy & Settings"
        description="Your records, your control. Export or delete at any time. Minimum data collected."
        actions={<Badge tone={auth.mode === 'cloud' ? 'good' : 'info'}>{auth.mode === 'cloud' ? 'Cloud account' : 'Local demo'}</Badge>}
      />

      <AppearanceSection />

      <ClassAndGroupSection />

      <div className="grid grid--two">
        <SectionCard title="Profile" hint="Only what the app needs to personalise your plan">
          <div className="form">
            <label className="field">
              <span className="field__label">Display name</span>
              <input
                className="input"
                value={profileForm.display_name}
                onChange={(event) => setProfileForm((current) => ({ ...current, display_name: event.target.value }))}
                maxLength={60}
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span className="field__label">Academic level</span>
              <input
                className="input"
                value={profileForm.academic_level}
                onChange={(event) => setProfileForm((current) => ({ ...current, academic_level: event.target.value }))}
                maxLength={60}
                placeholder="HSC"
              />
            </label>
            <label className="field">
              <span className="field__label">Time zone</span>
              <select
                className="select"
                value={profileForm.timezone}
                onChange={(event) => setProfileForm((current) => ({ ...current, timezone: event.target.value }))}
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field__help">Used for “today”, reminders and quiet hours.</span>
            </label>
            <div className="field">
              <span className="field__label">Interface language</span>
              <div className="segmented" role="group" aria-label="Interface language">
                <button type="button" aria-pressed={locale === 'en'} onClick={() => void changeLocale('en')}>
                  English
                </button>
                <button type="button" aria-pressed={locale === 'bn'} onClick={() => void changeLocale('bn')}>
                  বাংলা
                </button>
              </div>
              <span className="field__help">
                Navigation and common labels switch language. Long-form text remains English in this release
                (documented limitation).
              </span>
            </div>
            <FormError message={error} />
            <div className="row">
              <button type="button" className="btn btn--primary" onClick={() => void saveProfile()} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save profile'}
              </button>
              <Link to="/tasks" className="btn btn--secondary btn--sm">
                Edit study availability
              </Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Privacy & security" hint="Plain-language summary">
          <div className="stack">
            <p className="small">
              <strong>What is stored:</strong> the records you enter (subjects, lectures, sessions, revisions,
              difficulties, mistakes, tasks, exams, notes, links) plus your display name, locale, time zone and
              reminder settings.
            </p>
            <p className="small">
              <strong>What is not stored:</strong> location, contacts, photos, passwords in plain text, or
              anything you did not enter. No public profile or social features exist.
            </p>
            <p className="small">
              <strong>Who can read it:</strong>{' '}
              {auth.mode === 'cloud'
                ? 'only your authenticated account, enforced by Postgres row-level security. AI features receive a bounded summary of relevant records, never your whole database.'
                : 'in local demo mode the data lives in this browser’s storage. Anyone with access to this device/browser profile could read it. It is not encrypted and not backed up.'}
            </p>
            <p className="small">
              <strong>AI:</strong> optional and server-side only. With AI off, every core workflow and the weekly
              report still work.
            </p>
            <p className="small">
              <strong>Minors:</strong> this app is aimed at HSC students, many of whom are minors. Keep only the
              data you need; review your deployment’s privacy policy before sharing it with others.
            </p>
            <Notice tone="neutral" icon={<IonIcon icon={shieldCheckmarkOutline} />}>
              No analytics, ads or third-party trackers are included in this build.
            </Notice>
          </div>
        </SectionCard>
      </div>

      <div style={{ height: 16 }} />

      <SectionCard title="Data" hint="Export, demo data and deletion">
        <div className="stack">
          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={() => void exportData()}>
              <IonIcon icon={downloadOutline} aria-hidden="true" /> Export all data (JSON)
            </button>
            {exportJson ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copyExport()}>
                Copy JSON
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => void loadDemo()}
              disabled={bundle.subjects.some((s) => s.is_demo)}
            >
              Load demo data
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void removeDemo()} disabled={!view.demoActive}>
              Remove demo data
            </button>
            {view.demoActive ? <DemoBadge /> : null}
          </div>
          {exportJson ? (
            <textarea className="textarea" readOnly value={exportJson} rows={8} aria-label="Exported JSON" />
          ) : (
            <p className="tiny muted">
              Export includes curriculum references, every record and your reminder settings. Keep the file
              private: it contains your notes and marks.
            </p>
          )}

          <div className="divider" />

          <div className="row">
            <ConfirmDeleteButton
              label={deletingData ? 'Deleting…' : 'Delete all my records'}
              header="Delete every record?"
              message="This removes all subjects, chapters, lectures, sessions, revisions, difficulties, mistakes, tasks, exams, notes and reminders from your workspace. Your profile stays. Export first if you might want the data later. This cannot be undone."
              onConfirm={deleteAllRecords}
            />
            <span className="tiny muted">Your account itself is not deleted by this action.</span>
          </div>

          <div className="divider" />

          <div className="row">
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => setDeleteAccountAlert(true)}
              disabled={auth.mode !== 'cloud' || deletingAccount}
            >
              <IonIcon icon={trashOutline} aria-hidden="true" /> {deletingAccount ? 'Deleting account…' : 'Delete my account'}
            </button>
            <span className="tiny muted">
              {auth.mode === 'cloud'
                ? 'Deletes the cloud account and all its rows via a server-side function. Irreversible.'
                : 'Local demo has no server account. Use “Delete all my records” above, or clear this browser’s site data.'}
            </span>
          </div>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Session" hint="Sign out on this device">
        <div className="row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              void auth.signOut();
            }}
          >
            Sign out
          </button>
          <span className="tiny muted">
            {auth.mode === 'cloud' ? `Signed in as ${auth.user?.email}` : 'Local workspace session'}
          </span>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="About MKJ StudyOS" hint="Honest status, not marketing">
        <div className="stack">
          <div className="logo-lockup">
            <LogoMark size={44} />
            <div className="logo-lockup__text">
              <span className="logo-lockup__name">MKJ StudyOS</span>
              <span className="logo-lockup__tagline">Study smarter. Stay consistent. · v0.1.0</span>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSupportOpen(true)}>
              <IonIcon icon={heartOutline} aria-hidden="true" /> Support MKJ StudyOS
            </button>
            <span className="tiny muted">A contact request, not a payment.</span>
          </div>
          <p className="small">
            Storage mode: <strong>{auth.mode === 'cloud' ? 'Supabase cloud' : 'browser local storage'}</strong>
            {auth.mode === 'local' ? ` — ${auth.localReason ?? ''}` : ''}
          </p>
          <p className="small">
            Curriculum versions available: {bundle.curriculum.versions.length}. Subjects in your workspace:{' '}
            {view.totals.subjects}. Chapters: {view.totals.chapters}.
          </p>
          <p className="tiny muted">
            Android packaging uses Capacitor (see README). Native build/APK generation requires Android Studio
            and is not performed by this web build.
          </p>
        </div>
      </SectionCard>

      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />

      <IonAlert
        isOpen={deleteAccountAlert}
        onDidDismiss={() => setDeleteAccountAlert(false)}
        header="Delete your account permanently?"
        message="This deletes your authentication account and every record owned by it. There is no recovery. Export your data first if unsure."
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete permanently', role: 'destructive', handler: () => void deleteAccount() },
        ]}
      />
    </>
  );
}

export function SettingsPage() {
  return <WorkspaceGate>{() => <SettingsContent />}</WorkspaceGate>;
}
