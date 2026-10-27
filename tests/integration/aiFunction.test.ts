import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allowedNumbers,
  findInventedNumbers,
  generateWeeklyNarrative,
  providerConfig,
  validateReport,
  type ProviderConfig,
  type WeeklyFacts,
} from '../../supabase/functions/_shared/ai';

/**
 * The server-side AI adapter (`supabase/functions/_shared/ai.ts`) is what actually
 * talks to a provider. It is written for Deno, but it only uses two host globals —
 * `Deno.env` and `fetch` — so it can be executed here in Node with both stubbed.
 *
 * What this proves: request construction, key handling, response validation,
 * invented-number rejection, error mapping and the retry/timeout policy.
 * What it does NOT prove: that a real provider accepts the request. No key or
 * outbound access to generativelanguage.googleapis.com / api.openai.com exists in
 * this environment, so a live call is still unverified (see README).
 */

const REPORT = {
  summary: 'You recorded 45 minutes of Physics practice in 1 session.',
  observed_facts: [
    { label: 'Study time', value: '45 minutes', evidence: ['session on 2026-10-20'] },
  ],
  possible_gaps: [],
  recommendations: [
    {
      title: 'Repeat the practice later this week',
      why: '45 minutes of practice were recorded',
      evidence: ['session on 2026-10-20'],
      priority: 'medium',
    },
  ],
  missing_data: ['Revisions not recorded'],
  suggested_tasks: [
    {
      title: 'Solve 5 more projectile numericals',
      estimated_minutes: 45,
      priority: 'medium',
      reason: 'Practice was recorded for this chapter',
    },
  ],
};

const FACTS: WeeklyFacts = {
  week_start: '2026-10-19',
  week_end: '2026-10-25',
  timezone: 'Asia/Dhaka',
  locale: 'en',
  subjects: [{ id: 's1', name: 'Physics' }],
  sessions: [{ date: '2026-10-20', subject: 'Physics', activity: 'practice', minutes: 45 }],
  lectures: [],
  revisions: [],
  checklist: [],
  tasks: [],
  difficulties: [],
  exams: [],
  metrics: { sessions: 1, minutes: 45 },
};

const CONFIG: ProviderConfig = {
  provider: 'gemini',
  apiKey: 'test-key-DO-NOT-LEAK',
  model: 'gemini-2.0-flash',
  timeoutMs: 50,
};

type FetchCall = { url: string; init: RequestInit };

let calls: FetchCall[];

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function openaiBody(text: string) {
  return { choices: [{ message: { content: text } }] };
}

function stubFetch(handler: (call: FetchCall) => Promise<unknown>) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return handler(call);
  });
}

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

function status(code: number) {
  return Promise.resolve({ ok: false, status: code, json: async () => ({}) });
}

const originalDeno = (globalThis as Record<string, unknown>)['Deno'];

function stubDeno(env: Record<string, string | undefined>) {
  (globalThis as Record<string, unknown>)['Deno'] = {
    env: { get: (key: string) => env[key] },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as Record<string, unknown>)['Deno'] = originalDeno;
});

