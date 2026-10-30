import { useState } from 'react';
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

export function AuthPage() {
  const { mode: appMode, localReason, signIn, signUp, startLocalWorkspace, sendPasswordReset, signInWithGoogle } =
    useAuth();
  const services = useServices();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('signin');
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localName, setLocalName] = useState('');
  const [withDemo, setWithDemo] = useState(true);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema) as Resolver<SignInValues>,
    defaultValues: { email: '', password: '' },
  });
  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema) as Resolver<SignUpValues>,
    defaultValues: { email: '', password: '', displayName: '' },
  });

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
    setBusy(true);
    try {
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
      // A successful OAuth call navigates away; reaching here means the browser
      // was not redirected, so tell the student rather than pretend it worked.
      setInfo('Google sign-in was started. If nothing happened, allow pop-ups and try again.');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const startLocal = async () => {
    setFormError(null);
    setBusy(true);
    try {
      const user = await startLocalWorkspace(localName.trim() || 'Student');
      if (withDemo) {
        try {
          const repository = services.createRepository(user.id);
          await repository.seedDemoWorkspace();
          await queryClient.invalidateQueries();
        } catch (seedError) {
          setInfo(
            `Workspace created, but demo data could not be loaded: ${errorMessage(seedError)}. You can start empty.`,
          );
        }
      }
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
            <li>Classes 1–12, with Science, Humanities and Business Studies for 9–12.</li>
            <li>Generate twelve chapters in one tap, then rename them in English or Bengali.</li>
            <li>Every percentage shows its denominator, or says “not recorded”.</li>
            <li>Works offline on this device; accounts sync when you sign in.</li>
          </ul>
        </aside>

        <div className="auth-card">
          <div className="auth-brand mobile-only">
            <LogoLockup size={44} tagline="Study smarter. Stay consistent." />
          </div>

          {!isCloud ? (
            <>
              <div className="auth-heading">
                <h1>Start on this device</h1>
                <p className="small muted">
                  No account needed. Everything you record stays in this browser until you connect a cloud
                  account.
                </p>
              </div>

              <div className="form">
                <TextField
                  label="Your name"
                  name="localName"
                  placeholder="e.g. Mahin"
                  value={localName}
                  onChange={(event) => setLocalName(event.target.value)}
                  autoComplete="name"
                  maxLength={60}
                />
                <label className="checkbox">
                  <input type="checkbox" checked={withDemo} onChange={(e) => setWithDemo(e.target.checked)} />
                  <span>Include clearly-labelled demo data to explore. Remove it any time in Settings.</span>
                </label>
                <FormError message={formError} />
                <button type="button" className="btn btn--primary btn--block" onClick={startLocal} disabled={busy}>
                  {busy ? 'Preparing…' : 'Start local workspace'}
                </button>
              </div>

              <details className="auth-advanced">
                <summary>Sign in with Google or email</summary>
                <p className="small muted">
                  Cloud accounts appear here once this build has Supabase credentials. Add{' '}
                  <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
                  <code>.env.local</code>, then enable Google in Supabase → Authentication → Providers.
                </p>
                {localReason ? <p className="tiny muted">{localReason}</p> : null}
              </details>

              <div className="auth-switch">
                <IonIcon icon={cloudOfflineOutline} aria-hidden="true" /> Stored in this browser only · no account
                required
              </div>
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
        </div>
      </div>
    </div>
  );
}
