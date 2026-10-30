import { useCallback, type ReactNode } from 'react';
import { useIonToast } from '@ionic/react';
import { useWorkspaceQuery, type WorkspaceQueryResult } from '@/hooks/useWorkspace';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { errorMessage } from '@/utils/errors';

export function WorkspaceGate({ children }: { children: (data: WorkspaceQueryResult) => ReactNode }) {
  const { data, isLoading, error, refetch, isFetching } = useWorkspaceQuery();
  if (isLoading) return <LoadingState label="Loading your records…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Could not load your records"
        message={error ? errorMessage(error) : 'No data returned.'}
        onRetry={() => void refetch()}
        extra={isFetching ? <p className="small muted">Retrying…</p> : undefined}
      />
    );
  }
  return <>{children(data)}</>;
}

export function useNotify() {
  const [toast] = useIonToast();
  return useCallback(
    async (message: string, color: 'success' | 'danger' | 'warning' | 'medium' = 'success') => {
      await toast({
        message,
        duration: color === 'danger' ? 3500 : 2000,
        color,
        position: 'bottom',
        cssClass: 'app-toast',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
      });
    },
    [toast],
  );
}
