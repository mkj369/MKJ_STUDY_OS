import type { SupabaseClient, User } from '@supabase/supabase-js';
import { AuthError, type AuthClient, type AuthUser, type SignUpResult } from './types';

function mapUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as { display_name?: string; full_name?: string };
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: meta.display_name ?? meta.full_name ?? user.email?.split('@')[0] ?? 'Student',
  };
}

/**
 * Turn a Supabase auth message into a sentence a student can act on.
 *
 * Exported for tests: the mapping is the part that can be verified without a
 * live provider, and it is the part that used to fail silently.
 */
export function mapAuthError(message: string): AuthError {
  if (/invalid login credentials/i.test(message)) {
    return new AuthError('Email or password is incorrect.', 'invalid_credentials');
  }
  if (/email not confirmed/i.test(message)) {
    return new AuthError('Confirm your email address before signing in. Check your inbox.', 'email_unconfirmed');
  }
  if (/user already registered/i.test(message)) {
    return new AuthError('An account with that email already exists. Try signing in instead.', 'already_registered');
  }
  if (/password should be at least/i.test(message)) {
    return new AuthError('Use a password with at least 6 characters.', 'weak_password');
  }
  /*
   * The provider is configured in the Supabase dashboard, not in this code. When
   * it is missing, say so plainly — a silent redirect failure reads as "the
   * button is broken", and a cloud project without Google enabled is the normal
   * starting state, not an error the student can fix.
   */
  if (/provider is not enabled|unsupported provider|provider .* not enabled/i.test(message)) {
    return new AuthError(
      'Google sign-in is not enabled for this project yet. Use email, or start a local workspace — it works without any cloud setup.',
      'provider_not_enabled',
    );
  }
  if (/redirect_uri_mismatch|invalid redirect/i.test(message)) {
    return new AuthError(
      'Google rejected the redirect address. The Supabase project must list this site as a redirect URL in Authentication → URL Configuration.',
      'redirect_mismatch',
    );
  }
  if (/rate limit|too many/i.test(message)) {
    return new AuthError('Too many attempts. Wait a moment and try again.', 'rate_limited');
  }
  if (/provider is not enabled|unsupported provider|missing oauth secret/i.test(message)) {
    return new AuthError(
      'Google sign-in is not enabled for this Supabase project yet. Enable the Google provider (Authentication → Providers) and add the OAuth client ID and secret, then try again. Email sign-in keeps working.',
      'provider_not_configured',
    );
  }
  if (/redirect.*not allowed|redirect_uri_mismatch/i.test(message)) {
    return new AuthError(
      'Google rejected the redirect URL. Add this site’s URL to Supabase → Authentication → URL Configuration → Redirect URLs, and to the Google OAuth client.',
      'redirect_not_allowed',
    );
  }
  return new AuthError(message, 'auth_error');
}

export class SupabaseAuthClient implements AuthClient {
  readonly mode = 'cloud' as const;
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async getSession(): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) return null;
    return mapUser(data.session?.user);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw mapAuthError(error.message);
    const user = mapUser(data.user);
    if (!user) throw new AuthError('Sign-in succeeded but no user was returned.', 'no_user');
    return user;
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw mapAuthError(error.message);
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw mapAuthError(error.message);
    const needsEmailConfirmation = !data.session;
    return {
      user: mapUser(data.user),
      needsEmailConfirmation,
      message: needsEmailConfirmation
        ? 'Account created. Confirm your email address to finish signing in.'
        : undefined,
    };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error && !/session missing|not found/i.test(error.message)) {
      throw mapAuthError(error.message);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error) throw mapAuthError(error.message);
  }

  async deleteAccount(): Promise<void> {
    const { data, error } = await this.client.functions.invoke('delete-account', {
      body: { confirm: 'DELETE' },
    });
    if (error) {
      const detail =
        (error as { context?: { status?: number } }).context?.status === 404
          ? 'The delete-account function is not deployed on this Supabase project.'
          : error.message;
      throw new AuthError(`Account deletion failed: ${detail}`, 'delete_failed');
    }
    if (data && typeof data === 'object' && 'error' in data) {
      throw new AuthError(`Account deletion failed: ${String((data as { error: unknown }).error)}`, 'delete_failed');
    }
    await this.client.auth.signOut().catch(() => undefined);
  }

  onChange(callback: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      callback(mapUser(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }
}
