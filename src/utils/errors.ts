import { AuthError } from '@/services/auth/types';
import { RepositoryError } from '@/services/repository';

export function errorMessage(error: unknown): string {
  if (error instanceof AuthError || error instanceof RepositoryError) return error.message;
  if (error instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return 'Network request failed. Check your connection and try again.';
    }
    return error.message;
  }
  if (typeof error === 'string') return error;
  return 'Something went wrong. Please try again.';
}

export function isPermissionError(error: unknown): boolean {
  return error instanceof RepositoryError && (error.code === 'forbidden' || error.code === '42501');
}

/** Convert an empty form string to `null` for nullable database columns. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function emptyToUndefined(value: string | null | undefined): string | undefined {
  return emptyToNull(value) ?? undefined;
}

export function toIsoOrNull(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
