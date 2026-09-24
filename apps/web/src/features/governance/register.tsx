import { Link } from 'react-router-dom';
import { Presentation, CheckSquare, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/common/stat-card';
import { registerWidgets } from '@/features/society/widgets';
import { useMeetingStats, useVotings } from '@/hooks/use-governance';
import { formatDateTime, formatRelative } from '@/lib/utils';

function NextMeetingWidget() {
  const stats = useMeetingStats();
  return <StatCard label="Next meeting" value={stats.data?.next?.title ?? '—'} hint={stats.data?.next ? formatDateTime(stats.data.next.scheduledAt) : `${stats.data?.upcoming ?? 0} upcoming`} icon={<Presentation />} to="/app/meetings" loading={stats.isLoading} />;
}

function OpenVotesWidget() {
  const votings = useVotings({ limit: 5, status: 'OPEN' });
  const items: any[] = votings.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">Open votes</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/app/my/voting">Vote <ArrowRight /></Link></Button></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((v) => <li key={v.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="font-medium">{v.title}</span><span className="block text-xs text-muted-foreground">{v.endAt ? `Closes ${formatRelative(v.endAt)}` : 'Open'}{v.myBallot ? ' · you have voted' : ''}</span></span><CheckSquare className="h-4 w-4 text-muted-foreground" /></li>)}
          {!votings.isLoading && !items.length ? <li className="py-3 text-muted-foreground">Nothing open right now.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'meetings-next', module: 'meetings', permission: ['meetings:create', 'meetings:update'], size: 'stat', component: NextMeetingWidget },
  { key: 'voting-open', module: 'voting', permission: 'voting:vote', size: 'half', component: OpenVotesWidget },
]);
