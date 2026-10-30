import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { IonIcon } from '@ionic/react';
import { cloudOfflineOutline, lockClosedOutline } from 'ionicons/icons';
import { useAuth, useServices } from '@/app/AppProviders';
import { signInSchema, signUpSchema, type SignInValues, type SignUpValues } from '@/domain/schemas';
import { FormError, TextField } from '@/components/ui/Form';
import { Notice } from '@/components/ui/Page';
import { errorMessage } from '@/utils/errors';
import { LogoLockup } from '@/components/brand/Logo';
import { ClassPicker } from '@/features/curriculum/ClassPicker';
import { classLabel, type ClassLevel } from '@/domain/classLevels';
import {
  STUDY_GROUPS,
  STUDY_GROUP_LABELS,
  groupAppliesToClass,
  groupRequiredForClass,
  type StudyGroup,
} from '@/domain/studentProfile';
import { savePendingProfile } from '@/services/auth/pendingProfile';
import { demoFixturesEnabled } from '@/config/release';

type Mode = 'signin' | 'signup';

/** Google's mark, drawn inline: no network request, no emoji, correct on both themes. */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.4 5.9 2.5 13.8l7.9 6.1C12.3 13.7 17.7 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.6 5.9c4.6-4.2 6.6-10.4 6.6-17.5Z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.5A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.1.8-4.5l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.9-6.2Z"
      />
      <path
        fill="#34A853"
        d="M24 47.5c6.2 0 11.5-2 15.5-5.6l-7.6-5.9c-2 1.4-4.7 2.4-7.9 2.4-6.3 0-11.7-4.2-13.6-10.1l-7.9 6.2C6.4 42.1 14.6 47.5 24 47.5Z"
      />
    </svg>
  );
}

