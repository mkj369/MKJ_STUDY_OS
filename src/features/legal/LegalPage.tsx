import { useNavigate } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { arrowBackOutline, mailOutline } from 'ionicons/icons';
import { APP_VERSION, CONTACT_EMAIL } from '@/config/release';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { useAuth } from '@/app/AppProviders';

const CONTACT = `mailto:${CONTACT_EMAIL}?subject=MKJ%20StudyOS`;

/**
 * In-app privacy policy and terms.
 *
 * These describe what the code actually does in this build — device storage,
 * optional cloud account, manual export, no analytics. They are shipped inside
 * the APK so the document is readable offline, which is also the only place
 * many students will see it.
 */
export function PrivacyPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const cloud = auth.mode === 'cloud';
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else window.location.hash = '#/';
  };

  return (
    <>
      <PageHeader
        title="Privacy policy"
        description={`What MKJ StudyOS stores, where it lives, and how to remove it. Version ${APP_VERSION}.`}
      />

      <SectionCard title="What is collected">
        <div className="stack">
          <p className="small">
            <strong>Study records you enter:</strong> subjects, chapters, checklist ticks, lectures, study
            sessions, focus sessions, revision dates, difficult topics, mistakes, tasks, exams, notes and
            reminders.
          </p>
          <p className="small">
            <strong>Your profile:</strong> display name, class, group (Classes 9–12 only), language, time zone,
            study availability and appearance settings.
          </p>
          <p className="small">
            <strong>Account (optional):</strong>{' '}
            {cloud
              ? 'an email address and password, handled by Supabase Auth. The password is hashed by the provider; this app never sees or stores it.'
              : 'this build has no cloud account, so no email address or password is collected at all.'}
          </p>
          <p className="small">
            <strong>Not collected:</strong> location, contacts, photos, microphone, camera, advertising
            identifiers, or usage analytics. The app has no advertising or tracking SDKs.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Where your data lives">
        <div className="stack">
          <p className="small">
            <strong>On this device:</strong> everything you record is stored in the app’s private storage on
            your phone (a versioned local database in the app sandbox). It is not uploaded anywhere.
          </p>
          <p className="small">
            <strong>Cloud account:</strong>{' '}
            {cloud
              ? 'when you sign in with a cloud account, the records you create are saved to your Supabase project and protected by row-level security, so another account cannot read them.'
              : 'not available in this build. If a later version adds accounts, sign-in identifies you and cloud records are protected by row-level security.'}
          </p>
          <p className="small">
            <strong>Backups:</strong> none are taken automatically. “Export all data” writes a JSON file you
            choose where to keep. There is no automatic transfer between phones in this version.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Your choices">
        <div className="stack">
          <p className="small">
            <strong>Export:</strong> Settings → Export all data, or the Export screen, produces a complete JSON
            copy.
          </p>
          <p className="small">
            <strong>Delete records:</strong> Settings → Delete all my records removes every study record from
            this device. The app asks for confirmation and cannot undo it.
          </p>
          <p className="small">
            <strong>Delete account:</strong>{' '}
            {cloud
              ? 'available in Settings; it removes the cloud account and its rows through a server-side function.'
              : 'not applicable, because this build has no cloud account.'}
          </p>
          <p className="small">
            <strong>Uninstall:</strong> removing the app deletes its private storage, including your records.
            Export first if you may want them.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Children and students">
        <p className="small">
          MKJ StudyOS is used by school and college students, including minors. It asks only for a display name
          and class, has no social features, no public profile and no leaderboards. Nothing you enter is shared
          with another student.
        </p>
      </SectionCard>

      <SectionCard title="Contact and changes">
        <div className="stack">
          <p className="small">
            Questions about this policy, or a deletion request for a cloud account, can be sent to the address
            below. This document is versioned with the app; material changes will be described in the release
            notes.
          </p>
          <a className="btn btn--secondary btn--sm" href={CONTACT}>
            <IonIcon icon={mailOutline} aria-hidden="true" /> {CONTACT_EMAIL}
          </a>
        </div>
      </SectionCard>

      <button type="button" className="btn btn--ghost btn--sm" onClick={goBack}>
        <IonIcon icon={arrowBackOutline} aria-hidden="true" /> Back
      </button>
    </>
  );
}

export function TermsPage() {
  return (
    <>
      <PageHeader
        title="Terms and about"
        description={`MKJ StudyOS ${APP_VERSION} — what this app is, and what it does not promise.`}
      />

      <SectionCard title="What the app is for">
        <p className="small">
          MKJ StudyOS is a personal study organiser: your class, subjects, chapters, study time, revision dates
          and notes in one place. It is a study aid made for students in Bangladesh, not an official product of
          NCTB, any education board or any school.
        </p>
      </SectionCard>

      <SectionCard title="Curriculum accuracy">
        <div className="stack">
          <p className="small">
            Subject structures and chapter lists carry a verification state. Rows marked “partly verified” or
            “no chapter list yet” have not been checked against a full official document; the app says so on the
            screen instead of presenting them as complete.
          </p>
          <p className="small">
            Custom subjects and chapters you add are yours. Nothing is labelled official unless a source is
            recorded for it.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Your data and your device">
        <div className="stack">
          <p className="small">
            You are responsible for the device you use and for keeping a copy of your records if you need one.
            The app stores data locally and does not back it up automatically. Uninstalling the app or clearing
            its storage deletes the records.
          </p>
          <p className="small">
            There is no warranty that the app will be free of errors. Back up with “Export all data” before
            changing device or uninstalling.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Cost, donations and support">
        <div className="stack">
          <p className="small">
            The app is free. Support is a contact request only — there is no payment account, QR code or
            subscription inside the app.
          </p>
          <a className="btn btn--secondary btn--sm" href={CONTACT}>
            <IonIcon icon={mailOutline} aria-hidden="true" /> {CONTACT_EMAIL}
          </a>
        </div>
      </SectionCard>

      <SectionCard title="Version">
        <p className="small">
          MKJ StudyOS {APP_VERSION}. Release notes ship with each version; the current list is in the repository
          under <code>docs/RELEASE_NOTES.md</code>.
        </p>
      </SectionCard>
    </>
  );
}
