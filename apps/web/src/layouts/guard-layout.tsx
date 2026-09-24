import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DynamicIcon } from '@/components/common/icon';
import { EmergencyBanner } from '@/components/common/emergency-banner';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { useNavigation } from '@/hooks/use-access';
import { useRealtimeNotifications } from '@/hooks/use-notifications';
import { useUiStore } from '@/stores/ui.store';
import { findRoute } from '@/app/routes';
import { cn } from '@/lib/utils';

/** Mobile-first shell for security guards: large touch targets, bottom navigation, offline indicator. */
export function GuardLayout() {
  const { context } = useAuth();
  const groups = useNavigation(['GUARD']);
  const logout = useLogout();
  const navigate = useNavigate();
  const online = useUiStore((s) => s.online);
  const location = useLocation();
  useRealtimeNotifications();
  const items = groups.flatMap((g) => g.items).filter((i) => findRoute(i.path.split('?')[0]));
  const primary = items.slice(0, 5);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{context?.society?.name}</p>
          <p className="truncate text-xs text-muted-foreground">Gate · {context?.user.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!online ? (
            <span className="flex items-center gap-1 rounded-full bg-warning/20 px-2 py-1 text-xs text-warning-foreground dark:text-warning">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}>
            <LogOut />
          </Button>
        </div>
      </header>
      <EmergencyBanner guard />
      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background safe-bottom" aria-label="Gate navigation">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, primary.length)}, minmax(0, 1fr))` }}>
          {primary.map((item) => {
            const base = item.path.split('?')[0];
            const active = base === '/guard' ? location.pathname === base : location.pathname.startsWith(base);
            return (
              <li key={item.key}>
                <NavLink to={item.path} className={cn('flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground', active && 'text-primary')} aria-current={active ? 'page' : undefined}>
                  <DynamicIcon name={item.icon} className="h-6 w-6" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
