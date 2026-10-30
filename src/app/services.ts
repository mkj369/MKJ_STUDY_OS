import { getSupabaseClient, readConfig, type AppConfig } from '@/services/supabase/client';
import { SupabaseAuthClient } from '@/services/auth/supabaseAuth';
import { LocalAuthClient } from '@/services/auth/localAuth';
import { SupabaseRepository } from '@/services/supabase/supabaseRepository';
import { LocalRepository } from '@/services/local/localRepository';
import { type KeyValueStorage } from '@/services/local/storage';
import { getDurableStorage } from '@/services/local/durableStorage';
import { SupabaseAIProvider, UnavailableAIProvider, type AIProvider } from '@/services/ai/aiClient';
import type { AuthClient } from '@/services/auth/types';
import type { Repository } from '@/services/repository';

export interface AppServices {
  config: AppConfig;
  auth: AuthClient;
  storage: KeyValueStorage;
  createRepository(userId: string): Repository;
  getAIProvider(): AIProvider;
}

export function createAppServices(env?: Record<string, string | undefined>, storage?: KeyValueStorage): AppServices {
  const config = readConfig(env);
  const kv = storage ?? getDurableStorage();

  if (config.mode === 'cloud' && config.cloud) {
    const client = getSupabaseClient(config.cloud);
    return {
      config,
      storage: kv,
      auth: new SupabaseAuthClient(client),
      createRepository: (userId: string) => new SupabaseRepository(client, userId),
      getAIProvider: () => new SupabaseAIProvider(client),
    };
  }

  return {
    config,
    storage: kv,
    auth: new LocalAuthClient(kv),
    createRepository: (userId: string) => new LocalRepository(userId, kv),
    getAIProvider: () => new UnavailableAIProvider(),
  };
}
