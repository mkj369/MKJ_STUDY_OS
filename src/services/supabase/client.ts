import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a full URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY looks too short'),
});

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export interface AppConfig {
  mode: 'cloud' | 'local';
  cloud: CloudConfig | null;
  /** Human-readable reason local mode is active (shown on the setup screen). */
  localReason: string | null;
  appEnv: string;
}

export function readConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    return {
      mode: 'local',
      cloud: null,
      localReason: `Supabase is not configured (${missing}). Running in local demo mode; records stay in this browser.`,
      appEnv: env['VITE_APP_ENV'] ?? 'development',
    };
  }
  return {
    mode: 'cloud',
    cloud: { url: parsed.data.VITE_SUPABASE_URL, anonKey: parsed.data.VITE_SUPABASE_ANON_KEY },
    localReason: null,
    appEnv: env['VITE_APP_ENV'] ?? 'production',
  };
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getSupabaseClient(config: CloudConfig): SupabaseClient {
  const key = `${config.url}|${config.anonKey}`;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'mkj.studyos.auth',
    },
    global: {
      headers: { 'x-application-name': 'mkj-studyos' },
    },
  });
  cachedKey = key;
  return cachedClient;
}

/** Test/SSR helper — forget the memoised client. */
export function resetSupabaseClient(): void {
  cachedClient = null;
  cachedKey = '';
}
