import * as React from 'react';
import { Link } from 'react-router-dom';
import { Blocks, CreditCard, Lock, ShieldOff } from 'lucide-react';
import { useAccessibleModules, useFeatureFlags, usePermissions, useSubscription } from '@/hooks/use-access';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';

/**
 * UX-only gates. They hide or explain unavailable features; the API enforces the real rules.
 */
export function PermissionGate({ permission, children, fallback = null }: { permission: string | string[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = usePermissions();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}

export function ModuleGate({ module, children, fallback, showReason = false }: { module: string; children: React.ReactNode; fallback?: React.ReactNode; showReason?: boolean }) {
  const { hasModule, moduleState } = useAccessibleModules();
  if (hasModule(module)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  if (!showReason) return null;
  const state = moduleState(module);
  return <ModuleUnavailable module={module} state={state} />;
}

export function ModuleUnavailable({ module, state }: { module: string; state: ReturnType<ReturnType<typeof useAccessibleModules>['moduleState']> }) {
  if (state && !state.inPlan) {
    return (
      <EmptyState
        icon={<CreditCard />}
        title={`${state.name} is not in your plan`}
        description="Upgrade your plan to unlock this module. Your data will be available as soon as it is enabled."
        action={
          <Button asChild>
            <Link to="/app/settings/subscription">View plans</Link>
          </Button>
        }
      />
    );
  }
  if (state && !state.enabledBySociety) {
    return (
      <EmptyState
        icon={<Blocks />}
        title={`${state.name} is disabled`}
        description="A society administrator can enable this module from Settings → Modules. Existing data is preserved."
        action={
          <PermissionGate permission="society:manage_modules">
            <Button asChild>
              <Link to="/app/settings/modules">Open module settings</Link>
            </Button>
          </PermissionGate>
        }
      />
    );
  }
  return <EmptyState icon={<ShieldOff />} title={`${state?.name ?? module} is unavailable`} description={state?.featureFlagBlocked ? 'This feature is not enabled on the platform yet.' : 'This module is currently unavailable.'} />;
}

export function PlanGate({ module, children, fallback = null }: { module: string; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { moduleState } = useAccessibleModules();
  return moduleState(module)?.inPlan ? <>{children}</> : <>{fallback}</>;
}

export function FeatureGate({ flag, children, fallback = null }: { flag: string; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(flag) ? <>{children}</> : <>{fallback}</>;
}

/** Hides write actions when the subscription is read-only / blocked. */
export function SubscriptionGate({ children, fallback = null, requireWrite = true }: { children: React.ReactNode; fallback?: React.ReactNode; requireWrite?: boolean }) {
  const { isBlocked, isReadOnly } = useSubscription();
  if (isBlocked) return <>{fallback}</>;
  if (requireWrite && isReadOnly) return <>{fallback}</>;
  return <>{children}</>;
}

export function AccessDenied({ title = 'Access restricted', description = 'You do not have permission to view this page. Ask your society administrator if you need access.' }: { title?: string; description?: string }) {
  return <EmptyState icon={<Lock />} title={title} description={description} />;
}
