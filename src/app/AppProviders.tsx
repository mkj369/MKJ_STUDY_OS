import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppServices, type AppServices } from '@/app/services';
import type { AuthUser, SignUpResult } from '@/services/auth/types';
import { AuthError } from '@/services/auth/types';
import type { Repository } from '@/services/repository';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/app/ThemeProvider';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mode: AppServices['config']['mode'];
  localReason: string | null;
  signIn(email: string, password: string): Promise<AuthUser>;
  /** True when this build talks to a cloud auth provider (Google is offered). */
  googleAvailable: boolean;
  signInWithGoogle(): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  startLocalWorkspace(displayName?: string): Promise<AuthUser>;
  /** True when this device already holds a workspace that would be reopened. */
  hasLocalWorkspace: boolean;
  sendPasswordReset(email: string): Promise<void>;
  /** Finish a password reset (cloud only); no-op error in local mode. */
  updatePassword(password: string): Promise<void>;
}

const ServicesContext = createContext<AppServices | null>(null);
const AuthContext = createContext<AuthContextValue | null>(null);
const RepositoryContext = createContext<Repository | null>(null);

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <AppProviders>');
  return ctx;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AppProviders>');
  return ctx;
}

/** Repository is only available after sign-in. */
export function useRepository(): Repository {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('No active session: this screen must be behind the auth gate.');
  return ctx;
}

export function useRepositoryOptional(): Repository | null {
  return useContext(RepositoryContext);
}

export interface AppProvidersProps {
  children: ReactNode;
  /** Test seam: inject services instead of building them from env. */
  services?: AppServices;
  queryClient?: QueryClient;
}

/**
 * Query defaults for a local-first app.
 *
 * `networkMode: 'always'`, not TanStack's default `'online'`: the device
 * workspace reads and writes the phone's storage, not a server. With the
 * default, a phone in airplane mode has its queries paused and its mutations
 * queued, so a saved chapter looks as if it vanished until the network comes
 * back — the worst possible behaviour for a study app on a train. Cloud mode
 * surfaces its own network errors instead of pretending to be offline.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: 1,
        staleTime: 20_000,
        refetchOnWindowFocus: false,
      },
      mutations: { networkMode: 'always', retry: 0 },
    },
  });
}

export function AppProviders({ children, services, queryClient }: AppProvidersProps) {
  const appServices = useMemo(() => services ?? createAppServices(), [services]);
  const client = useMemo(() => queryClient ?? createAppQueryClient(), [queryClient]);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = appServices.auth.onChange((next) => {
      if (mounted.current) setUser(next);
    });
    appServices.auth
      .getSession()
      .then((session) => {
        if (mounted.current) setUser(session);
      })
      .catch(() => {
        if (mounted.current) setUser(null);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [appServices]);

  const repository = useMemo<Repository | null>(
    () => (user ? appServices.createRepository(user.id) : null),
    [appServices, user],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const signedIn = await appServices.auth.signIn(email, password);
      setUser(signedIn);
      return signedIn;
    },
    [appServices],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await appServices.auth.signUp(email, password, displayName);
      if (result.user && !result.needsEmailConfirmation) setUser(result.user);
      return result;
    },
    [appServices],
  );

  const signOut = useCallback(async () => {
    await appServices.auth.signOut();
    client.clear();
    setUser(null);
  }, [appServices, client]);

  const signInWithGoogle = useCallback(async () => {
    if (!appServices.auth.signInWithGoogle) {
      throw new AuthError(
        'Google sign-in needs cloud authentication. This build runs in local mode — add Supabase credentials in .env.local to enable accounts.',
        'provider_not_configured',
      );
    }
    await appServices.auth.signInWithGoogle();
  }, [appServices]);

  /*
   * Whether "Start on this device" would reopen existing work. Read once the
   * provider mounts (and whenever the user changes) so the welcome screen can
   * say so instead of looking like a fresh install.
   */
  const [hasLocalWorkspace, setHasLocalWorkspace] = useState(false);
  useEffect(() => {
    const probe = appServices.auth.hasLocalAccount;
    if (!probe) {
      setHasLocalWorkspace(false);
      return;
    }
    let cancelled = false;
    void probe
      .call(appServices.auth)
      .then((value) => {
        if (!cancelled) setHasLocalWorkspace(Boolean(value));
      })
      .catch(() => {
        if (!cancelled) setHasLocalWorkspace(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appServices, user]);

  const startLocalWorkspace = useCallback(
    async (displayName = '') => {
      if (!appServices.auth.startLocalWorkspace) {
        throw new AuthError('This build has no local workspace support.', 'not_supported');
      }
      const localUser = await appServices.auth.startLocalWorkspace(displayName);
      setUser(localUser);
      return localUser;
    },
    [appServices],
  );

  const sendPasswordReset = useCallback(
    async (email: string) => {
      await appServices.auth.sendPasswordReset(email);
    },
    [appServices],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!appServices.auth.updatePassword) {
        throw new AuthError('Password reset is not available in this build.', 'not_supported');
      }
      await appServices.auth.updatePassword(password);
    },
    [appServices],
  );

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mode: appServices.config.mode,
      localReason: appServices.config.localReason,
      signIn,
      googleAvailable: appServices.config.mode === 'cloud',
      signInWithGoogle,
      signUp,
      signOut,
      startLocalWorkspace,
      hasLocalWorkspace,
      sendPasswordReset,
      updatePassword,
    }),
    [
      user,
      loading,
      appServices.config,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      startLocalWorkspace,
      hasLocalWorkspace,
      sendPasswordReset,
      updatePassword,
    ],
  );

  return (
    <ServicesContext.Provider value={appServices}>
      <QueryClientProvider client={client}>
        <I18nProvider>
          <AuthContext.Provider value={authValue}>
            <RepositoryContext.Provider value={repository}>
              <ThemeProvider>{children}</ThemeProvider>
            </RepositoryContext.Provider>
          </AuthContext.Provider>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>
  );
}
