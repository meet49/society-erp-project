import { Link } from 'react-router-dom';
import { DoorOpen, Package, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { registerWidgets } from '@/features/society/widgets';
import { useDeliveryStats, useVisitorStats, useVisitors } from '@/hooks/use-visitors';
import { formatRelative, formatStatus, formatTime } from '@/lib/utils';

function VisitorsStatWidget() {
  const stats = useVisitorStats();
  return <StatCard label="Visitors inside" value={stats.data?.inside ?? 0} hint={`${stats.data?.today ?? 0} checked in today · ${stats.data?.pending ?? 0} awaiting approval`} icon={<DoorOpen />} tone={(stats.data?.pending ?? 0) > 0 ? 'warning' : 'default'} to="/app/visitors" loading={stats.isLoading} />;
}

function DeliveriesStatWidget() {
  const stats = useDeliveryStats();
  return <StatCard label="Parcels at the gate" value={stats.data?.held ?? 0} hint={`${stats.data?.today ?? 0} arrived today`} icon={<Package />} to="/app/deliveries" loading={stats.isLoading} />;
}

function RecentVisitorsWidget() {
  const visitors = useVisitors({ limit: 6, sort: '-createdAt' });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Latest at the gate</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/visitors">All visitors <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {(visitors.data?.items ?? []).map((v: any) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="truncate font-medium">{v.name} <span className="text-xs font-normal text-muted-foreground">· {formatStatus(v.categoryKey)} · {v.unitId?.code ?? '—'}</span></p><p className="text-xs text-muted-foreground">{v.checkInAt ? `In ${formatTime(v.checkInAt)}` : formatRelative(v.createdAt)}</p></div>
              <StatusBadge status={v.status} />
            </li>
          ))}
          {!visitors.isLoading && !(visitors.data?.items ?? []).length ? <li className="py-3 text-muted-foreground">No visitors yet.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'visitors-inside', module: 'visitors', permission: 'visitors:view', size: 'stat', component: VisitorsStatWidget },
  { key: 'deliveries-held', module: 'delivery', permission: 'delivery:view', size: 'stat', component: DeliveriesStatWidget },
  { key: 'visitors-recent', module: 'visitors', permission: 'visitors:view', size: 'half', component: RecentVisitorsWidget },
]);
