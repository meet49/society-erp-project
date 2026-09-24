import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, KeyRound, LogOut, Menu, Settings2, ShieldCheck, ArrowLeftRight, WifiOff, Building2, LifeBuoy } from 'lucide-react';
import type { NavAudience, NavigationGroup } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/ui/avatar';
import { TooltipProvider, SimpleTooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { NotificationBell } from '@/components/common/notification-bell';
import { EmergencyBanner } from '@/components/common/emergency-banner';
import { DynamicIcon } from '@/components/common/icon';
import { useAuth, useLogout, useSwitchContext } from '@/hooks/use-auth';
import { useNavigation, useSubscription, landingPath } from '@/hooks/use-access';
import { useRealtimeNotifications } from '@/hooks/use-notifications';
import { useUiStore } from '@/stores/ui.store';
import { findRoute } from '@/app/routes';
import { cn } from '@/lib/utils';

function navPath(path: string): string {
  return path.split('?')[0];
}

function SidebarNav({ groups, collapsed, onNavigate }: { groups: NavigationGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin">
      {groups.map((g) => {
        const items = g.items.filter((i) => findRoute(navPath(i.path)));
        if (!items.length) return null;
        return (
          <div key={`${g.audience}:${g.key}`}>
            {!collapsed ? <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{g.label}</p> : <div className="mx-2 mb-2 border-t border-sidebar-border" />}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const base = navPath(item.path);
                const active = base === '/app' || base === '/admin' || base === '/guard' || base === '/app/my' ? location.pathname === base : location.pathname === base || location.pathname.startsWith(`${base}/`);
                const link = (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    onClick={onNavigate}
                    className={cn('flex items-center gap-3 rounded-md px-2 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-white', active && 'bg-sidebar-accent text-white', collapsed && 'justify-center px-0')}
                    aria-current={active ? 'page' : undefined}
                  >
                    <DynamicIcon name={item.icon} className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                );
                return <li key={item.key}>{collapsed ? <SimpleTooltip content={item.label} side="right">{link}</SimpleTooltip> : link}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SubscriptionBanner() {
  const { subscription, isTrial, isReadOnly, isBlocked, daysRemaining, planName, status } = useSubscription();
  if (!subscription) return null;
  if (isBlocked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
        <span>Your subscription is {status.toLowerCase().replace('_', ' ')}. The workspace is locked until it is renewed.</span>
        <Button asChild size="sm" variant="secondary">
          <Link to="/app/settings/subscription">Manage subscription</Link>
        </Button>
      </div>
    );
  }
  if (isReadOnly) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-warning px-4 py-2 text-sm text-warning-foreground">
        <span>Payment overdue. The workspace is read-only until the payment is received.</span>
        <Button asChild size="sm" variant="secondary">
          <Link to="/app/settings/subscription">Pay now</Link>
        </Button>
      </div>
    );
  }
  if (isTrial && daysRemaining !== null && daysRemaining <= 7) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground">
        <span>
          Your {planName ?? ''} trial ends in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}.
        </span>
        <Button asChild size="sm">
          <Link to="/app/settings/subscription">Choose a plan</Link>
        </Button>
      </div>
    );
  }
  return null;
}

function UserMenu({ mode }: { mode: 'platform' | 'society' }) {
  const { context, user } = useAuth();
  const logout = useLogout();
  const switchCtx = useSwitchContext();
  const navigate = useNavigate();
  const societies = user?.societies ?? [];
  const canGoPlatform = user?.isPlatformAdmin && mode !== 'platform';
  const otherSocieties = societies.filter((s) => s.id !== context?.society?.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
          <UserAvatar name={user?.name} src={user?.avatarUrl} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(mode === 'platform' ? '/admin/profile' : '/app/profile')}>
          <Settings2 /> Account settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(mode === 'platform' ? '/admin/profile?tab=security' : '/app/profile?tab=security')}>
          <KeyRound /> Password & sessions
        </DropdownMenuItem>
        {mode === 'society' ? (
          <DropdownMenuItem onClick={() => navigate('/app/support')}>
            <LifeBuoy /> Support
          </DropdownMenuItem>
        ) : null}
        {(canGoPlatform || otherSocieties.length > 0) && <DropdownMenuSeparator />}
        {canGoPlatform ? (
          <DropdownMenuItem onClick={() => switchCtx.mutate({ platform: true }, { onSuccess: () => navigate('/admin') })}>
            <ShieldCheck /> Platform console
          </DropdownMenuItem>
        ) : null}
        {otherSocieties.slice(0, 5).map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => switchCtx.mutate({ societyId: s.id }, { onSuccess: (data) => navigate(landingPath(data.context.landing, true, false)) })}>
            <ArrowLeftRight /> {s.name}
          </DropdownMenuItem>
        ))}
        {mode === 'platform' && societies.length > 0 ? (
          <DropdownMenuItem onClick={() => navigate('/choose-society')}>
            <Building2 /> Open a society workspace
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ mode, audiences }: { mode: 'platform' | 'society'; audiences: NavAudience[] }) {
  const { context } = useAuth();
  const groups = useNavigation(audiences);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const online = useUiStore((s) => s.online);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const route = findRoute(location.pathname);
  useRealtimeNotifications();
  const title = mode === 'platform' ? 'Platform console' : context?.society?.name ?? 'Society';

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-16 items-center gap-2 border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <img src={context?.society?.logoUrl ?? '/favicon.svg'} alt="" className="h-8 w-8 rounded-md" />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">{mode === 'platform' ? 'Society ERP' : context?.subscription?.planName ?? ''}</p>
          </div>
        ) : null}
      </div>
      <SidebarNav groups={groups} collapsed={collapsed} onNavigate={onNavigate} />
      <div className="hidden border-t border-sidebar-border p-2 md:block">
        <Button variant="ghost" size="sm" className="w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          {!collapsed ? <span>Collapse</span> : null}
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen">
        <aside className={cn('sticky top-0 hidden h-screen shrink-0 transition-[width] md:block', collapsed ? 'w-16' : 'w-64')}>{sidebar()}</aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebar(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{route?.title ?? title}</p>
              {mode === 'society' && context?.society ? <p className="truncate text-xs text-muted-foreground md:hidden">{context.society.name}</p> : null}
            </div>
            {!online ? (
              <Badge variant="warning" className="gap-1">
                <WifiOff className="h-3 w-3" /> Offline
              </Badge>
            ) : null}
            {mode === 'society' && context?.subscription?.status === 'TRIALING' ? <Badge variant="info">Trial</Badge> : null}
            <NotificationBell />
            <ThemeToggle />
            <UserMenu mode={mode} />
          </header>
          {mode === 'society' ? <SubscriptionBanner /> : null}
          {context?.user.mustChangePassword ? (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground">
              <span>You are using a temporary password. Please set a new one.</span>
              <Button asChild size="sm" variant="secondary">
                <Link to={mode === 'platform' ? '/admin/profile?tab=security' : '/app/profile?tab=security'}>Change password</Link>
              </Button>
            </div>
          ) : null}
          <EmergencyBanner />
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
