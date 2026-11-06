/**
 * Applies the account's saved theme once per sign-in when this device has no
 * explicit choice yet. A device-level pin always wins (it is more recent and
 * more local); saving a new choice writes both places (see Settings).
 */
import { useEffect, useRef } from 'react';
import { useTheme } from '@/app/ThemeProvider';
import { useWorkspaceBundle } from '@/hooks/useWorkspace';
import { STORAGE_PREFIX } from '@/services/local/storage';

export function useAccountThemeSync(): void {
  const bundle = useWorkspaceBundle();
  const { setTheme } = useTheme();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !bundle) return;
    applied.current = true;
    try {
      const stored = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}.theme`);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return;
    } catch {
      return;
    }
    const preferred = bundle.userPreferences.theme;
    if (preferred !== 'system') setTheme(preferred);
  }, [bundle, setTheme]);
}