describe('providerConfig', () => {
  it('reports "not configured" when no key is present, without throwing', () => {
    stubDeno({});
    expect(providerConfig()).toBeNull();
  });

  it('defaults to gemini, applies the model override and clamps a bad timeout', () => {
    stubDeno({ AI_API_KEY: 'k' });
    expect(providerConfig()).toMatchObject({ provider: 'gemini', model: 'gemini-2.0-flash', timeoutMs: 20000 });

    stubDeno({ AI_API_KEY: 'k', AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4.1-mini', AI_TIMEOUT_MS: '5000' });
    expect(providerConfig()).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini', timeoutMs: 5000 });

    stubDeno({ AI_API_KEY: 'k', AI_TIMEOUT_MS: 'not-a-number' });
    expect(providerConfig()?.timeoutMs).toBe(20000);
  });

  it('rejects an unsupported provider name instead of guessing', () => {
    stubDeno({ AI_API_KEY: 'k', AI_PROVIDER: 'some-other-vendor' });
    expect(providerConfig()).toBeNull();
  });
});

describe('generateWeeklyNarrative (provider request + validation)', () => {
  it('sends a gemini request with the key in a header only, never in the body or URL', async () => {
    stubFetch(() => ok(geminiBody(JSON.stringify(REPORT))));

    const result = await generateWeeklyNarrative(CONFIG, FACTS);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const [call] = calls as [FetchCall];
    expect(call.url).toContain('generativelanguage.googleapis.com');
    expect(call.url).toContain('gemini-2.0-flash');
    expect(call.url).not.toContain(CONFIG.apiKey);
    expect(JSON.stringify(call.init.headers)).toContain('x-goog-api-key');
    expect(String(call.init.body)).not.toContain(CONFIG.apiKey);
    expect(JSON.parse(String(call.init.body))).toMatchObject({ generationConfig: { temperature: 0.2 } });
  });

  it('stamps generated_at on the server and keeps the validated fields', async () => {
    stubFetch(() => ok(geminiBody(JSON.stringify(REPORT))));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.report?.summary).toBe(REPORT.summary);
    expect(result.report?.suggested_tasks[0]?.estimated_minutes).toBe(45);
    expect(Date.parse(result.report?.generated_at ?? '')).toBeGreaterThan(0);
    expect(result.report?.generated_at).not.toBe((REPORT as Record<string, unknown>)['generated_at']);
  });

  it('supports the OpenAI adapter with a bearer header and JSON response format', async () => {
    stubFetch(() => ok(openaiBody(JSON.stringify(REPORT))));
    const result = await generateWeeklyNarrative(
      { ...CONFIG, provider: 'openai', model: 'gpt-4o-mini' },
      FACTS,
    );
    expect(result.ok).toBe(true);
    const [call] = calls as [FetchCall];
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.stringify(call.init.headers)).toContain('Bearer');
    expect(JSON.parse(String(call.init.body))).toMatchObject({ response_format: { type: 'json_object' } });
  });

  it('accepts JSON wrapped in a markdown fence', async () => {
    stubFetch(() => ok(geminiBody('```json\n' + JSON.stringify(REPORT) + '\n```')));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.ok).toBe(true);
  });

  it('rejects invented numbers rather than showing them', async () => {
    stubFetch(() =>
      ok(geminiBody(JSON.stringify({ ...REPORT, summary: 'You studied 999 minutes this week.' }))),
    );
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid_response');
    expect(result.detail).toContain('invented_numbers');
    expect(result.detail).toContain('999');
  });

  it('rejects a response that is not JSON at all', async () => {
    stubFetch(() => ok(geminiBody('Sure! Here is your report: you did great.')));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid_response');
    expect(result.report).toBeUndefined();
    // The malformed answer is retried exactly once, then given up on.
    expect(calls).toHaveLength(2);
  });

  it('rejects a structurally invalid response (too many recommendations)', async () => {
    const many = { ...REPORT, recommendations: Array(6).fill(REPORT.recommendations[0]) };
    stubFetch(() => ok(geminiBody(JSON.stringify(many))));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.code).toBe('invalid_response');
  });

  it('maps a provider 401 to provider_error without retrying a hopeless call', async () => {
    stubFetch(() => status(401));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.code).toBe('provider_error');
    expect(calls).toHaveLength(1);
  });

  it('retries once on a 5xx and then reports provider_error', async () => {
    stubFetch(() => status(503));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.code).toBe('provider_error');
    expect(calls).toHaveLength(2);
  });

  it('reports a timeout when the provider never answers', async () => {
    stubFetch(
      (call) =>
        new Promise((_resolve, reject) => {
          call.init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const result = await generateWeeklyNarrative({ ...CONFIG, timeoutMs: 20 }, FACTS);
    expect(result.code).toBe('timeout');
    expect(calls).toHaveLength(2);
  });

  it('treats an empty provider body as a provider error', async () => {
    stubFetch(() => ok({ candidates: [] }));
    const result = await generateWeeklyNarrative(CONFIG, FACTS);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('provider_error');
  });
});

describe('validation helpers', () => {
  it('allows numbers that appear in the facts and flags those that do not', () => {
    const allowed = allowedNumbers(FACTS);
    expect(allowed.has('45')).toBe(true);
    expect(allowed.has('2026')).toBe(true);

    const clean = validateReport(REPORT);
    expect(clean).not.toBeNull();
    expect(findInventedNumbers(clean!, allowed)).toEqual([]);

    const dirty = { ...clean!, summary: 'You studied 300 minutes and scored 88%.' };
    expect(findInventedNumbers(dirty, allowed).sort()).toEqual(['300', '88']);
  });

  it('rejects out-of-range and unknown values instead of coercing them', () => {
    const base = validateReport(REPORT)!;
    expect(validateReport({ ...base, suggested_tasks: [{ ...base.suggested_tasks[0], estimated_minutes: 3 }] })).toBeNull();
    expect(
      validateReport({ ...base, suggested_tasks: [{ ...base.suggested_tasks[0], priority: 'urgent' }] }),
    ).toBeNull();
    expect(validateReport({ ...base, possible_gaps: [{ code: 'x', label: 'y', reason: 'z', evidence: [], severity: 'bad' }] })).toBeNull();
    expect(validateReport({ ...base, missing_data: 'not an array' })).toBeNull();
    expect(validateReport(null)).toBeNull();
    expect(validateReport([])).toBeNull();
  });
});
