import { NavLink } from 'react-router-dom';
import { useNavigation } from '@/hooks/use-access';
import { findRoute } from '@/app/routes';
import { cn } from '@/lib/utils';

/** Horizontal sub-navigation for the settings area, driven by the same server navigation. */
export function SettingsNav() {
  const groups = useNavigation(['ADMIN']);
  const items = groups.find((g) => g.key === 'settings')?.items.filter((i) => findRoute(i.path.split('?')[0])) ?? [];
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b pb-px scrollbar-thin" aria-label="Settings sections">
      {items.map((i) => (
        <NavLink key={i.key} to={i.path} end={i.path === '/app/settings'} className={({ isActive }) => cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm', isActive ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
