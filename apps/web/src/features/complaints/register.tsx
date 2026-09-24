import { Link } from 'react-router-dom';
import { MessageSquareWarning, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { registerWidgets } from '@/features/society/widgets';
import { useComplaintStats, useComplaints } from '@/hooks/use-complaints';
import { formatRelative, formatStatus } from '@/lib/utils';

function OpenComplaintsWidget() {
  const stats = useComplaintStats();
  return <StatCard label="Open complaints" value={stats.data?.open ?? 0} hint={`${stats.data?.breached ?? 0} past SLA · ${stats.data?.unassigned ?? 0} unassigned`} icon={(stats.data?.breached ?? 0) > 0 ? <AlertTriangle /> : <MessageSquareWarning />} tone={(stats.data?.breached ?? 0) > 0 ? 'warning' : 'default'} to="/app/complaints?openOnly=true" loading={stats.isLoading} />;
}

function RecentComplaintsWidget() {
  const complaints = useComplaints({ limit: 6, sort: '-createdAt', openOnly: 'true' });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Open complaints</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/complaints">All complaints <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {(complaints.data?.items ?? []).map((c: any) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><Link to={`/app/complaints/${c.id}`} className="font-medium hover:underline">{c.ticketNumber}</Link><p className="truncate text-xs text-muted-foreground">{c.title} · {c.unitId?.code ?? 'Common'} · {formatRelative(c.createdAt)}</p></div>
              <span className="flex shrink-0 items-center gap-1"><Badge variant="outline">{formatStatus(c.priority)}</Badge><StatusBadge status={c.status} /></span>
            </li>
          ))}
          {!complaints.isLoading && !(complaints.data?.items ?? []).length ? <li className="py-3 text-muted-foreground">Nothing open right now.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'complaints-open', module: 'complaints', permission: 'complaints:view', size: 'stat', component: OpenComplaintsWidget },
  { key: 'complaints-recent', module: 'complaints', permission: 'complaints:view', size: 'half', component: RecentComplaintsWidget },
]);
