import type { SupabaseClient } from '@supabase/supabase-js';
import { reportSchema } from '@/domain/schemas';
import type { WeeklyReportPayload } from '@/domain/reports';
import type { DateOnly } from '@/types/domain';

export interface AIStatus {
  available: boolean;
  mode: 'cloud' | 'local';
  reason: string;
}

export interface AIRequestOptions {
  weekStart: DateOnly;
  weekEnd: DateOnly;
  timezone: string;
  locale: 'en' | 'bn';
}

export type AIWeeklyResult =
  | { ok: true; payload: WeeklyReportPayload; provider: string; model: string }
  | { ok: false; code: AIErrorCode; message: string };

export type AIErrorCode =
  | 'not_configured'
  | 'unauthenticated'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response'
  | 'provider_error'
  | 'network';

export interface AIProvider {
  status(): Promise<AIStatus>;
  generateWeeklyReport(options: AIRequestOptions): Promise<AIWeeklyResult>;
}

const ERROR_MESSAGES: Record<AIErrorCode, string> = {
  not_configured: 'AI is not configured on the server. The deterministic report below is complete and needs no AI.',
  unauthenticated: 'Sign in again to use the AI coach.',
  rate_limited: 'The AI coach is receiving too many requests. Try again later; your report below is unaffected.',
  timeout: 'The AI service took too long to respond. Try again later; your report below is unaffected.',
  invalid_response: 'The AI returned a response that failed validation, so it was not saved or displayed.',
  provider_error: 'The AI provider returned an error. Your deterministic report below is unaffected.',
  network: 'Could not reach the AI service. Check your connection; your report below is unaffected.',
};

function messageFor(code: AIErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Local mode: AI is never called from the client. */
export class UnavailableAIProvider implements AIProvider {
  async status(): Promise<AIStatus> {
    return {
      available: false,
      mode: 'local',
      reason:
        'AI runs only through a server-side Supabase function. Configure Supabase and server secrets to enable it. Everything else works without AI.',
    };
  }

  async generateWeeklyReport(): Promise<AIWeeklyResult> {
    return { ok: false, code: 'not_configured', message: messageFor('not_configured') };
  }
}

function mapHttpStatus(status: number): AIErrorCode {
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 422) return 'invalid_response';
  if (status >= 500) return 'provider_error';
  return 'provider_error';
}

/**
 * Cloud mode: the browser only ever talks to our own Edge Function, which holds
 * the provider key. The function returns a validated JSON report.
 */
export class SupabaseAIProvider implements AIProvider {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async status(): Promise<AIStatus> {
    try {
      const { data, error } = await this.client.functions.invoke('weekly-summary', {
        body: { action: 'status' },
      });
      if (error) {
        return {
          available: false,
          mode: 'cloud',
          reason:
            'The weekly-summary function is not deployed or not reachable. Deploy supabase/functions/weekly-summary and set AI secrets.',
        };
      }
      const payload = data as { configured?: boolean; provider?: string; model?: string } | null;
      if (payload?.configured) {
        return {
          available: true,
          mode: 'cloud',
          reason: `AI provider configured: ${payload.provider ?? 'unknown'}${payload.model ? ` (${payload.model})` : ''}.`,
        };
      }
      return {
        available: false,
        mode: 'cloud',
        reason: 'The function is deployed but AI_API_KEY is not set. Deterministic reports still work.',
      };
    } catch {
      return {
        available: false,
        mode: 'cloud',
        reason: 'Could not check AI status. Deterministic reports still work.',
      };
    }
  }

  async generateWeeklyReport(options: AIRequestOptions): Promise<AIWeeklyResult> {
    let response: Awaited<ReturnType<SupabaseClient['functions']['invoke']>>;
    try {
      response = await this.client.functions.invoke('weekly-summary', {
        body: {
          action: 'generate',
          week_start: options.weekStart,
          week_end: options.weekEnd,
          timezone: options.timezone,
          locale: options.locale,
        },
      });
    } catch {
      return { ok: false, code: 'network', message: messageFor('network') };
    }
    const { data, error } = response;
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status ?? 0;
      const code = mapHttpStatus(status);
      return { ok: false, code, message: messageFor(code) };
    }
    const envelope = data as { report?: unknown; provider?: string; model?: string; error?: { code?: string; message?: string } } | null;
    if (!envelope || envelope.error) {
      const code = (envelope?.error?.code as AIErrorCode | undefined) ?? 'provider_error';
      return { ok: false, code, message: envelope?.error?.message ?? messageFor(code) };
    }
    const parsed = reportSchema.safeParse(envelope.report);
    if (!parsed.success) {
      return { ok: false, code: 'invalid_response', message: messageFor('invalid_response') };
    }
    const raw = envelope.report as WeeklyReportPayload;
    const payload: WeeklyReportPayload = {
      ...raw,
      week: raw.week ?? { start: options.weekStart, end: options.weekEnd },
      disclaimer:
        raw.disclaimer ??
        'AI interprets only the records you entered. Missing records mean “not recorded”, not “not studied”.',
    };
    return {
      ok: true,
      payload,
      provider: envelope.provider ?? 'unknown',
      model: envelope.model ?? 'unknown',
    };
  }
}
