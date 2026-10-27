import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Native configuration guard.
 *
 * These checks run without a JDK or Android SDK, so CI can catch the mistakes that
 * otherwise only appear when someone with Android Studio tries to build:
 * a mismatched package id, a missing notification icon, a permission the reminder
 * feature needs, or an SDK level too low for the target plugin version.
 *
 * It does **not** prove the APK compiles — that still needs `./gradlew assembleDebug`
 * on a machine with the Android SDK (see README).
 */

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8');

const capacitorConfig = read('capacitor.config.ts');
const appGradle = read('android/app/build.gradle');
const variablesGradle = read('android/variables.gradle');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const strings = read('android/app/src/main/res/values/strings.xml');
const wrapper = read('android/gradle/wrapper/gradle-wrapper.properties');
const pkg = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

function match(source: string, regex: RegExp, label: string): string {
  const found = source.match(regex)?.[1];
  if (!found) throw new Error(`Could not find ${label}`);
  return found;
}

describe('Capacitor ↔ Android project', () => {
  const appId = match(capacitorConfig, /appId:\s*'([^']+)'/, 'appId');

  it('uses the same package id in the config, Gradle and resources', () => {
    expect(match(appGradle, /applicationId\s+"([^"]+)"/, 'applicationId')).toBe(appId);
    expect(match(appGradle, /namespace\s+"([^"]+)"/, 'namespace')).toBe(appId);
    expect(match(strings, /<string name="package_name">([^<]+)</, 'package_name')).toBe(appId);
  });

  it('uses the same app name in the config and the launcher label', () => {
    expect(match(strings, /<string name="app_name">([^<]+)</, 'app_name')).toBe(
      match(capacitorConfig, /appName:\s*'([^']+)'/, 'appName'),
    );
  });

  it('points the web assets at the Vite build output', () => {
    expect(capacitorConfig).toContain("webDir: 'dist'");
    expect(pkg.scripts['android:sync']).toContain('cap sync android');
  });

  it('targets an SDK level the notification plugin supports', () => {
    const compile = Number(match(variablesGradle, /compileSdkVersion\s*=\s*(\d+)/, 'compileSdkVersion'));
    const target = Number(match(variablesGradle, /targetSdkVersion\s*=\s*(\d+)/, 'targetSdkVersion'));
    const min = Number(match(variablesGradle, /minSdkVersion\s*=\s*(\d+)/, 'minSdkVersion'));
    expect(compile).toBeGreaterThanOrEqual(34);
    expect(target).toBeGreaterThanOrEqual(34);
    expect(min).toBeGreaterThanOrEqual(23);
  });

  it('ships the reminder icon referenced by the config', () => {
    const icon = match(capacitorConfig, /smallIcon:\s*'([^']+)'/, 'smallIcon');
    const drawable = `android/app/src/main/res/drawable/${icon}.xml`;
    expect(existsSync(join(ROOT, drawable)), `${drawable} must exist`).toBe(true);
    // Status-bar icons are rendered as an alpha mask, so they must be a vector.
    expect(read(drawable)).toContain('<vector');
  });

  it('keeps the permissions the reminder feature depends on', () => {
    // INTERNET is required for cloud mode (Supabase auth + data).
    expect(manifest).toContain('android.permission.INTERNET');
    // The notifications plugin ships its own permissions; assert the plugin is present
    // and declares what the Android 13+ runtime permission flow needs.
    expect(pkg.dependencies['@capacitor/local-notifications']).toBeTruthy();
    const pluginManifest = 'node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml';
    if (existsSync(join(ROOT, pluginManifest))) {
      const plugin = read(pluginManifest);
      expect(plugin).toContain('android.permission.POST_NOTIFICATIONS');
      expect(plugin).toContain('android.permission.RECEIVE_BOOT_COMPLETED');
    }
  });

  it('keeps the Android test stubs on the real package name', () => {
    // The Capacitor template ships "com.getcapacitor.myapp"/"com.getcapacitor.app",
    // which makes `./gradlew test` fail on a renamed app.
    for (const relative of [
      'android/app/src/test/java/com/mkjstudyos/app/ExampleUnitTest.java',
      'android/app/src/androidTest/java/com/mkjstudyos/app/ExampleInstrumentedTest.java',
    ]) {
      expect(existsSync(join(ROOT, relative)), relative).toBe(true);
      const source = read(relative);
      expect(source).toContain('package com.mkjstudyos.app;');
      expect(source).not.toContain('com.getcapacitor');
    }
  });

  it('pins the Gradle wrapper instead of relying on a system install', () => {
    expect(wrapper).toMatch(/distributionUrl=.*gradle-\d+\.\d+/);
    expect(existsSync(join(ROOT, 'android/gradlew'))).toBe(true);
  });
});
