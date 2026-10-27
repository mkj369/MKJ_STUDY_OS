/** Types for scripts/android-preflight.mjs (kept next to the script for editors). */

export interface CheckResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  found: string;
  remedy: string | null;
  sdkRoot?: string;
}

export const MIN_JDK: number;
export const COMPILE_SDK: number;
export const MIN_NODE: number[];

export function parseJavaMajorVersion(output: string): number | null;
export function compareVersions(a: string, b: string): number;
export function checkNode(version?: string): CheckResult;
export function checkJava(options?: { javaHome?: string; versionOutput?: string | null }): CheckResult;
export function checkAndroidSdk(options?: {
  env?: Record<string, string | undefined>;
  platformSdk?: number;
}): CheckResult;
export function checkGradleWrapper(options?: { dir?: string }): CheckResult;
export function checkWebAssets(options?: { dir?: string }): CheckResult;
export function runPreflight(): CheckResult[];
