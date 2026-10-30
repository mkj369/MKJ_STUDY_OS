/**
 * Release constants and feature gates.
 *
 * One module so the version string, the store identity and the demo gate cannot
 * drift apart. Everything here is compile-time constant except
 * `demoFixturesEnabled()`, which reads the build flag.
 */

/** Kept in sync with package.json by `tests/release/version.test.ts`. */
export const APP_VERSION = __APP_VERSION__;
export const APP_ID = 'com.mkjstudyos.app';
export const APP_NAME = 'MKJ StudyOS';
export const CONTACT_EMAIL = 'minhajkhanjihan.mkj@gmail.com';

/**
 * Demo data is a development and test fixture, not a product feature.
 *
 * `VITE_DEMO_FIXTURES` is baked in at build time:
 *   * unset          → on in `vite dev`, off in a production build;
 *   * 'true'         → on (the Playwright suite builds with this so its
 *                      fixtures keep working);
 *   * 'false'        → off even in dev.
 *
 * A store build must never ship with it on: a new install has to open empty.
 */
export function demoFixturesEnabled(
  flag: string | undefined = import.meta.env.VITE_DEMO_FIXTURES,
  isDev: boolean = Boolean(import.meta.env.DEV),
): boolean {
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return isDev;
}
