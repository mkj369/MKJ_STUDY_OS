/**
 * Resolve a Chromium that runs inside this Linux sandbox.
 *
 * The packaged Chromium needs NSS/NSPR shared libraries that are not installed
 * system-wide. @sparticuz/chromium ships them inside bin/al2023.tar.br, so we
 * extract that once into /tmp and point LD_LIBRARY_PATH at it.
 *
 * On a normal developer machine or CI with `npx playwright install chromium`,
 * this shim is unnecessary — see README.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const libDir = '/tmp/mkj-playwright-libs';

export async function chromiumExecutablePath() {
  const { default: chromium } = await import('@sparticuz/chromium');
  const executablePath = await chromium.executablePath();
  if (!existsSync(`${libDir}/lib/libnss3.so`)) {
    // Resolve through the module URL: the package does not export ./package.json.
    const chromiumEntry = import.meta.resolve('@sparticuz/chromium');
    const archive = path.join(path.dirname(new URL(chromiumEntry).pathname), '..', 'bin', 'al2023.tar.br');
    const tarPath = '/tmp/mkj-playwright-libs.tar';
    writeFileSync(tarPath, zlib.brotliDecompressSync(readFileSync(archive)));
    mkdirSync(libDir, { recursive: true });
    execFileSync('tar', ['-xf', tarPath, '-C', libDir]);
  }
  return executablePath;
}

export function chromiumEnv() {
  return { ...process.env, LD_LIBRARY_PATH: `${libDir}/lib:${process.env.LD_LIBRARY_PATH ?? ''}` };
}
