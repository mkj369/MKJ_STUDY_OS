/**
 * Live sync status: idle/syncing/offline/error/synced + pending count + retry.
 * Rendered in the shell top bar and Settings. Local mode shows nothing extra
 * (the existing "Local demo" badge already tells the truth).
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IonIcon } from '@ionic/react';
import { refreshOutline } from 'ionicons/icons';
import { useAuth, useRepositoryOptional } from '@/app/AppProviders';
import { Badge } from '@/components/ui/Page';
import { SYNC_EVENT, type SyncStatus } from '@/services/sync/types';
import type { SyncEngine } from '@/services/sync/syncEngine';

type WithEngine = { engine?: SyncEngine };

export function useSyncStatus(): { status: SyncStatus | null; retry: () => void } {
  const repository = useRepositoryOptional() as (WithEngine & object) | null;
  const engine = repository?.engine;
  const [status, setStatus] = useState<SyncStatus | null>(engine ? engine.getStatus() : null);

  useEffect(() => {
    if (!engine) {
      setStatus(null);
      return;
    }
    return engine.subscribe(setStatus);
  }, [engine]);

  return { status, retry: () => void engine?.syncNow() };
}

/** Refresh workspace queries whenever the sync engine applies changes. */
export function useSyncInvalidation(): void {
  const queryClient = useQueryClient();
  const { mode } = useAuth();
  useEffect(() => {
    if (mode !== 'cloud') return;
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
    };
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, [queryClient, mode]);
}

const LABELS: Record<SyncStatus['state'], string> = {
  idle: 'Sync pending',
  syncing: 'Syncing…',
  offline: 'Offline — saved on device',
  error: 'Sync issue',
  synced: 'Synced',
};

const TONES: Record<SyncStatus['state'], 'good' | 'warn' | 'danger' | 'neutral' | 'info'> = {
  idle: 'neutral',
  syncing: 'info',
  offline: 'warn',
  error: 'danger',
  synced: 'good',
};

export function SyncStatusBadge({ compact = false }: { compact?: boolean }) {
  const { mode } = useAuth();
  const { status, retry } = useSyncStatus();
  if (mode !== 'cloud' || !status) return null;

  const showRetry = status.state === 'error' || status.state === 'offline';
  return (
    <span className="row" style={{ gap: 6 }}>
      <Badge tone={TONES[status.state]}>
        <span className={`sync-dot sync-dot--${status.state === 'synced' ? 'ok' : status.state === 'error' ? 'error' : status.state === 'offline' ? 'offline' : 'pending'}`} aria-hidden="true" />
        {compact ? LABELS[status.state].split(' — ')[0] : LABELS[status.state]}
        {status.pendingCount > 0 ? ` · ${status.pendingCount} pending` : ''}
      </Badge>
      {showRetry ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={retry} aria-label="Retry sync now">
          <IonIcon icon={refreshOutline} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
