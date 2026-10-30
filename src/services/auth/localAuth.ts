import type { KeyValueStorage } from '@/services/local/storage';
import { STORAGE_PREFIX } from '@/services/local/storage';
import { AuthError, type AuthClient, type AuthUser, type SignUpResult } from './types';

const SESSION_KEY = `${STORAGE_PREFIX}.session`;
/**
 * Durable record of who owns the device workspace.
 *
 * Deliberately separate from the session, and never removed by `signOut()`.
 * Study records are intentionally kept when a student signs out — they are the
 * student's work, not a session artefact — so the identity that owns those rows
 * has to outlive the session too. Before this record existed, signing out and
 * pressing "Start on this device" minted a new UUID, and every subject, chapter,
 * task and session silently became unreachable.
 */
const ACCOUNT_KEY = `${STORAGE_PREFIX}.localAccount`;
/** The document store, read-only here, used only to recover a pre-existing owner. */
const DATABASE_KEY = `${STORAGE_PREFIX}.db`;

/** Tables whose rows carry a `user_id`, in rough order of "how much work this is". */
const OWNED_TABLES = [
  'user_subjects',
  'user_chapters',
  'user_topics',
  'study_sessions',
  'study_tasks',
  'notes',
  'revision_sessions',
  'chapter_checklist_progress',
] as const;

interface StoredAccount {
  user: AuthUser;
  createdAt: string;
  /** Set when the id was recovered from the existing database rather than minted. */
  recoveredFrom?: 'account-record' | 'database';
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

  private readAccount(): StoredAccount | null {
    try {
      const raw = this.storage.getItem(ACCOUNT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredAccount>;
      const user = toUser(parsed.user);
      if (!user) return null;
      return {
        user,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
        ...(parsed.recoveredFrom ? { recoveredFrom: parsed.recoveredFrom } : {}),
      };
    } catch {
      return null;
    }
  }

  private writeAccount(account: StoredAccount | null): void {
    if (account) this.storage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else this.storage.removeItem(ACCOUNT_KEY);
  }

  /**
   * Find the owner of study records that already exist on this device.
   *
   * This is the upgrade path for a device that ran a build from before the
   * account record existed (including one that already hit the orphan bug). If
   * the store names exactly one owner, that is unambiguously the workspace. If
   * it names several, the one holding the most records is adopted — the others
   * are left untouched, never merged, and never deleted.
   */
  private recoverOwnerFromDatabase(): string | null {
    try {
      const raw = this.storage.getItem(DATABASE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { tables?: Record<string, unknown> };
      const tables = parsed?.tables;
      if (!tables || typeof tables !== 'object') return null;

      const counts = new Map<string, number>();
      for (const table of OWNED_TABLES) {
        const rows = tables[table];
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const id = (row as { user_id?: unknown })?.user_id;
          if (typeof id === 'string' && id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      if (counts.size === 0) return null;
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id]) => id)[0]!;
    } catch {
      return null;
    }
  }

  /** True when this device already holds a workspace that can be reopened. */
  async hasLocalAccount(): Promise<boolean> {
    if (this.readAccount()) return true;
    return this.recoverOwnerFromDatabase() !== null;
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

  async startLocalWorkspace(displayName = ''): Promise<AuthUser> {
    /*
     * An empty name means "reopen what is here". On resume the stored name must
     * win: defaulting to the literal "Student" would quietly rename a student
     * who had set their own name, every time they signed back in.
     */
    const requestedName = displayName.trim();
    const trimmed = requestedName || 'Student';

    // Already signed in: the workspace is simply resumed.
    const existing = this.readSession();
    if (existing) return existing;

    // Signed out, but this device already owns a workspace: reopen *that* one.
    const account = this.readAccount();
    if (account) {
      const user: AuthUser = { ...account.user, displayName: requestedName || account.user.displayName };
      this.writeAccount({ ...account, user });
      this.writeSession(user);
      return user;
    }

    // Older build: no account record, but study rows identify their owner.
    const recoveredId = this.recoverOwnerFromDatabase();
    if (recoveredId) {
      const user: AuthUser = { id: recoveredId, email: 'local@this-device', displayName: trimmed };
      this.writeAccount({ user, createdAt: new Date().toISOString(), recoveredFrom: 'database' });
      this.writeSession(user);
      return user;
    }

    // Genuinely first run on this device.
    const user: AuthUser = { id: randomId(), email: 'local@this-device', displayName: trimmed };
    this.writeAccount({ user, createdAt: new Date().toISOString() });
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
    /*
     * Only the session is cleared. The account record and every study row stay,
     * so signing back in reopens the same workspace instead of a blank one.
     * Erasing data is a separate, explicit action (Settings → Delete all records).
     */
    this.writeSession(null);
  }

  async sendPasswordReset(): Promise<void> {
    throw new AuthError(
      'This device workspace has no password. A password reset applies to cloud accounts only.',
      'not_supported',
    );
  }

  async updatePassword(): Promise<void> {
    throw new AuthError(
      'This device workspace has no password. A password reset applies to cloud accounts only.',
      'not_supported',
    );
  }

  onChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
