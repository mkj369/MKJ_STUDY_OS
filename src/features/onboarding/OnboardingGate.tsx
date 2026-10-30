import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { LoadingState } from '@/components/ui/States';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { takePendingProfile } from '@/services/auth/pendingProfile';
import { groupAppliesToClass, normaliseGroup } from '@/domain/studentProfile';
import { isClassLevel } from '@/domain/classLevels';

/**
 * Shows the first-launch setup once.
 *
 * `profiles.onboarded_at` is the marker, so this is not a property of the
 * browser: the same student on another device sees the same decision, and a
 * student who skipped is not asked again. A profile that already has records but
 * no marker (created before onboarding existed) is asked once too — the answer is
 * a view preference, so nothing is lost either way.
 *
 * Sign-up already asks for class and group. That choice is parked in device
 * storage until a session exists; this gate applies it once and skips the
 * question rather than asking for the same thing twice.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useWorkspaceQuery();
  const mutate = useMutate();
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState(false);

  const needsOnboarding = Boolean(data && !data.bundle.profile.onboarded_at);

  useEffect(() => {
    if (!needsOnboarding || applying) return;
    const pending = takePendingProfile();
    if (!pending) return;
    const level = pending.classLevel;
    if (!isClassLevel(level)) return;
    setApplying(true);
    void mutate((repository) =>
      repository.updateProfile({
        active_class: level,
        active_group: groupAppliesToClass(level) ? normaliseGroup(pending.group) : null,
        onboarded_at: new Date().toISOString(),
      }),
    )
      .then(() => queryClient.invalidateQueries())
      .catch(() => {
        // The write failed: onboarding will ask on the next screen instead.
      })
      .finally(() => setApplying(false));
  }, [needsOnboarding, applying, mutate, queryClient]);

  if (isLoading || !data) return <LoadingState label="Opening MKJ StudyOS…" />;

  if (needsOnboarding) {
    if (applying) return <LoadingState label="Saving your class…" />;
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
