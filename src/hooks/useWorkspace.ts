import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useRepository } from '@/app/AppProviders';
import { buildWorkspaceView, type WorkspaceView } from '@/features/shared/selectors';
import type { Repository, UserDataBundle } from '@/services/repository';
import type { DateOnly } from '@/types/domain';

export function workspaceQueryKey(mode: string, userId: string): [string, string, string] {
  return ['workspace', mode, userId];
}

export interface WorkspaceQueryResult {
  bundle: UserDataBundle;
  view: WorkspaceView;
}

export function useWorkspaceQuery() {
  const repository = useRepository();
  const { user, mode } = useAuth();
  return useQuery<WorkspaceQueryResult>({
    queryKey: workspaceQueryKey(mode, user?.id ?? 'anonymous'),
    queryFn: async () => {
      const bundle = await repository.listAllUserData();
      return { bundle, view: buildWorkspaceView(bundle) };
    },
    enabled: Boolean(user),
  });
}

/** Convenience: the workspace view or null while loading. */
export function useWorkspaceView(): WorkspaceView | null {
  const { data } = useWorkspaceQuery();
  return data?.view ?? null;
}

export function useWorkspaceBundle(): UserDataBundle | null {
  const { data } = useWorkspaceQuery();
  return data?.bundle ?? null;
}

/**
 * Run a repository action and refresh the workspace query on success.
 * Failures bubble up so the calling form can show the real error.
 */
export function useMutate() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { user, mode } = useAuth();

  return useCallback(
    async <T,>(action: (repo: Repository) => Promise<T>): Promise<T> => {
      const result = await action(repository);
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(mode, user?.id ?? 'anonymous') });
      return result;
    },
    [repository, queryClient, mode, user?.id],
  );
}

export function useToday(): DateOnly {
  const view = useWorkspaceView();
  return view?.today ?? new Date().toISOString().slice(0, 10);
}
