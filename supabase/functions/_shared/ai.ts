/**
 * Provider adapter + strict response validation.
 *
 * The app is written against this shape, never against a specific vendor.
 * Switching AI_PROVIDER between `gemini` and `openai` requires no app change.
 *
 * Safety properties enforced here:
 *  - API keys exist only in the function environment.
 *  - Requests are bounded (small context, capped lengths, request timeout).
 *  - The model must return JSON that passes validation before storage/display.
 *  - Numbers in AI prose must already exist in the supplied facts, so the model
 *    cannot invent marks, minutes, counts or dates.
 */

export type AIProvider = 'gemini' | 'openai';

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface WeeklyFacts {
  week_start: string;
  week_end: string;
  timezone: string;
  locale: string;
  subjects: { id: string; name: string }[];
  sessions: { date: string; subject: string; activity: string; minutes: number; result?: string | null }[];
  lectures: { date: string; subject: string; title: string; source: string; completed: boolean }[];
  revisions: { date: string; subject: string; chapter: string | null; method: string; confidence: number; questions_attempted: number | null; questions_correct: number | null }[];
  checklist: { completed_at: string; chapter: string; label: string }[];
  tasks: { title: string; status: string; priority: string; due_date: string | null; minutes: number; completed_at: string | null }[];
  difficulties: { topic: string; subject: string; severity: string; status: string }[];
  exams: { name: string; date: string; subject: string | null; marks: number; total: number; percent: number }[];
  metrics: Record<string, number | string | null>;
}

export interface ValidatedReport {
  summary: string;
  observed_facts: { label: string; value: string; evidence: string[] }[];
  possible_gaps: { code: string; label: string; reason: string; evidence: string[]; severity: 'info' | 'attention' | 'high' }[];
  recommendations: { title: string; why: string; evidence: string[]; priority: 'low' | 'medium' | 'high' }[];
  missing_data: string[];
  suggested_tasks: { title: string; estimated_minutes: number; priority: 'low' | 'medium' | 'high'; reason: string }[];
  generated_at: string;
}

const SYSTEM_PROMPT = `You are a careful study coach inside MKJ StudyOS, a personal academic tracker for a Bangladesh HSC Science student.

Hard rules:
1. Use ONLY the data in FACTS. Never invent lectures, study time, revision counts, marks, dates, completion states, curriculum content or personal details.
2. If something is absent, say "not recorded". Never say the student "did not study" because a record is missing.
3. Separate what was recorded (facts) from interpretations (possible gaps) and suggestions (recommendations). Each suggestion must name the record that supports it.
4. No predicted exam marks, ranks, guarantees, shaming, streaks or comparison with other students. Be supportive and concrete.
5. Recommend at most 5 small actions and at most 5 suggested tasks. Prefer 20–45 minute steps.
6. Every number in your output must appear in FACTS. Do not compute new percentages that are not already present.
7. Reply with a single JSON object and nothing else, matching this schema:
{
  "summary": string (<= 600 chars),
  "observed_facts": [{ "label": string, "value": string, "evidence": string[] }] (<= 8),
  "possible_gaps": [{ "code": string, "label": string, "reason": string, "evidence": string[], "severity": "info"|"attention"|"high" }] (<= 6),
  "recommendations": [{ "title": string, "why": string, "evidence": string[], "priority": "low"|"medium"|"high" }] (<= 5),
  "missing_data": string[] (<= 8),
  "suggested_tasks": [{ "title": string, "estimated_minutes": integer 5-180, "priority": "low"|"medium"|"high", "reason": string }] (<= 5)
}`;

function isStringArray(value: unknown, max: number, maxLen: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= maxLen)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

const SEVERITIES = new Set(['info', 'attention', 'high']);
const PRIORITIES = new Set(['low', 'medium', 'high']);

