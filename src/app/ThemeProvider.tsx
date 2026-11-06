/**
 * Theme control: follow the system by default, with an explicit light/dark
 * pin stored per device (and per account when signed in, via user_preferences).
 * The CSS side lives in theme.css (`:root[data-theme=…]`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STORAGE_PREFIX } from '@/services/local/storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = `${STORAGE_PREFIX}.theme`;

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  /** What the user actually sees right now. */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

function readStoredTheme(): ThemeChoice {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage unavailable — fall through
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function applyThemeAttribute(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // Ionic's own components read this class for their dark palette.
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.classList.toggle('ion-palette-dark', dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme, systemDark]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    try {
      globalThis.localStorage?.setItem(THEME_KEY, next);
    } catch {
      // in-memory only
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolved: theme === 'system' ? (systemDark ? 'dark' : 'light') : theme }),
    [theme, setTheme, systemDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
