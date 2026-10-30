import { useEffect, useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { checkmarkCircleOutline, mailOutline } from 'ionicons/icons';
import { useAuth } from '@/app/AppProviders';
import { TextField, FormError } from '@/components/ui/Form';
import { Notice } from '@/components/ui/Page';
import { LogoLockup } from '@/components/brand/Logo';

/** Pull the recovery marker out of the URL without leaving the token there. */
function readRecoveryMarker(): { recovery: boolean; error: string | null } {
  if (typeof window === 'undefined') return { recovery: false, error: null };
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash.startsWith('/') ? hash.slice(1) : hash);
  const error = params.get('error_description') ?? params.get('error');
  const recovery = params.get('type') === 'recovery' || params.has('access_token');
  return { recovery, error: error ? error.replace(/\+/g, ' ') : null };
}

/**
 * Finish a password reset.
 *
 * The email link lands here with a recovery session. The page sets a new
 * password and then returns the student to the app. Without a recovery link it
 * explains what to do instead of showing an empty form.
 */
export function ResetPasswordPage() {
  const { mode, updatePassword, user } = useAuth();
  const marker = useMemo(readRecoveryMarker, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(marker.error);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Keep the tokens out of the visible URL and out of any later screenshot.
  useEffect(() => {
    if (marker.recovery) {
      window.history.replaceState(null, '', `${window.location.pathname}#/reset-password`);
    }
  }, [marker.recovery]);

  useEffect(() => {
    if (!done) return;
    const handle = window.setTimeout(() => {
      window.location.hash = '#/';
    }, 1800);
    return () => window.clearTimeout(handle);
  }, [done]);

  const submit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const localMode = mode === 'local';
  const canReset = !localMode && (marker.recovery || Boolean(user));

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-brand">
            <LogoLockup size={44} tagline="Study smarter. Stay consistent." />
          </div>

          {done ? (
            <div className="stack">
              <h1>Password changed</h1>
              <Notice tone="info" icon={<IonIcon icon={checkmarkCircleOutline} />}>
                Your new password is saved. Opening the app…
              </Notice>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <h1>Set a new password</h1>
                <p className="small muted">
                  {localMode
                    ? 'This workspace lives on this device and has no password to reset.'
                    : 'Choose a password you have not used elsewhere.'}
                </p>
              </div>

              {localMode ? (
                <Notice tone="info" icon={<IonIcon icon={mailOutline} />}>
                  Password reset applies to cloud accounts only. A device workspace is protected by your phone’s
                  lock screen; everything you record stays in this app’s private storage.
                </Notice>
              ) : null}

              {!localMode && !canReset ? (
                <Notice tone="warn">
                  This page needs the link from the reset email. Open the newest email from MKJ StudyOS, or use
                  “Forgot password?” on the sign-in screen to send another.
                </Notice>
              ) : null}

              {error ? <FormError message={error} /> : null}

              {canReset ? (
                <form
                  className="form"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <TextField
                    label="New password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    help="At least 6 characters."
                  />
                  <TextField
                    label="Repeat new password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    {busy ? 'Saving…' : 'Save new password'}
                  </button>
                </form>
              ) : null}

              <button
                type="button"
                className="link-button"
                onClick={() => {
                  window.location.hash = '#/';
                }}
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