/** Validate the model's JSON. Returns null when anything is off-schema. */
export function validateReport(raw: unknown): ValidatedReport | null {
  const record = asRecord(raw);
  if (!record) return null;
  const summary = boundedString(record.summary, 1200);
  if (!summary) return null;

  const factsRaw = record.observed_facts;
  if (!Array.isArray(factsRaw) || factsRaw.length > 8) return null;
  const observed_facts: ValidatedReport['observed_facts'] = [];
  for (const entry of factsRaw) {
    const item = asRecord(entry);
    if (!item) return null;
    const label = boundedString(item.label, 120);
    const value = boundedString(item.value, 400);
    const evidence = item.evidence ?? [];
    if (!label || !value || !isStringArray(evidence, 6, 240)) return null;
    observed_facts.push({ label, value, evidence });
  }

  const gapsRaw = record.possible_gaps;
  if (!Array.isArray(gapsRaw) || gapsRaw.length > 6) return null;
  const possible_gaps: ValidatedReport['possible_gaps'] = [];
  for (const entry of gapsRaw) {
    const item = asRecord(entry);
    if (!item) return null;
    const code = boundedString(item.code, 60);
    const label = boundedString(item.label, 160);
    const reason = boundedString(item.reason, 500);
    const evidence = item.evidence ?? [];
    const severity = String(item.severity ?? '');
    if (!code || !label || !reason || !SEVERITIES.has(severity) || !isStringArray(evidence, 6, 240)) return null;
    possible_gaps.push({ code, label, reason, evidence, severity: severity as 'info' | 'attention' | 'high' });
  }

  const recsRaw = record.recommendations;
  if (!Array.isArray(recsRaw) || recsRaw.length > 5) return null;
  const recommendations: ValidatedReport['recommendations'] = [];
  for (const entry of recsRaw) {
    const item = asRecord(entry);
    if (!item) return null;
    const title = boundedString(item.title, 160);
    const why = boundedString(item.why, 500);
    const evidence = item.evidence ?? [];
    const priority = String(item.priority ?? '');
    if (!title || !why || !PRIORITIES.has(priority) || !isStringArray(evidence, 6, 240)) return null;
    recommendations.push({ title, why, evidence, priority: priority as 'low' | 'medium' | 'high' });
  }

  if (!isStringArray(record.missing_data, 8, 240)) return null;

  const tasksRaw = record.suggested_tasks;
  if (!Array.isArray(tasksRaw) || tasksRaw.length > 5) return null;
  const suggested_tasks: ValidatedReport['suggested_tasks'] = [];
  for (const entry of tasksRaw) {
    const item = asRecord(entry);
    if (!item) return null;
    const title = boundedString(item.title, 140);
    const reason = boundedString(item.reason, 300);
    const minutes = Number(item.estimated_minutes);
    const priority = String(item.priority ?? '');
    if (!title || !reason || !PRIORITIES.has(priority)) return null;
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 180) return null;
    suggested_tasks.push({ title, estimated_minutes: minutes, priority: priority as 'low' | 'medium' | 'high', reason });
  }

  return {
    summary,
    observed_facts,
    possible_gaps,
    recommendations,
    missing_data: record.missing_data,
    suggested_tasks,
    generated_at: new Date().toISOString(),
  };
}

/** Numbers that appear in the facts payload — anything else is invented. */
export function allowedNumbers(facts: WeeklyFacts): Set<string> {
  const text = JSON.stringify(facts);
  const set = new Set<string>();
  for (const match of text.matchAll(/-?\d+(?:\.\d+)?/g)) set.add(String(Number(match[0])));
  // Week dates are supplied separately and may be echoed in prose.
  for (const part of `${facts.week_start} ${facts.week_end}`.split(/[-/ ]/)) {
    if (/^\d+$/.test(part)) set.add(String(Number(part)));
  }
  return set;
}

export function findInventedNumbers(report: ValidatedReport, allowed: Set<string>): string[] {
  const suspicious = new Set<string>();
  const fields = [
    report.summary,
    ...report.possible_gaps.map((gap) => `${gap.label} ${gap.reason}`),
    ...report.recommendations.map((rec) => `${rec.title} ${rec.why}`),
    ...report.observed_facts.map((fact) => `${fact.label} ${fact.value}`),
  ];
  for (const field of fields) {
    for (const match of field.matchAll(/\d+(?:\.\d+)?/g)) {
      const normalized = String(Number(match[0]));
      if (!allowed.has(normalized)) suspicious.add(match[0]);
    }
  }
  return [...suspicious];
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function callProvider(config: ProviderConfig, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    if (config.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        config.model,
      )}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 1600 },
        }),
      });
      if (!response.ok) throw new Error(`provider_status_${response.status}`);
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') throw new Error('provider_empty_response');
      return text;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!response.ok) throw new Error(`provider_status_${response.status}`);
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('provider_empty_response');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export interface GenerateResult {
  ok: boolean;
  report?: ValidatedReport;
  code?: 'timeout' | 'provider_error' | 'invalid_response' | 'not_configured';
  detail?: string;
}

export async function generateWeeklyNarrative(
  config: ProviderConfig,
  facts: WeeklyFacts,
): Promise<GenerateResult> {
  const userPrompt = `FACTS (the only allowed source of truth):\n${JSON.stringify(facts)}\n\nWrite the weekly report JSON now.`;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await callProvider(config, SYSTEM_PROMPT, userPrompt);
      const parsed = extractJson(text);
      const report = validateReport(parsed);
      if (!report) {
        lastError = 'schema';
        continue;
      }
      const invented = findInventedNumbers(report, allowedNumbers(facts));
      if (invented.length > 0) {
        lastError = `invented_numbers:${invented.slice(0, 3).join(',')}`;
        continue;
      }
      return { ok: true, report };
    } catch (error) {
      const message = (error as Error).message;
      lastError = message;
      if (/abort|timeout/i.test(message)) {
        // One retry on timeout, then report a timeout to the caller.
        continue;
      }
      if (/provider_status_5/.test(message)) continue;
      break;
    }
  }
  const code = /abort|timeout/i.test(lastError)
    ? 'timeout'
    : lastError.startsWith('invented') || lastError === 'schema'
      ? 'invalid_response'
      : 'provider_error';
  return { ok: false, code, detail: lastError.slice(0, 200) };
}

export function providerConfig(): ProviderConfig | null {
  const provider = (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase();
  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) return null;
  if (provider !== 'gemini' && provider !== 'openai') return null;
  const model = Deno.env.get('AI_MODEL') ?? (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini');
  const timeoutMs = Number(Deno.env.get('AI_TIMEOUT_MS') ?? '20000');
  return { provider, apiKey, model, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 20000 };
}
