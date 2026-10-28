import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Client-bundle secret scan.
 *
 * Everything under `VITE_*` is compiled into the browser/Android bundle, so a
 * service-role key, an AI provider key or a function secret reaching `src/` would ship
 * to every device. This test reads the actual production build and fails if any
 * server-only identifier appears, and independently checks that the Edge Functions do
 * not read client variables.
 *
 * Run `npm run build` first; the test skips (visibly) when `dist/` is absent.
 */

const DIST = join(process.cwd(), 'dist');
const hasDist = existsSync(DIST);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * These must never reach a client bundle. (The *words* "AI_API_KEY" and "AI_PROVIDER"
 * legitimately appear in setup help text, so they are not listed here — the key-shape
 * patterns below catch an actual value instead.)
 */
const FORBIDDEN_NAMES = ['service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'x-goog-api-key'];

/** Shapes of real provider credentials and service-role JWTs. */
const FORBIDDEN_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'Google API key (AIza…)', regex: /AIza[0-9A-Za-z_-]{30,}/ },
  { label: 'OpenAI key (sk-…)', regex: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: 'Anthropic key (sk-ant-…)', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: 'JWT claiming service_role', regex: /["']role["']\s*:\s*["']service_role["']/ },
];

describe.skipIf(!hasDist)('production bundle', () => {
  const files = hasDist ? walk(DIST).filter((file) => /\.(js|css|html|json)$/.test(file)) : [];

  it('ships at least one JavaScript file (the build actually ran)', () => {
    expect(files.filter((file) => file.endsWith('.js')).length).toBeGreaterThan(10);
  });

  it('contains no server-only identifiers', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const needle of FORBIDDEN_NAMES) {
        if (text.includes(needle)) offenders.push(`${file.replace(process.cwd(), '.')} → ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('contains no provider credential or service-role token', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const { label, regex } of FORBIDDEN_PATTERNS) {
        if (regex.test(text)) offenders.push(`${file.replace(process.cwd(), '.')} → ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('contains no Deno runtime references (Edge Function code must not be bundled)', () => {
    expect(files.filter((file) => readFileSync(file, 'utf8').includes('Deno.env')).map((f) => f)).toEqual([]);
  });
});

describe('server-side sources', () => {
  it('never read VITE_ client variables', () => {
    const dir = join(process.cwd(), 'supabase', 'functions');
    const offenders = walk(dir)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('VITE_'));
    expect(offenders).toEqual([]);
  });

  it('keeps the provider key out of returned payloads', () => {
    const source = readFileSync(join(process.cwd(), 'supabase', 'functions', '_shared', 'ai.ts'), 'utf8');
    // The key may only be used to build a request header.
    const keyUsages = source.split('\n').filter((line) => line.includes('config.apiKey'));
    expect(keyUsages.length).toBeGreaterThan(0);
    for (const line of keyUsages) {
      // A request header is the only acceptable place: never a URL, never a payload field
      // that flows back to the client.
      expect(line).toMatch(/['"]x-goog-api-key['"]:\s*config\.apiKey|Bearer \$\{config\.apiKey\}/);
    }
    // The key must not be interpolated into a URL.
    expect(source).not.toMatch(/[?&]key=\$\{config\.apiKey\}/);
  });
});
