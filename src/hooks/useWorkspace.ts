import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useRepository, useRepositoryOptional } from '@/app/AppProviders';
import { buildWorkspaceView, type WorkspaceView } from '@/features/shared/selectors';
import { scopeBundleToClass } from '@/domain/classScope';
import type { Repository, UserDataBundle } from '@/services/repository';
import type { DateOnly } from '@/types/domain';

export function workspaceQueryKey(mode: string, userId: string): [string, string, string] {
  return ['workspace', mode, userId];
}

export interface WorkspaceQueryResult {
  /**
   * Every record the student owns, across all classes. Needed by export (a
   * backup must be complete), by settings (changing class) and by archive
   * restore, which has to reach subjects of the class you are not in.
   */
  bundle: UserDataBundle;
  /**
   * The same bundle narrowed to the active class, so totals, timelines and
   * record lists do not mix a Class 9 week into a Class 11 one. Records with
   * no subject (a walk, a sleep block) are kept — they belong to no class.
   */
  scoped: UserDataBundle;
  view: WorkspaceView;
}

export function useWorkspaceQuery() {
  /*
   * Optional repository: this hook is mounted by ThemeProvider, which lives
   * *above* the auth gate (so the sign-in screen is already themed). Throwing
   * there would crash the whole provider tree before anyone signed in.
   */
  const repository = useRepositoryOptional();
  const { user, mode } = useAuth();
  return useQuery<WorkspaceQueryResult>({
    queryKey: workspaceQueryKey(mode, user?.id ?? 'anonymous'),
    queryFn: async () => {
      if (!repository) throw new Error('No active session');
      const bundle = await repository.listAllUserData();
      const view = buildWorkspaceView(bundle);
      return { bundle, scoped: scopeBundleToClass(bundle, view.profileClass), view };
    },
    enabled: Boolean(user) && Boolean(repository),
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
