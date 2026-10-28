import type { KeyValueStorage } from '@/services/local/storage';
import { STORAGE_PREFIX } from '@/services/local/storage';
import { AuthError, type AuthClient, type AuthUser, type SignUpResult } from './types';

const SESSION_KEY = `${STORAGE_PREFIX}.session`;

interface StoredAccount {
  user: AuthUser;
  createdAt: string;
}

function toUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<AuthUser>;
  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') return null;
  return {
    id: candidate.id,
    email: candidate.email,
    displayName: typeof candidate.displayName === 'string' && candidate.displayName ? candidate.displayName : 'Student',
  };
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Device-local "account" used only when Supabase is not configured.
 *
 * There is no password and no server: the session is a browser-storage record.
 * This is deliberately presented as a demo workspace, not as secure auth.
 */
export class LocalAuthClient implements AuthClient {
  readonly mode = 'local' as const;
  private readonly storage: KeyValueStorage;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  private readSession(): AuthUser | null {
    try {
      const raw = this.storage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      // Stored shape is { user, createdAt }. Older builds wrote the user
      // directly, so accept both instead of silently signing the student out
      // on every reload.
      if (parsed && typeof parsed === 'object' && 'user' in parsed) {
        return toUser((parsed as { user: unknown }).user);
      }
      return toUser(parsed);
    } catch {
      return null;
    }
  }

  private writeSession(user: AuthUser | null): void {
    if (user) {
      const account: StoredAccount = { user, createdAt: new Date().toISOString() };
      this.storage.setItem(SESSION_KEY, JSON.stringify(account));
    } else {
      this.storage.removeItem(SESSION_KEY);
    }
    for (const listener of this.listeners) listener(user);
  }

  async getSession(): Promise<AuthUser | null> {
    return this.readSession();
  }

  async startLocalWorkspace(displayName: string): Promise<AuthUser> {
    const trimmed = displayName.trim() || 'Student';
    const existing = this.readSession();
    if (existing) return existing;
    const user: AuthUser = { id: randomId(), email: 'local@this-device', displayName: trimmed };
    this.writeSession(user);
    return user;
  }

  async signIn(): Promise<AuthUser> {
    const session = this.readSession();
    if (!session) {
      throw new AuthError(
        'Local mode has no accounts. Use “Start local workspace” or configure Supabase in .env.local.',
        'local_no_accounts',
      );
    }
    return session;
  }

  async signUp(_email: string, _password: string, displayName: string): Promise<SignUpResult> {
    const user = await this.startLocalWorkspace(displayName);
    return { user, needsEmailConfirmation: false, message: 'Local workspace created on this device.' };
  }

  async signOut(): Promise<void> {
    this.writeSession(null);
  }

  async sendPasswordReset(): Promise<void> {
    throw new AuthError('Password reset needs Supabase auth. Local mode has no password.', 'not_supported');
  }

  onChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
