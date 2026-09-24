import * as React from 'react';
import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { landingPath, useAccessibleModules, usePermissions, useSubscription } from '@/hooks/use-access';
import { FullScreenLoader } from '@/components/common/loading-state';
import { AccessDenied, ModuleUnavailable } from '@/components/common/gates';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import type { AppRoute } from '@/app/routes';

/** Session is still being restored: tokens may already be refreshed while /auth/me is in flight. */
const isBooting = (status: string, context: unknown) => status === 'idle' || status === 'loading' || (status === 'authenticated' && !context);

export function RequireAuth() {
  const { status, context, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isBooting(status, context)) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Redirects an authenticated user away from auth pages to their landing (or back to where they were heading). */
export function RedirectIfAuthenticated() {
  const { status, context, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isBooting(status, context)) return <FullScreenLoader />;
  const from = (location.state as { from?: string } | null)?.from;
  if (isAuthenticated && context && from && from.startsWith('/') && !from.startsWith('/login')) return <Navigate to={from} replace />;
  if (isAuthenticated && context) return <Navigate to={landingPath(context.landing, Boolean(context.society), context.user.isPlatformAdmin, context.society?.onboardingCompleted ?? true)} replace />;
  return <Outlet />;
}

export function RequirePlatformContext() {
  const { context } = useAuth();
  if (!context) return <FullScreenLoader />;
  if (context.landing !== 'PLATFORM') {
    if (context.user.isPlatformAdmin) return <Navigate to="/choose-society?platform=1" replace />;
    return <Navigate to={landingPath(context.landing, Boolean(context.society), false)} replace />;
  }
  return <Outlet />;
}

export function RequireSocietyContext({ guard }: { guard?: boolean }) {
  const { context } = useAuth();
  if (!context) return <FullScreenLoader />;
  if (!context.society) return <Navigate to={context.user.societies.length ? '/choose-society' : context.user.isPlatformAdmin ? '/admin' : '/choose-society'} replace />;
  if (guard && context.landing !== 'GUARD' && !context.permissions.some((p) => p.startsWith('visitors:check'))) return <Navigate to={landingPath(context.landing, true, false)} replace />;
  return <Outlet />;
}

function SubscriptionBlocked() {
  return (
    <EmptyState
      icon={<CreditCard />}
      title="Subscription required"
      description="Your society's subscription does not currently allow access to this area. Renew or contact your administrator."
      action={
        <Button asChild>
          <Link to="/app/settings/subscription">View subscription</Link>
        </Button>
      }
    />
  );
}

/** Applies module / permission / subscription requirements declared in the route config. */
export function RouteGate({ route, children }: { route: AppRoute; children: React.ReactNode }) {
  const { can } = usePermissions();
  const { hasModule, moduleState } = useAccessibleModules();
  const { isBlocked } = useSubscription();
  if (route.layout === 'society' || route.layout === 'guard') {
    if (route.subscriptionRequirement !== 'none' && isBlocked) return <SubscriptionBlocked />;
    if (route.module && !hasModule(route.module)) return <ModuleUnavailable module={route.module} state={moduleState(route.module)} />;
  }
  if (route.permission && !can(route.permission)) return <AccessDenied />;
  return <>{children}</>;
}
