#!/usr/bin/env node
/**
 * Android build preflight.
 *
 * Answers one question before you spend ten minutes downloading Gradle:
 * "is this machine able to build the APK right now?" It checks the toolchain
 * the project actually needs (JDK 17, Android SDK platform 35, the Gradle
 * wrapper, and the synced web assets) and prints the exact remedy for anything
 * missing.
 *
 * Usage:
 *   node scripts/android-preflight.mjs          # human-readable report
 *   node scripts/android-preflight.mjs --json   # machine-readable report
 *
 * Exit codes: 0 = ready to build, 2 = something is missing.
 *
 * This script never downloads anything and never edits your environment.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = join(ROOT, 'android');

/** Minimum versions this project needs (see android/variables.gradle, wrapper). */
export const MIN_JDK = 17;
export const COMPILE_SDK = 35;
export const MIN_NODE = [20, 19];

/**
 * Read the major version out of `java -version` output.
 * Handles `openjdk version "17.0.12"`, `java version "1.8.0_392"` (→ 8) and
 * the single-component `java version "17"` form. Returns null when unparseable.
 */
export function parseJavaMajorVersion(output) {
  if (typeof output !== 'string') return null;
  const match = output.match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  const first = Number(match[1]);
  if (first === 1 && match[2]) return Number(match[2]);
  return Number.isFinite(first) ? first : null;
}

/** Compare dotted version strings numerically (e.g. `35.0.0` vs `34.0.1`). */
export function compareVersions(a, b) {
  const left = String(a).split('.').map((part) => Number(part.replace(/\D.*$/, '')) || 0);
  const right = String(b).split('.').map((part) => Number(part.replace(/\D.*$/, '')) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    // Many tools (java) print their version to stderr and exit non-zero on -version.
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    return (stderr || stdout).trim() || null;
  }
}

function directories(path) {
  try {
    return readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory());
  } catch {
    return [];
  }
}

export function checkNode(version = process.versions.node) {
  const current = version.split('.').map(Number);
  const ok =
    current[0] > MIN_NODE[0] || (current[0] === MIN_NODE[0] && current[1] >= MIN_NODE[1]);
  return {
    id: 'node',
    label: `Node.js ≥ ${MIN_NODE.join('.')}`,
    status: ok ? 'pass' : 'fail',
    found: `v${version}`,
    remedy: ok ? null : `Install Node 20.19 or newer (https://nodejs.org), then re-run.`,
  };
}

export function checkJava({ javaHome = process.env.JAVA_HOME, versionOutput } = {}) {
  const output = versionOutput ?? run('java', ['-version']);
  const major = parseJavaMajorVersion(output ?? '');
  if (major === null) {
    return {
      id: 'java',
      label: `JDK ${MIN_JDK}+`,
      status: 'fail',
      found: output ? output.split('\n')[0] : 'java not found on PATH',
      remedy:
        'Install JDK 17 (Eclipse Temurin 17 or Android Studio → SDK Manager → "Android Studio\'s JDK"), ' +
        'then set JAVA_HOME to that folder. On Windows: setx JAVA_HOME "C:\\Program Files\\Eclipse Adoptium\\jdk-17"',
    };
  }
  const ok = major >= MIN_JDK;
  return {
    id: 'java',
    label: `JDK ${MIN_JDK}+`,
    status: ok ? 'pass' : 'fail',
    found: `Java ${major}${javaHome ? ` (JAVA_HOME=${javaHome})` : ' (JAVA_HOME unset)'}`,
    remedy: ok
      ? null
      : `AGP 8.7 needs JDK 17 or newer; found Java ${major}. Install JDK 17 and point JAVA_HOME at it.`,
  };
}

