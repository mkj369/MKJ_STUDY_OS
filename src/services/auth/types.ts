export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export type AuthMode = 'cloud' | 'local';

export interface SignUpResult {
  user: AuthUser | null;
  needsEmailConfirmation: boolean;
  message?: string;
}

export interface AuthClient {
  readonly mode: AuthMode;
  getSession(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  /**
   * Google OAuth (cloud mode only). This redirects the browser, so it resolves
   * only if the redirect never happens; failures throw before leaving the page.
   */
  signInWithGoogle?(): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /**
   * Finish a reset: set a new password for the session created by the recovery
   * link. Cloud only — the local workspace has no password to reset.
   */
  updatePassword?(password: string): Promise<void>;
  /** Subscribe to auth changes; returns an unsubscribe function. */
  onChange(callback: (user: AuthUser | null) => void): () => void;
  /** Local mode only: create a device-local workspace without an account. */
  startLocalWorkspace?(displayName?: string): Promise<AuthUser>;
  /**
   * Local mode only: is there already a workspace on this device that
   * "Start on this device" would reopen? Used to warn the student before they
   * disconnect, and to label the button honestly.
   */
  hasLocalAccount?(): Promise<boolean>;
  /** Permanently delete the cloud account and its records (server-side). */
  deleteAccount?(): Promise<void>;
}

export class AuthError extends Error {
  readonly code: string;
  constructor(message: string, code = 'auth_error') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}
