import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STORAGE_PREFIX } from '@/services/local/storage';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useRepositoryOptional } from '@/app/AppProviders';
import { useWorkspaceQuery, workspaceQueryKey } from '@/hooks/useWorkspace';
import {
  DEFAULT_THEME,
  normaliseTheme,
  resolveMode,
  themeVariables,
  type ThemePreference,
} from '@/domain/theme';
import type { Profile } from '@/types/domain';

/**
 * Applies the student's appearance to the whole document.
 *
 * Order of authority:
 *   1. The profile row (survives reinstalls, follows the student in cloud mode).
 *   2. A per-user cache in storage, read synchronously so the first paint is not
 *      the wrong colour while the profile loads.
 *
 * The cache key includes the user id, so one student's Rose Pink never bleeds
 * into another student's workspace on a shared device.
 */

function cacheKey(userId: string | null): string {
  return `${STORAGE_PREFIX}.theme.${userId ?? 'anon'}`;
}

function readCache(userId: string | null): ThemePreference | null {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(userId));
    if (!raw) return null;
    return normaliseTheme(JSON.parse(raw) as Partial<ThemePreference>);
  } catch {
    return null;
  }
}

function writeCache(userId: string | null, theme: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(cacheKey(userId), JSON.stringify(theme));
  } catch {
    // A blocked storage quota must never stop the app from rendering.
  }
}

export function themeFromProfile(profile: Pick<Profile, 'theme_mode' | 'theme_preset' | 'theme_accent'> | null): ThemePreference {
  return normaliseTheme({
    mode: profile?.theme_mode,
    preset: profile?.theme_preset,
    accent: profile?.theme_accent,
  });
}

interface ThemeContextValue {
  theme: ThemePreference;
  /** What is actually painted right now, after resolving "system". */
  resolvedMode: 'light' | 'dark';
  setTheme: (next: ThemePreference) => Promise<void>;
  resetTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedMode: 'light',
  setTheme: async () => undefined,
  resetTheme: async () => undefined,
});

/**
 * Writes the tokens onto <html>. Kept as one imperative function so every entry
 * point (initial paint, live change, system change) goes through identical code.
 */
function applyTheme(preference: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  const root = document.documentElement;
  const mode = resolveMode(preference.mode, systemPrefersDark);

  root.dataset.theme = mode;
  root.dataset.preset = preference.preset;
  root.style.colorScheme = mode;

  for (const [property, value] of Object.entries(themeVariables(preference, mode))) {
    root.style.setProperty(property, value);
  }
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;

  // Start from the cache so the first frame is already the right colour.
  const [theme, setThemeState] = useState<ThemePreference>(() => readCache(userId) ?? DEFAULT_THEME);
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>('light');

  // The profile is authoritative once it arrives.
  const { data } = useWorkspaceQuery();
  const repository = useRepositoryOptional();
  const queryClient = useQueryClient();
  const profile = data?.bundle.profile ?? null;

  useEffect(() => {
    if (!profile) return;
    const fromProfile = themeFromProfile(profile);
    setThemeState((current) =>
      // Ignore the profile echo of our own optimistic write.
      current.mode === fromProfile.mode && current.preset === fromProfile.preset && current.accent === fromProfile.accent
        ? current
        : fromProfile,
    );
  }, [profile]);

  // Re-read the cache when the signed-in student changes.
  useEffect(() => {
    const cached = readCache(userId);
    if (cached) setThemeState(cached);
  }, [userId]);

  useEffect(() => {
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const paint = () => setResolvedMode(applyTheme(theme, media?.matches ?? false));
    paint();
    writeCache(userId, theme);
    if (!media?.addEventListener) return;
    // System mode has to repaint when the OS flips, without a page reload.
    media.addEventListener('change', paint);
    return () => media.removeEventListener('change', paint);
  }, [theme, userId]);

  const setTheme = useCallback(
    async (next: ThemePreference) => {
      const normalised = normaliseTheme(next);
      // Optimistic: the student sees the colour immediately, the write follows.
      setThemeState(normalised);
      writeCache(userId, normalised);
      if (!repository) return;
      try {
        await repository.updateProfile({
          theme_mode: normalised.mode,
          theme_preset: normalised.preset,
          theme_accent: normalised.accent,
        });
        await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(auth.mode, userId ?? 'anonymous') });
      } catch {
        // Keep the local choice; the next successful save will sync it.
      }
    },
    [repository, queryClient, auth.mode, userId],
  );

  const resetTheme = useCallback(async () => {
    await setTheme(DEFAULT_THEME);
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedMode, setTheme, resetTheme }),
    [theme, resolvedMode, setTheme, resetTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
