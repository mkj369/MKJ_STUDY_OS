import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppServices, type AppServices } from '@/app/services';
import type { AuthUser, SignUpResult } from '@/services/auth/types';
import { AuthError } from '@/services/auth/types';
import type { Repository } from '@/services/repository';
import { I18nProvider } from '@/i18n';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mode: AppServices['config']['mode'];
  localReason: string | null;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  startLocalWorkspace(displayName: string): Promise<AuthUser>;
  sendPasswordReset(email: string): Promise<void>;
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

export function AppProviders({ children, services, queryClient }: AppProvidersProps) {
  const appServices = useMemo(() => services ?? createAppServices(), [services]);
  const client = useMemo(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 20_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: 0 },
        },
      }),
    [queryClient],
  );

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

  const startLocalWorkspace = useCallback(
    async (displayName: string) => {
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

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mode: appServices.config.mode,
      localReason: appServices.config.localReason,
      signIn,
      signUp,
      signOut,
      startLocalWorkspace,
      sendPasswordReset,
    }),
    [user, loading, appServices.config, signIn, signUp, signOut, startLocalWorkspace, sendPasswordReset],
  );

  return (
    <ServicesContext.Provider value={appServices}>
      <QueryClientProvider client={client}>
        <I18nProvider>
          <AuthContext.Provider value={authValue}>
            <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>
          </AuthContext.Provider>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>
  );
}
