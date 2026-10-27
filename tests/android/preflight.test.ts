import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkAndroidSdk,
  checkGradleWrapper,
  checkJava,
  checkNode,
  checkWebAssets,
  compareVersions,
  parseJavaMajorVersion,
  runPreflight,
} from '../../scripts/android-preflight.mjs';

/**
 * The preflight script is the first thing a student runs on their own machine,
 * so its judgement has to be right: a false PASS wastes an hour, a false FAIL
 * sends them installing something they already have.
 */

const sandboxes: string[] = [];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'mkj-preflight-'));
  sandboxes.push(dir);
  return dir;
}

function touch(path: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '');
}

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

describe('java version parsing', () => {
  it('reads the major version from the forms real JDKs print', () => {
    expect(parseJavaMajorVersion('openjdk version "17.0.12" 2024-07-16')).toBe(17);
    expect(parseJavaMajorVersion('openjdk version "21.0.2" 2024-01-16\nOpenJDK Runtime Environment')).toBe(21);
    expect(parseJavaMajorVersion('java version "17"')).toBe(17);
    expect(parseJavaMajorVersion('openjdk version "23-ea"')).toBe(23);
  });

  it('normalises the legacy 1.x numbering to a real major version', () => {
    expect(parseJavaMajorVersion('java version "1.8.0_392"')).toBe(8);
    expect(parseJavaMajorVersion('java version "1.7.0_80"')).toBe(7);
  });

  it('returns null for junk instead of guessing', () => {
    expect(parseJavaMajorVersion('')).toBeNull();
    expect(parseJavaMajorVersion('/bin/sh: java: command not found')).toBeNull();
    expect(parseJavaMajorVersion('Picked up JAVA_TOOL_OPTIONS')).toBeNull();
  });
});

describe('version comparison', () => {
  it('orders build-tools versions numerically, not alphabetically', () => {
    expect(compareVersions('35.0.0', '34.0.1')).toBe(1);
    expect(compareVersions('34.0.1', '34.0.10')).toBe(-1);
    expect(compareVersions('34.0.0', '34.0.0')).toBe(0);
    expect(compareVersions('35', '35.0.0')).toBe(0);
  });
});

describe('node check', () => {
  it('accepts the engine floor and rejects older releases', () => {
    expect(checkNode('20.19.0').status).toBe('pass');
    expect(checkNode('22.1.0').status).toBe('pass');
    expect(checkNode('20.18.0').status).toBe('fail');
    expect(checkNode('18.20.4').status).toBe('fail');
  });
});

describe('java check', () => {
  it('passes on JDK 17 and 21', () => {
    expect(checkJava({ versionOutput: 'openjdk version "17.0.12"' }).status).toBe('pass');
    expect(checkJava({ versionOutput: 'openjdk version "21"' }).status).toBe('pass');
  });

  it('fails on JDK 11 with a remedy that names the minimum', () => {
    const result = checkJava({ versionOutput: 'openjdk version "11.0.20"' });
    expect(result.status).toBe('fail');
    expect(result.remedy).toMatch(/JDK 17/);
  });

  it('fails when java is missing entirely and still gives a fix', () => {
    const result = checkJava({ versionOutput: null });
    expect(result.status).toBe('fail');
    expect(result.found).toMatch(/not found/i);
    expect(result.remedy).toMatch(/JAVA_HOME|Temurin|Android Studio/);
  });
});

describe('android sdk check', () => {
  it('passes on a complete SDK and reports where it looked', () => {
    const root = sandbox();
    mkdirSync(join(root, 'platforms', 'android-35'), { recursive: true });
    mkdirSync(join(root, 'build-tools', '35.0.0'), { recursive: true });
    mkdirSync(join(root, 'platform-tools'), { recursive: true });

    const result = checkAndroidSdk({ env: { ANDROID_HOME: root } });
    expect(result.status).toBe('pass');
    expect(result.found).toContain(root);
    expect(result.remedy).toBeNull();
  });

  it('fails when platform 35 is missing and names the sdkmanager packages', () => {
    const root = sandbox();
    mkdirSync(join(root, 'platforms', 'android-34'), { recursive: true });
    mkdirSync(join(root, 'build-tools', '34.0.0'), { recursive: true });
    mkdirSync(join(root, 'platform-tools'), { recursive: true });

    const result = checkAndroidSdk({ env: { ANDROID_HOME: root } });
    expect(result.status).toBe('fail');
    expect(result.remedy).toContain('platforms;android-35');
  });

  it('fails when ANDROID_HOME points at a folder without an SDK', () => {
    const root = sandbox();
    const result = checkAndroidSdk({ env: { ANDROID_HOME: root } as Record<string, string> });
    expect(result.status).toBe('fail');
    expect(result.remedy).toMatch(/ANDROID_HOME/);
  });

  it('honours ANDROID_SDK_ROOT as well as ANDROID_HOME', () => {
    const root = sandbox();
    mkdirSync(join(root, 'platforms', 'android-35'), { recursive: true });
    mkdirSync(join(root, 'build-tools', '35.0.0'), { recursive: true });
    mkdirSync(join(root, 'platform-tools'), { recursive: true });

    expect(checkAndroidSdk({ env: { ANDROID_SDK_ROOT: root } }).status).toBe('pass');
  });
});

describe('wrapper and synced assets', () => {
  it('finds the committed Gradle wrapper in this repository', () => {
    expect(checkGradleWrapper().status).toBe('pass');
  });

  it('fails when the web assets were never synced', () => {
    const dir = sandbox();
    const result = checkWebAssets({ dir });
    expect(result.status).toBe('fail');
    expect(result.remedy).toContain('npm run android:sync');
  });

  it('passes when dist has been copied into android/', () => {
    const dir = sandbox();
    touch(join(dir, 'app', 'src', 'main', 'assets', 'public', 'index.html'));
    touch(join(dir, 'app', 'src', 'main', 'assets', 'public', 'assets', 'index-abc.js'));
    expect(checkWebAssets({ dir }).status).toBe('pass');
  });
});

describe('the report itself', () => {
  it('is stable: five unique checks with a status and a reason', () => {
    const checks = runPreflight();
    expect(checks).toHaveLength(5);
    expect(new Set(checks.map((check) => check.id)).size).toBe(5);
    for (const check of checks) {
      expect(['pass', 'fail', 'warn']).toContain(check.status);
      expect(check.found.length).toBeGreaterThan(0);
      // Every failure must tell the student what to do next.
      if (check.status === 'fail') expect(check.remedy).toBeTruthy();
    }
  });
});
