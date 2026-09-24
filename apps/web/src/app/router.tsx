import { Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { routes, routesByLayout, type AppRoute } from '@/app/routes';
import { RequireAuth, RedirectIfAuthenticated, RequirePlatformContext, RequireSocietyContext, RouteGate } from '@/app/guards';
import { PublicLayout } from '@/layouts/public-layout';
import { AuthLayout } from '@/layouts/auth-layout';
import { AppShell } from '@/layouts/app-shell';
import { GuardLayout } from '@/layouts/guard-layout';
import { PageSkeleton, FullScreenLoader } from '@/components/common/loading-state';
import { ErrorBoundary } from '@/components/common/error-boundary';
import NotFoundPage from '@/features/shared/not-found-page';
import RouteErrorPage from '@/features/shared/route-error-page';

function element(route: AppRoute, fallback: React.ReactNode) {
  const Page = route.element;
  return (
    <ErrorBoundary>
      <Suspense fallback={fallback}>
        <RouteGate route={route}>
          <Page />
        </RouteGate>
      </Suspense>
    </ErrorBoundary>
  );
}

const toObjects = (list: AppRoute[], fallback: React.ReactNode): RouteObject[] => list.map((r) => ({ path: r.path, element: element(r, fallback) }));

export function buildRouter() {
  return createBrowserRouter([
    {
      errorElement: <RouteErrorPage />,
      children: [
    { element: <PublicLayout />, children: [...toObjects(routesByLayout('public'), <FullScreenLoader label="Loading…" />), { path: '*', element: <NotFoundPage /> }] },
    {
      element: <RedirectIfAuthenticated />,
      children: [{ element: <AuthLayout />, children: toObjects(routesByLayout('auth').filter((r) => r.path !== '/choose-society' && r.path !== '/accept-invite'), <PageSkeleton />) }],
    },
    {
      element: <AuthLayout />,
      children: toObjects(
        routesByLayout('auth').filter((r) => r.path === '/accept-invite'),
        <PageSkeleton />,
      ),
    },
    {
      element: <RequireAuth />,
      children: [
        { element: <AuthLayout />, children: toObjects(routesByLayout('auth').filter((r) => r.path === '/choose-society'), <PageSkeleton />) },
        {
          element: <RequirePlatformContext />,
          children: [{ element: <AppShell mode="platform" audiences={['PLATFORM']} />, children: [...toObjects(routesByLayout('platform'), <PageSkeleton />), { path: '/admin/*', element: <NotFoundPage /> }] }],
        },
        {
          element: <RequireSocietyContext />,
          children: [{ element: <AppShell mode="society" audiences={['ADMIN', 'MEMBER', 'GUARD']} />, children: [...toObjects(routesByLayout('society'), <PageSkeleton />), { path: '/app/*', element: <NotFoundPage /> }] }],
        },
        {
          element: <RequireSocietyContext guard />,
          children: [{ element: <GuardLayout />, children: [...toObjects(routesByLayout('guard'), <PageSkeleton />), { path: '/guard/*', element: <NotFoundPage /> }] }],
        },
      ],
    },
    { path: '/app', element: <Navigate to="/app" replace /> },
    { path: '*', element: <Outlet /> },
      ],
    },
  ]);
}

export { routes };
