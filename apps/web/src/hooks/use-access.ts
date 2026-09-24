import { useMemo } from 'react';
import { hasPermission as sharedHasPermission, hasAllPermissions, type NavAudience, type NavigationGroup } from '@society-erp/shared';
import { useAuthStore } from '@/stores/auth.store';

/** Frontend permission checks are UX only. The API is the security boundary. */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.context?.permissions);
  return useMemo(() => {
    const list = permissions ?? [];
    return {
      permissions: list,
      can: (required: string | string[]) => sharedHasPermission(list, required),
      canAll: (required: string[]) => hasAllPermissions(list, required),
    };
  }, [permissions]);
}

export function useAccessibleModules() {
  const modules = useAuthStore((s) => s.context?.modules);
  return useMemo(() => {
    const list = modules ?? [];
    const accessible = list.filter((m) => m.accessible);
    return {
      modules: list,
      accessible,
      hasModule: (key: string) => accessible.some((m) => m.key === key),
      moduleState: (key: string) => list.find((m) => m.key === key) ?? null,
    };
  }, [modules]);
}

export function useNavigation(audiences?: NavAudience[]): NavigationGroup[] {
  const navigation = useAuthStore((s) => s.context?.navigation);
  return useMemo(() => {
    const groups = navigation ?? [];
    if (!audiences) return groups;
    return groups.filter((g) => audiences.includes(g.audience));
  }, [navigation, audiences]);
}

export function useFeatureFlags() {
  const flags = useAuthStore((s) => s.context?.featureFlags);
  return useMemo(() => ({ flags: flags ?? {}, isEnabled: (key: string) => Boolean(flags?.[key]) }), [flags]);
}

export function useSubscription() {
  const subscription = useAuthStore((s) => s.context?.subscription);
  return useMemo(() => {
    const status = subscription?.status ?? 'NONE';
    return {
      subscription,
      status,
      isBlocked: Boolean(subscription?.blocked),
      isReadOnly: Boolean(subscription?.readOnly),
      isTrial: status === 'TRIALING',
      isExpired: status === 'EXPIRED' || status === 'SUSPENDED' || status === 'CANCELLED',
      daysRemaining: subscription?.daysRemaining ?? null,
      planName: subscription?.planName ?? null,
    };
  }, [subscription]);
}

export function useLanding() {
  return useAuthStore((s) => s.context?.landing ?? 'MEMBER');
}

/** Default route for the current session, derived from role landing preferences and onboarding state. */
export function landingPath(landing: string | undefined, hasSociety: boolean, isPlatformAdmin: boolean, onboardingCompleted = true): string {
  if (!hasSociety && isPlatformAdmin) return '/admin';
  if (!hasSociety) return '/choose-society';
  if (landing === 'PLATFORM') return '/admin';
  if (landing === 'GUARD') return '/guard';
  if (landing === 'MEMBER') return '/app/my';
  return onboardingCompleted ? '/app' : '/app/onboarding';
}
