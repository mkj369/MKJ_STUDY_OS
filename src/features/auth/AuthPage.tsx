import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { IonIcon } from '@ionic/react';
import { cloudOfflineOutline, lockClosedOutline, mailOutline, personOutline } from 'ionicons/icons';
import { useAuth, useServices } from '@/app/AppProviders';
import { signInSchema, signUpSchema, type SignInValues, type SignUpValues } from '@/domain/schemas';
import { FormError, TextField } from '@/components/ui/Form';
import { Notice } from '@/components/ui/Page';
import { errorMessage } from '@/utils/errors';

type Mode = 'signin' | 'signup';

export function AuthPage() {
  const { mode: appMode, localReason, signIn, signUp, startLocalWorkspace, sendPasswordReset } = useAuth();
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
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand__mark" aria-hidden="true">
            MKJ
          </div>
          <div>
            <h1 style={{ fontSize: '1.3rem' }}>MKJ StudyOS</h1>
            <p className="small muted">Academic memory, planning and honest progress.</p>
          </div>
        </div>

        {!isCloud ? (
          <>
            <Notice tone="info" title="Local demo mode.">
              {localReason ??
                'Supabase is not configured, so this build stores records in this browser only.'}{' '}
              Local mode is for trying the workflow; data is not encrypted and is not backed up. Add
              Supabase credentials in <code>.env.local</code> to use real accounts and cloud sync.
            </Notice>
            <div style={{ height: 14 }} />
            <div className="form">
              <TextField
                label="Your name"
                name="localName"
                placeholder="e.g. Mahin"
                value={localName}
                onChange={(event) => setLocalName(event.target.value)}
                autoComplete="name"
                maxLength={60}
                help="Used only for greetings on this device."
              />
              <label className="checkbox">
                <input type="checkbox" checked={withDemo} onChange={(e) => setWithDemo(e.target.checked)} />
                <span>
                  Start with <strong>clearly-labelled demo data</strong> (recommended to explore). You can
                  remove it any time in Settings → Data.
                </span>
              </label>
              <FormError message={formError} />
              <button type="button" className="btn btn--primary btn--block" onClick={startLocal} disabled={busy}>
                {busy ? 'Preparing…' : 'Start local workspace'}
              </button>
            </div>
            <div className="auth-switch">
              <IonIcon icon={cloudOfflineOutline} aria-hidden="true" /> Stored in this browser only · No
              account required
            </div>
          </>
        ) : (
          <>
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
            <div style={{ height: 14 }} />
            {info ? (
              <>
                <Notice tone="info">{info}</Notice>
                <div style={{ height: 12 }} />
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
              <IonIcon icon={lockClosedOutline} aria-hidden="true" /> Your records are private to your
              account. Email confirmation may be required.
            </div>
            <div className="auth-switch" style={{ marginTop: 6 }}>
              <IonIcon icon={mailOutline} aria-hidden="true" /> <IonIcon icon={personOutline} aria-hidden="true" /> Accounts are
              managed by Supabase Auth.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
