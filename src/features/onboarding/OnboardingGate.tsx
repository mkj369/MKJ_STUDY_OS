import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceQuery } from '@/hooks/useWorkspace';
import { LoadingState } from '@/components/ui/States';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';

/**
 * Shows the first-launch setup once.
 *
 * `profiles.onboarded_at` is the marker, so this is not a property of the
 * browser: the same student on another device sees the same decision, and a
 * student who skipped is not asked again. A profile that already has records but
 * no marker (created before onboarding existed) is asked once too — the answer is
 * a view preference, so nothing is lost either way.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useWorkspaceQuery();
  const queryClient = useQueryClient();

  if (isLoading || !data) return <LoadingState label="Opening MKJ StudyOS…" />;

  if (!data.bundle.profile.onboarded_at) {
    return (
      <OnboardingPage
        onDone={() => {
          void queryClient.invalidateQueries();
        }}
      />
    );
  }

  return <>{children}</>;
}
