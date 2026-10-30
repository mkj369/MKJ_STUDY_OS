import { describe, expect, it } from 'vitest';
import { mapAuthError } from '@/services/auth/supabaseAuth';

/**
 * Auth errors are read by a person, so they are tested as sentences.
 *
 * The Google cases matter most: a cloud project without the provider enabled is
 * the normal starting state, and the earlier build surfaced the raw provider
 * string — or nothing at all — which reads as a broken button.
 */
describe('mapAuthError', () => {
  it('explains an unenabled Google provider instead of failing silently', () => {
    const error = mapAuthError('Provider is not enabled');
    expect(error.code).toBe('provider_not_enabled');
    expect(error.message).toMatch(/local workspace/i);
    expect(error.message).toMatch(/email/i);
  });

  it('explains a redirect mismatch with the exact setting to change', () => {
    const error = mapAuthError('redirect_uri_mismatch');
    expect(error.code).toBe('redirect_mismatch');
    expect(error.message).toMatch(/redirect URL/i);
  });

  it('keeps the common sign-in failures plain', () => {
    expect(mapAuthError('Invalid login credentials').code).toBe('invalid_credentials');
    expect(mapAuthError('Email not confirmed').code).toBe('email_unconfirmed');
    expect(mapAuthError('User already registered').code).toBe('already_registered');
    expect(mapAuthError('Password should be at least 6 characters').code).toBe('weak_password');
  });

  it('never leaks raw provider text into the message', () => {
    const error = mapAuthError('unsupported provider "google"');
    expect(error.message).not.toContain('unsupported provider');
  });
});
