import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_ID, APP_NAME, APP_VERSION, CONTACT_EMAIL, demoFixturesEnabled } from '@/config/release';

/**
 * Release metadata has to agree in three places that fail silently when they
 * drift: package.json, the injected build constant and the Android project.
 */
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string };
const gradle = readFileSync(resolve('android/app/build.gradle'), 'utf8');

describe('release metadata', () => {
  it('reports the package version at runtime', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the Android version name in step with package.json', () => {
    const match = gradle.match(/versionName\s+"([^"]+)"/);
    expect(match?.[1]).toBe(pkg.version);
  });

  it('uses a stable application id and product name', () => {
    expect(APP_ID).toBe('com.mkjstudyos.app');
    expect(APP_NAME).toBe('MKJ StudyOS');
    expect(gradle).toContain(`applicationId "${APP_ID}"`);
    expect(CONTACT_EMAIL).toBe('minhajkhanjihan.mkj@gmail.com');
  });

  it('releases without release signing material in the repository', () => {
    // The keystore is supplied by android/keystore.properties or env vars; it
    // must never be committed, and the build must not embed a password.
    const gitignore = readFileSync(resolve('.gitignore'), 'utf8');
    expect(gitignore).toMatch(/android\/keystore\.properties/);
    expect(gradle).toContain('MKJ_KEYSTORE_FILE');
    expect(gradle).not.toMatch(/storePassword\s+"[^"]+"/);
  });
});

describe('demo fixture gate', () => {
  it('is off for a production build unless explicitly enabled', () => {
    expect(demoFixturesEnabled(undefined, false)).toBe(false);
    expect(demoFixturesEnabled('false', false)).toBe(false);
    expect(demoFixturesEnabled('false', true)).toBe(false);
  });

  it('is on in development, or when the build asks for fixtures', () => {
    expect(demoFixturesEnabled(undefined, true)).toBe(true);
    expect(demoFixturesEnabled('true', false)).toBe(true);
  });
});
