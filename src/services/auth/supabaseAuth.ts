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

function mapError(message: string): AuthError {
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
  if (/rate limit|too many/i.test(message)) {
    return new AuthError('Too many attempts. Wait a moment and try again.', 'rate_limited');
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
    if (error) throw mapError(error.message);
    const user = mapUser(data.user);
    if (!user) throw new AuthError('Sign-in succeeded but no user was returned.', 'no_user');
    return user;
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw mapError(error.message);
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
      throw mapError(error.message);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error) throw mapError(error.message);
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
