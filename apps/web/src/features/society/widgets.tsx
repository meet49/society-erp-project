import * as React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, CreditCard, ScrollText, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { HorizontalBars } from '@/components/common/charts';
import { useUnitStats } from '@/hooks/use-units';
import { useSocietyAudit, useSocietyProfile, useInvitations } from '@/hooks/use-society';
import { useSubscription } from '@/hooks/use-access';
import { formatDate, formatRelative, formatStatus } from '@/lib/utils';

/**
 * Dashboard widget registry. Each widget declares the module and permission it needs; the
 * dashboard renders only the widgets the current user can access. Modules append here.
 */
export interface WidgetDefinition {
  key: string;
  module: string;
  permission: string | string[];
  size: 'stat' | 'half' | 'full';
  component: React.ComponentType;
}

function UnitsStatWidget() {
  const stats = useUnitStats();
  const occupied = (stats.data?.byOccupancy?.OWNER_OCCUPIED ?? 0) + (stats.data?.byOccupancy?.TENANT_OCCUPIED ?? 0);
  return <StatCard label="Units" value={stats.data?.total ?? 0} hint={`${occupied} occupied · ${stats.data?.byOccupancy?.VACANT ?? 0} vacant`} icon={<Building2 />} tone="primary" to="/app/units" loading={stats.isLoading} />;
}

function UsersStatWidget() {
  const profile = useSocietyProfile();
  const invites = useInvitations('PENDING');
  return <StatCard label="Users" value={profile.data?.stats?.users ?? 0} hint={`${invites.data?.length ?? 0} pending invitations`} icon={<Users />} to="/app/settings/users" loading={profile.isLoading} />;
}

function SubscriptionStatWidget() {
  const { subscription, daysRemaining, planName, status } = useSubscription();
  return <StatCard label="Subscription" value={<StatusBadge status={status} />} hint={planName ? `${planName} · ${daysRemaining !== null && daysRemaining >= 0 ? `${daysRemaining} days left` : `renews ${formatDate(subscription?.renewalDate)}`}` : undefined} icon={<CreditCard />} tone={status === 'TRIALING' ? 'warning' : 'success'} to="/app/settings/subscription" />;
}

function OccupancyWidget() {
  const stats = useUnitStats();
  const rows = Object.entries(stats.data?.byOccupancy ?? {}).map(([k, v]) => ({ label: formatStatus(k), value: v as number }));
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Occupancy</CardTitle></CardHeader>
      <CardContent>{stats.isLoading ? null : <HorizontalBars data={rows} labelKey="label" valueKey="value" />}</CardContent>
    </Card>
  );
}

function ActivityWidget() {
  const audit = useSocietyAudit({ limit: 8 });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Recent activity</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/settings/audit"><ScrollText /> Audit log</Link></Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {(audit.data?.items ?? []).map((a: any) => (
            <li key={a.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0"><span className="font-medium">{a.actorName ?? formatStatus(a.actorType)}</span> <span className="text-muted-foreground">{a.action.replace(/[._]/g, ' ')}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(a.createdAt)}</span>
            </li>
          ))}
          {!audit.isLoading && !(audit.data?.items ?? []).length ? <li className="text-muted-foreground">No activity yet.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function QuickStartWidget() {
  const profile = useSocietyProfile();
  if (profile.data?.onboarding?.completed) return null;
  return (
    <Card className="border-primary/40 bg-accent/40">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Finish setting up your society</p>
          <p className="text-sm text-muted-foreground">Add buildings and units, configure billing, pick modules and invite your committee.</p>
        </div>
        <Button asChild><Link to="/app/onboarding"><UserPlus /> Open setup wizard</Link></Button>
      </CardContent>
    </Card>
  );
}

export const WIDGETS: WidgetDefinition[] = [
  { key: 'quick-start', module: 'society', permission: ['society:update', 'society:manage_settings'], size: 'full', component: QuickStartWidget },
  { key: 'units-stat', module: 'units', permission: 'units:view', size: 'stat', component: UnitsStatWidget },
  { key: 'users-stat', module: 'society', permission: 'society:manage_users', size: 'stat', component: UsersStatWidget },
  { key: 'subscription-stat', module: 'society', permission: ['society:view_subscription', 'society:manage_subscription'], size: 'stat', component: SubscriptionStatWidget },
  { key: 'occupancy', module: 'units', permission: 'units:view', size: 'half', component: OccupancyWidget },
  { key: 'activity', module: 'society', permission: 'society:view_audit', size: 'half', component: ActivityWidget },
];

export function registerWidgets(list: WidgetDefinition[]): void {
  for (const w of list) if (!WIDGETS.some((x) => x.key === w.key)) WIDGETS.push(w);
}
