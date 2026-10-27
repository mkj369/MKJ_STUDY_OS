// Global test setup: keep time-dependent tests deterministic by never relying on
// the real clock — every domain function takes an explicit `today`/`now`.

if (typeof globalThis.crypto === 'undefined') {
  // Node 20+ exposes WebCrypto; this is only a guard for unusual runners.
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    },
  });
}
