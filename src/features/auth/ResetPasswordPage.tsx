/**
 * Set a new password after following a Supabase recovery e-mail link.
 * The link creates a temporary recovery session; updatePassword consumes it.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useServices } from '@/app/AppProviders';
import { TextField, FormError } from '@/components/ui/Form';
import { Notice } from '@/components/ui/Page';
import { BrandMark } from '@/components/ui/BrandLoader';
import { errorMessage } from '@/utils/errors';

const schema = z
  .object({
    password: z.string().min(6, 'Use at least 6 characters.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'The two passwords do not match.',
    path: ['confirm'],
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordPage({ onDone }: { onDone?: () => void }) {
  const auth = useAuth();
  const services = useServices();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setError(null);
    try {
      if (!services.auth.updatePassword) {
        throw new Error('Password reset needs the cloud build (Supabase not configured).');
      }
      await services.auth.updatePassword(values.password);
      setDone(true);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  });

  const finish = () => {
    // Clear any leftover recovery tokens from the URL, then show the app.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    onDone?.();
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <h1 style={{ fontSize: '1.2rem' }}>Choose a new password</h1>
            <p className="small muted">MKJ StudyOS account recovery</p>
          </div>
        </div>
        {done ? (
          <>
            <Notice tone="info" title="Password updated.">
              You are signed in with your new password.
            </Notice>
            <div style={{ height: 12 }} />
            <button type="button" className="btn btn--primary btn--block" onClick={finish}>
              Continue to MKJ StudyOS
            </button>
          </>
        ) : (
          <form className="form" onSubmit={submit} noValidate>
            {!auth.user ? (
              <Notice tone="warn" title="This link may have expired.">
                Open the most recent reset e-mail, or request a new link from the sign-in screen.
              </Notice>
            ) : null}
            <FormError message={error} />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
              error={form.formState.errors.password?.message}
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              {...form.register('confirm')}
              error={form.formState.errors.confirm?.message}
            />
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
            <button type="button" className="link-button" onClick={finish}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
