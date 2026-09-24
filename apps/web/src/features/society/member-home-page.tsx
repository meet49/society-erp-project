import { Link } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DynamicIcon } from '@/components/common/icon';
import { EmptyState } from '@/components/common/empty-state';
import { useAuth } from '@/hooks/use-auth';
import { useNavigation } from '@/hooks/use-access';
import { useMarkRead, useNotifications } from '@/hooks/use-notifications';
import { findRoute } from '@/app/routes';
import { useAccessibleModules, usePermissions } from '@/hooks/use-access';
import { useUnitBalance } from '@/hooks/use-billing';
import { formatRelative, cn, formatCurrency } from '@/lib/utils';

/** Outstanding dues for the member's primary unit, with a shortcut to pay. */
function DuesBanner() {
  const { context } = useAuth();
  const { hasModule } = useAccessibleModules();
  const { can } = usePermissions();
  const unitId = context?.resident?.primaryUnitId ?? context?.resident?.unitIds?.[0] ?? '';
  const enabled = Boolean(unitId) && hasModule('billing') && can('billing:view_own');
  const balance = useUnitBalance(enabled ? unitId : '');
  if (!enabled || balance.isLoading || !balance.data) return null;
  const due = balance.data.balance;
  return (
    <div className={cn('mb-6 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between', due > 0 ? 'border-warning/50 bg-warning/10' : 'bg-card')}>
      <div>
        <p className="text-sm font-medium">{due > 0 ? 'Maintenance dues pending' : due < 0 ? 'You have an advance balance' : 'No dues pending'}</p>
        <p className="text-2xl font-semibold tabular">{formatCurrency(Math.abs(due))}</p>
      </div>
      <Button asChild variant={due > 0 ? 'default' : 'outline'}><Link to="/app/my/bills">{due > 0 ? 'View & pay' : 'View bills'} <ChevronRight /></Link></Button>
    </div>
  );
}

/** Resident self-service home: quick links to every self-service area the member can use, plus recent notifications. */
export default function MemberHomePage() {
  const { context } = useAuth();
  const groups = useNavigation(['MEMBER']);
  const items = groups.flatMap((g) => g.items).filter((i) => i.path !== '/app/my' && findRoute(i.path.split('?')[0]));
  const notifications = useNotifications({ limit: 8 });
  const markRead = useMarkRead();
  return (
    <div>
      <PageHeader title={`Hello, ${context?.user.name?.split(' ')[0] ?? ''}`} description={context?.society?.name} />
      <DuesBanner />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-sm font-semibold">Your services</h2>
          {items.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((i) => (
                <Link key={i.key} to={i.path} className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><DynamicIcon name={i.icon} className="h-5 w-5" /></div>
                  <span className="flex-1 text-sm font-medium">{i.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No services enabled yet" description="Your society has not enabled resident self-service modules yet. Check back soon." />
          )}
        </div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm"><Bell className="h-4 w-4" /> Notifications</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/app/profile">Preferences</Link></Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {(notifications.data?.items ?? []).map((n) => (
                <li key={n.id}>
                  <Link to={n.link ?? '#'} onClick={() => !n.readAt && markRead.mutate(n.id)} className={cn('block py-2', !n.readAt && 'font-medium')}>
                    <p className="text-sm">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
                  </Link>
                </li>
              ))}
              {!notifications.isLoading && !(notifications.data?.items ?? []).length ? <li className="py-4 text-sm text-muted-foreground">Nothing new.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