/** Class + group, asked once and stored on the profile. */
function ClassAndGroup({
  classLevel,
  group,
  onClass,
  onGroup,
  idPrefix,
}: {
  classLevel: ClassLevel | null;
  group: StudyGroup | null;
  onClass: (level: ClassLevel) => void;
  onGroup: (group: StudyGroup | null) => void;
  idPrefix: string;
}) {
  return (
    <div className="stack">
      <div className="field">
        <span className="field__label" id={`${idPrefix}-class-label`}>
          Your class
        </span>
        <ClassPicker
          active={classLevel}
          classesWithSubjects={new Set<number>()}
          onChange={onClass}
        />
        <span className="field__help">
          Class 1–8 works from your own subject list; 9–10 (SSC) and 11–12 (HSC) include the official subject
          structure for your group.
        </span>
      </div>

      {groupAppliesToClass(classLevel) ? (
        <div className="field">
          <span className="field__label">
            Group {groupRequiredForClass(classLevel) ? null : <span className="field__optional">optional</span>}
          </span>
          <div className="chip-row" role="radiogroup" aria-label="Study group">
            {STUDY_GROUPS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={group === option}
                className={`chip chip--action${group === option ? ' chip--active' : ''}`}
                onClick={() => onGroup(group === option ? null : option)}
              >
                {STUDY_GROUP_LABELS[option].label}
              </button>
            ))}
          </div>
          <span className="field__help">
            {groupRequiredForClass(classLevel)
              ? 'Choose the group you sit exams in. It decides which papers are offered.'
              : 'Optional for Class 9–10. You can set it later from Settings.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function AuthPage() {
  const {
    mode: appMode,
    localReason,
    signIn,
    signUp,
    startLocalWorkspace,
    hasLocalWorkspace,
    sendPasswordReset,
    signInWithGoogle,
  } = useAuth();
  const services = useServices();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('signin');
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localName, setLocalName] = useState('');
  const [classLevel, setClassLevel] = useState<ClassLevel | null>(null);
  const [group, setGroup] = useState<StudyGroup | null>(null);
  // Fixtures only: a store build opens empty and never offers sample rows.
  const fixtures = demoFixturesEnabled();
  const [withDemo, setWithDemo] = useState(fixtures);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema) as Resolver<SignInValues>,
    defaultValues: { email: '', password: '' },
  });
  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema) as Resolver<SignUpValues>,
    defaultValues: { email: '', password: '', displayName: '' },
  });

  const chosenGroup = groupAppliesToClass(classLevel) ? group : null;

  const onSignIn = signInForm.handleSubmit(async (values) => {
    setFormError(null);
    setBusy(true);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  const onSignUp = signUpForm.handleSubmit(async (values) => {
    setFormError(null);
    if (!classLevel) {
      setFormError('Choose your class to continue.');
      return;
    }
    if (groupRequiredForClass(classLevel) && !group) {
      setFormError('Choose your group to continue.');
      return;
    }
    setBusy(true);
    try {
      /*
       * The profile row can only be written once a session exists, and with
       * email confirmation that may be minutes later. The choice is parked in
       * device storage and applied by onboarding on the first signed-in load.
       */
      savePendingProfile({ classLevel, group: chosenGroup });
      const result = await signUp(values.email, values.password, values.displayName);
      if (result.needsEmailConfirmation) {
        setInfo(result.message ?? 'Check your email to confirm the account, then sign in.');
        setMode('signin');
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  const onForgotPassword = async () => {
    const email = signInForm.getValues('email');
    if (!email) {
      setFormError('Enter your email address first, then tap “Forgot password”.');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setInfo('If that email has an account, a reset link is on its way. Check spam too.');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setFormError(null);
    setInfo(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      setInfo('Google sign-in was started. If nothing happened, allow pop-ups and try again.');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const startLocal = async () => {
    setFormError(null);
    /*
     * Reopening an existing workspace must not re-ask for the class: the profile
     * on this device already holds it, and re-picking it would either be busywork
     * or, worse, silently switch the student's class. A first run still has to
     * answer, because there is nothing to go on.
     */
    if (!hasLocalWorkspace) {
      if (!classLevel) {
        setFormError('Choose your class to continue.');
        return;
      }
      if (groupRequiredForClass(classLevel) && !group) {
        setFormError('Choose your group to continue.');
        return;
      }
    }
    setBusy(true);
    try {
      const user = await startLocalWorkspace(hasLocalWorkspace ? '' : localName.trim() || 'Student');
      const repository = services.createRepository(user.id);
      /*
       * The class chosen on this screen is written to the profile straight
       * away, so onboarding never asks for it a second time. If the write
       * fails the student still lands in the app and onboarding asks once,
       * which is why the failure is reported rather than swallowed.
       */
      // On resume the stored profile is authoritative; overwriting it with an
      // unanswered picker would blank the student's class.
      if (!hasLocalWorkspace) {
        await repository.updateProfile({
          active_class: classLevel,
          active_group: chosenGroup,
          onboarded_at: new Date().toISOString(),
        });
      }
      if (!hasLocalWorkspace && fixtures && withDemo) {
        try {
          await repository.seedDemoWorkspace();
        } catch (seedError) {
          setInfo(`Workspace created, but sample data could not be loaded: ${errorMessage(seedError)}.`);
        }
      }
      /*
       * The workspace query is already mounted by the theme provider, so it can
       * be mid-flight while this write lands. Marking it stale is not enough in
       * that race: cancel whatever is running and fetch again, or the student
       * sees the onboarding screen they just answered.
       */
      await queryClient.cancelQueries({ queryKey: ['workspace'] });
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      await queryClient.refetchQueries({ queryKey: ['workspace'], type: 'all' });
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const isCloud = appMode === 'cloud';

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-aside">
          <LogoLockup size={44} tagline="Study smarter. Stay consistent." />
          <h2 className="auth-aside__lead">
            Your class, your subjects, your chapters — planned and recorded in one place.
          </h2>
          <ul className="auth-points">
            <li>Classes 1–12, with Science, Humanities and Business Studies where they apply.</li>
            <li>Subjects and chapters you build yourself, in English or Bengali.</li>
            <li>Every percentage shows its denominator, or says “not recorded”.</li>
            <li>Works offline. Everything stays on this phone unless you export it.</li>
          </ul>
        </aside>

        <div className="auth-card">
          <div className="auth-brand mobile-only">
            <LogoLockup size={44} tagline="Study smarter. Stay consistent." />
          </div>

          {!isCloud ? (
            <>
              <div className="auth-heading">
                <h1>{hasLocalWorkspace ? 'Welcome back' : 'Welcome'}</h1>
                <p className="small muted">
                  {hasLocalWorkspace
                    ? 'This device already holds your workspace. Reopen it to pick up exactly where you stopped.'
                    : 'Set up your workspace on this device. No account, no email — your records stay in this app.'}
                </p>
              </div>

              <div className="form">
                {/*
                 * Name and class are first-run questions. On resume they are
                 * already answered — by the profile and the account record — so
                 * asking again would be busywork at best, and at worst would let
                 * a stray tap move the student to a different class.
                 */}
                {!hasLocalWorkspace ? (
                  <>
                    <TextField
                      label="Your name"
                      name="localName"
                      placeholder="e.g. Mahin"
                      value={localName}
                      onChange={(event) => setLocalName(event.target.value)}
                      autoComplete="name"
                      maxLength={60}
                      optional
                      help="Only used to greet you. You can change it later."
                    />

                    <ClassAndGroup
                      classLevel={classLevel}
                      group={group}
                      onClass={(level) => {
                        setClassLevel(level);
                        if (!groupAppliesToClass(level)) setGroup(null);
                      }}
                      onGroup={setGroup}
                      idPrefix="local"
                    />
                  </>
                ) : null}

                {!hasLocalWorkspace && fixtures ? (
                  <label className="checkbox">
                    <input type="checkbox" checked={withDemo} onChange={(e) => setWithDemo(e.target.checked)} />
                    <span>Include clearly-labelled sample data to explore. Remove it any time in Settings.</span>
                  </label>
                ) : null}

                {/*
                 * A student who signed out still owns every record on this
                 * device. Saying "start" made that read like a fresh install,
                 * and pressing it used to open an empty workspace. Both the
                 * label and the notice now name what will actually happen.
                 */}
                {hasLocalWorkspace ? (
                  <Notice tone="info">
                    Your existing workspace on this device will be reopened — subjects, chapters, tasks, notes and
                    sessions all stay exactly as you left them.
                  </Notice>
                ) : null}

                <FormError message={formError} />
                <button type="button" className="btn btn--primary btn--block" onClick={startLocal} disabled={busy}>
                  {busy ? 'Preparing…' : hasLocalWorkspace ? 'Continue on this device' : 'Start on this device'}
                </button>
              </div>

              <Notice tone="neutral" icon={<IonIcon icon={cloudOfflineOutline} />}>
                Cloud accounts are not configured in this build, so everything works offline. Your records are
                stored in this app only.
              </Notice>
              {import.meta.env.DEV && localReason ? <p className="tiny muted">{localReason}</p> : null}
            </>
          ) : (
            <>
              <div className="auth-heading">
                <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
                <p className="small muted">Your records stay private to your account.</p>
              </div>

              <button type="button" className="btn btn--google btn--block" onClick={() => void onGoogle()} disabled={busy}>
                <GoogleGlyph /> Continue with Google
              </button>

              <div className="auth-divider" role="separator">
                <span>or use email</span>
              </div>

              <div className="segmented" role="tablist" aria-label="Sign in or create account">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  aria-pressed={mode === 'signin'}
                  onClick={() => {
                    setMode('signin');
                    setFormError(null);
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  aria-pressed={mode === 'signup'}
                  onClick={() => {
                    setMode('signup');
                    setFormError(null);
                  }}
                >
                  Create account
                </button>
              </div>

              {info ? (
                <>
                  <Notice tone="info">{info}</Notice>
                  <div style={{ height: 10 }} />
                </>
              ) : null}
              <FormError message={formError} />

              {mode === 'signin' ? (
                <form className="form" onSubmit={onSignIn} noValidate>
                  <TextField
                    label="Email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    {...signInForm.register('email')}
                    error={signInForm.formState.errors.email?.message}
                  />
                  <TextField
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    {...signInForm.register('password')}
                    error={signInForm.formState.errors.password?.message}
                  />
                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                  <button type="button" className="link-button" onClick={onForgotPassword} disabled={busy}>
                    Forgot password?
                  </button>
                </form>
              ) : (
                <form className="form" onSubmit={onSignUp} noValidate>
                  <TextField
                    label="Your name"
                    autoComplete="name"
                    {...signUpForm.register('displayName')}
                    error={signUpForm.formState.errors.displayName?.message}
                  />
                  <TextField
                    label="Email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    {...signUpForm.register('email')}
                    error={signUpForm.formState.errors.email?.message}
                  />
                  <TextField
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    {...signUpForm.register('password')}
                    error={signUpForm.formState.errors.password?.message}
                    help="At least 6 characters. Use something unique, not your college password."
                  />
                  <ClassAndGroup
                    classLevel={classLevel}
                    group={group}
                    onClass={(level) => {
                      setClassLevel(level);
                      if (!groupAppliesToClass(level)) setGroup(null);
                    }}
                    onGroup={setGroup}
                    idPrefix="cloud"
                  />
                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    {busy ? 'Creating…' : 'Create account'}
                  </button>
                </form>
              )}

              <div className="auth-switch">
                <IonIcon icon={lockClosedOutline} aria-hidden="true" /> Managed by Supabase Auth · email confirmation
                may be required
              </div>
            </>
          )}

          <p className="tiny muted auth-legal">
            <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
            {classLevel && !isCloud ? <span className="sr-only">Class {classLabel(classLevel)} selected</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
