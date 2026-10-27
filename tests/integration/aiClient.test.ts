import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseAIProvider,
  UnavailableAIProvider,
  type AIRequestOptions,
} from '@/services/ai/aiClient';
import type { WeeklyReportPayload } from '@/domain/reports';

const OPTIONS: AIRequestOptions = {
  weekStart: '2026-10-25',
  weekEnd: '2026-10-31',
  timezone: 'Asia/Dhaka',
  locale: 'en',
};

function validPayload(): WeeklyReportPayload {
  return {
    summary: 'You recorded 75 minutes across two days.',
    observed_facts: [{ label: 'Study time', value: '75 minutes', evidence: ['Session on 2026-10-25'] }],
    possible_gaps: [],
    recommendations: [{ title: 'Keep going', why: 'No gap flagged.', evidence: ['0 open tasks'], priority: 'low' }],
    missing_data: ['No exam results entered for this week.'],
    suggested_tasks: [{ title: 'Revise Motion', estimated_minutes: 30, priority: 'high', reason: 'Revision date passed.' }],
    generated_at: '2026-10-27T12:00:00.000Z',
    week: { start: '2026-10-25', end: '2026-10-31' },
    metrics: {
      studyMinutes: 75,
      studyMinutesPrevious: 0,
      sessionsLogged: 2,
      activeDays: 2,
      lecturesCompleted: 1,
      revisionsLogged: 0,
      checklistItemsTicked: 1,
      tasksCompleted: 0,
      tasksCreated: 0,
      tasksOpen: 0,
      tasksOverdue: 0,
      examsRecorded: 0,
      averageExamPercent: null,
      difficultiesOpened: 0,
      difficultiesResolved: 0,
      openHighDifficulties: 0,
      chaptersWithRecords: 1,
      chaptersWithoutRecords: 0,
    },
    disclaimer: 'AI interprets only the records you entered.',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
  };
}

function fakeClient(invoke: ReturnType<typeof vi.fn>): SupabaseClient {
  return { functions: { invoke } } as unknown as SupabaseClient;
}

describe('AI provider wiring', () => {
  it('never calls the network in local mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = new UnavailableAIProvider();
    const status = await provider.status();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('server-side');
    const result = await provider.generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends only dates and locale to the Edge Function', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { report: validPayload(), provider: 'gemini', model: 'm' }, error: null });
    const provider = new SupabaseAIProvider(fakeClient(invoke));
    const result = await provider.generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith('weekly-summary', {
      body: {
        action: 'generate',
        week_start: '2026-10-25',
        week_end: '2026-10-31',
        timezone: 'Asia/Dhaka',
        locale: 'en',
      },
    });
    // No records, no keys, no user data leave the browser for this call.
    const body = JSON.stringify(invoke.mock.calls[0]);
    expect(body).not.toContain('AI_API_KEY');
    expect(body).not.toContain('service_role');
  });

  it('accepts a validated report and fills week/disclaimer', async () => {
    const payload = { ...validPayload() } as Partial<WeeklyReportPayload>;
    delete payload.week;
    delete payload.disclaimer;
    const invoke = vi.fn().mockResolvedValue({ data: { report: payload }, error: null });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.week).toEqual({ start: '2026-10-25', end: '2026-10-31' });
      expect(result.payload.disclaimer).toContain('not recorded');
    }
  });

  it('discards malformed reports instead of displaying them', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { report: { summary: 'looks fine', observed_facts: 'not an array' } },
      error: null,
    });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_response');
      expect(result.message).toContain('failed validation');
    }
  });

  it('accepts a narrative without local metrics (facts carry the numbers)', async () => {
    const payload = { ...validPayload() } as Partial<WeeklyReportPayload>;
    delete payload.metrics;
    const invoke = vi.fn().mockResolvedValue({ data: { report: payload }, error: null });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown severity or priority', async () => {
    const payload = validPayload();
    payload.possible_gaps = [
      { code: 'x', label: 'Gap', reason: 'Because', evidence: [], severity: 'catastrophic' as never },
    ];
    const invoke = vi.fn().mockResolvedValue({ data: { report: payload }, error: null });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range suggested tasks', async () => {
    const payload = validPayload();
    payload.suggested_tasks = [
      { title: 'Marathon', estimated_minutes: 900, priority: 'high', reason: 'too long' },
    ];
    const invoke = vi.fn().mockResolvedValue({ data: { report: payload }, error: null });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
  });

  it.each([
    [401, 'unauthenticated'],
    [429, 'rate_limited'],
    [504, 'timeout'],
    [422, 'invalid_response'],
    [502, 'provider_error'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context: { status } } });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('reports a network failure without breaking the report page', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network');
      expect(result.message).toContain('unaffected');
    }
  });

  it('passes a structured error envelope through', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { error: { code: 'rate_limited', message: 'Too many AI requests this hour.' } },
      error: null,
    });
    const result = await new SupabaseAIProvider(fakeClient(invoke)).generateWeeklyReport(OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('rate_limited');
      expect(result.message).toBe('Too many AI requests this hour.');
    }
  });

  it('explains an undeployed function', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'Function not found' } });
    const status = await new SupabaseAIProvider(fakeClient(invoke)).status();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('not deployed');
  });

  it('reports a deployed function with no provider key', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { configured: false }, error: null });
    const status = await new SupabaseAIProvider(fakeClient(invoke)).status();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('AI_API_KEY');
  });

  it('reports a configured provider without exposing the key', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { configured: true, provider: 'gemini', model: 'gemini-2.0-flash' },
      error: null,
    });
    const status = await new SupabaseAIProvider(fakeClient(invoke)).status();
    expect(status.available).toBe(true);
    expect(status.reason).toContain('gemini');
    expect(status.reason).not.toMatch(/key/i);
  });
});