export function checkAndroidSdk({ env = process.env, platformSdk = COMPILE_SDK } = {}) {
  const candidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]
    .filter(Boolean)
    .concat([
      join(env.HOME ?? env.USERPROFILE ?? '', 'Android', 'Sdk'),
      join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
    ]);
  const sdkRoot = candidates.find((path) => path && existsSync(join(path, 'platforms')));
  if (!sdkRoot) {
    return {
      id: 'android-sdk',
      label: 'Android SDK',
      status: 'fail',
      found: env.ANDROID_HOME || env.ANDROID_SDK_ROOT || 'no ANDROID_HOME / ANDROID_SDK_ROOT and no default SDK folder',
      remedy:
        'Install Android Studio (bundles the SDK) or the command-line tools, then set ANDROID_HOME. ' +
        `Required: platforms;android-${platformSdk}, build-tools;${platformSdk}.0.0, platform-tools.`,
    };
  }

  const platforms = directories(join(sdkRoot, 'platforms'));
  const hasPlatform = platforms.includes(`android-${platformSdk}`);
  const buildTools = directories(join(sdkRoot, 'build-tools')).sort(compareVersions);
  const newestBuildTools = buildTools.at(-1) ?? null;
  const hasBuildTools = newestBuildTools !== null && compareVersions(newestBuildTools, '34.0.0') >= 0;
  const hasPlatformTools = existsSync(join(sdkRoot, 'platform-tools'));

  const missing = [];
  if (!hasPlatform) missing.push(`platforms;android-${platformSdk}`);
  if (!newestBuildTools) missing.push(`build-tools;${platformSdk}.0.0`);
  if (!hasPlatformTools) missing.push('platform-tools');

  return {
    id: 'android-sdk',
    label: `Android SDK (platform ${platformSdk})`,
    status: missing.length === 0 ? 'pass' : 'fail',
    found: `${sdkRoot} · platforms: ${platforms.join(', ') || 'none'} · build-tools: ${newestBuildTools ?? 'none'}`,
    remedy:
      missing.length === 0
        ? hasBuildTools
          ? null
          : 'Build-tools are older than 34; Gradle will download a newer one on the first build.'
        : `sdkmanager "platforms;android-${platformSdk}" "build-tools;${platformSdk}.0.0" "platform-tools" ` +
          `(or Android Studio → SDK Manager). Missing: ${missing.join(', ')}`,
    sdkRoot,
  };
}

export function checkGradleWrapper({ dir = ANDROID_DIR } = {}) {
  const gradlew = join(dir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const jar = join(dir, 'gradle', 'wrapper', 'gradle-wrapper.jar');
  const ok = existsSync(gradlew) && existsSync(jar);
  return {
    id: 'gradle-wrapper',
    label: 'Gradle wrapper (offline-capable)',
    status: ok ? 'pass' : 'fail',
    found: ok ? 'gradlew + gradle/wrapper/gradle-wrapper.jar present' : 'wrapper files missing',
    remedy: ok ? null : 'Re-checkout the `android/` folder; the committed wrapper is required.',
  };
}

export function checkWebAssets({ dir = ANDROID_DIR } = {}) {
  const assets = join(dir, 'app', 'src', 'main', 'assets', 'public');
  let ok = false;
  let count = 0;
  if (existsSync(join(assets, 'index.html'))) {
    try {
      count = readdirSync(join(assets, 'assets')).length;
      ok = count > 0;
    } catch {
      ok = false;
    }
  }
  return {
    id: 'web-assets',
    label: 'Web assets synced into android/',
    status: ok ? 'pass' : 'fail',
    found: ok ? `index.html + ${count} hashed asset files` : 'android/app/src/main/assets/public is empty',
    remedy: ok ? null : 'Run `npm run android:sync` (it builds dist/ and copies it into android/).',
  };
}

export function runPreflight() {
  return [
    checkNode(),
    checkJava(),
    checkAndroidSdk(),
    checkGradleWrapper(),
    checkWebAssets(),
  ];
}

function printReport(checks) {
  const symbol = { pass: 'PASS', fail: 'FAIL', warn: 'WARN' };
  console.log('\nMKJ StudyOS — Android build preflight\n');
  for (const check of checks) {
    console.log(`  [${symbol[check.status]}] ${check.label}`);
    console.log(`         found: ${check.found}`);
    if (check.remedy) console.log(`         fix:   ${check.remedy}`);
  }
  const failed = checks.filter((check) => check.status === 'fail');
  console.log('');
  if (failed.length === 0) {
    console.log('Ready. Build the APK with:');
    console.log('  npm run android:sync && npm run android:build');
    console.log('Output: android/app/build/outputs/apk/debug/app-debug.apk\n');
    return 0;
  }
  console.log(`${failed.length} requirement(s) missing — fix the lines above, then re-run:`);
  console.log('  npm run android:preflight\n');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const checks = runPreflight();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ready: checks.every((check) => check.status !== 'fail'), checks }, null, 2));
    process.exit(checks.some((check) => check.status === 'fail') ? 2 : 0);
  }
  process.exit(printReport(checks));
}
