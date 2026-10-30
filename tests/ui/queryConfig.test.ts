import { describe, expect, it } from 'vitest';
import { createAppQueryClient } from '@/app/AppProviders';

/**
 * A regression guard for the one setting that decides whether the app works in
 * airplane mode. TanStack Query pauses queries and queues mutations when
 * `navigator.onLine` is false unless `networkMode` is `always`; with the default,
 * a student on a train watches their newly added chapter disappear.
 */
describe('query defaults', () => {
  it('never pauses reads or writes because the device is offline', () => {
    const defaults = createAppQueryClient().getDefaultOptions();
    expect(defaults.queries?.networkMode).toBe('always');
    expect(defaults.mutations?.networkMode).toBe('always');
  });

  it('keeps a stale window so tab switches do not refetch everything', () => {
    const defaults = createAppQueryClient().getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(20_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    // A failed local read should be retried once, not hammered.
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.mutations?.retry).toBe(0);
  });
});
