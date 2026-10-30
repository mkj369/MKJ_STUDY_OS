import { STORAGE_PREFIX } from '@/services/local/storage';

/**
 * Class and group chosen on the sign-up form.
 *
 * The profile row can only be written once the session exists (and, with email
 * confirmation, that can be minutes later on another device). The choice is kept
 * in device storage until onboarding consumes it, then removed. It is a
 * preference, never a credential.
 */
const KEY = `${STORAGE_PREFIX}.pending-profile`;

export interface PendingProfile {
  classLevel: number;
  group: string | null;
}

export function savePendingProfile(profile: PendingProfile): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable: onboarding will simply ask again.
  }
}

/** Read and clear in one step, so the choice is applied at most once. */
export function takePendingProfile(): PendingProfile | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    globalThis.localStorage?.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<PendingProfile>;
    if (typeof parsed.classLevel !== 'number' || parsed.classLevel < 1 || parsed.classLevel > 12) return null;
    return { classLevel: parsed.classLevel, group: typeof parsed.group === 'string' ? parsed.group : null };
  } catch {
    return null;
  }
}

export function clearPendingProfile(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // ignore
  }
}
