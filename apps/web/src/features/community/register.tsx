import { Link } from 'react-router-dom';
import { Megaphone, ArrowRight, Pin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/common/stat-card';
import { registerWidgets } from '@/features/society/widgets';
import { useEvents, useNoticeStats, useNotices } from '@/hooks/use-community';
import { formatDate, formatRelative, formatTime } from '@/lib/utils';

function NoticesStatWidget() {
  const stats = useNoticeStats();
  return <StatCard label="Live notices" value={stats.data?.published ?? 0} hint={`${stats.data?.scheduled ?? 0} scheduled · read rate ${stats.data?.readRate != null ? `${stats.data.readRate}%` : '—'}`} icon={<Megaphone />} to="/app/notices" loading={stats.isLoading} />;
}

function UpcomingEventsWidget() {
  const events = useEvents({ limit: 4, upcoming: 'true', sort: 'startAt' });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">Upcoming events</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/app/events">All events <ArrowRight /></Link></Button></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {(events.data?.items ?? []).map((e: any) => <li key={e.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="font-medium">{e.title}</span><span className="block truncate text-xs text-muted-foreground">{formatDate(e.startAt, 'ddd DD MMM')} {formatTime(e.startAt)} · {e.venue ?? ''}</span></span><Badge variant="outline">{e.goingCount + e.guestsCount} going</Badge></li>)}
          {!events.isLoading && !(events.data?.items ?? []).length ? <li className="py-3 text-muted-foreground">Nothing scheduled.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Residents' home: latest notices addressed to them. */
function MyNoticesWidget() {
  const notices = useNotices({ limit: 4 });
  const items: any[] = notices.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">Notices</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/app/my/notices">All notices <ArrowRight /></Link></Button></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((n) => <li key={n.id} className="py-2"><Link to={`/app/my/notices/${n.id}`} className="flex items-center gap-2 font-medium hover:underline">{n.isPinned ? <Pin className="h-3 w-3 text-primary" /> : null}{n.title}{!n.read ? <Badge variant="info">New</Badge> : null}</Link><p className="text-xs text-muted-foreground">{formatRelative(n.publishedAt)}</p></li>)}
          {!notices.isLoading && !items.length ? <li className="py-3 text-muted-foreground">No notices yet.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'notices-live', module: 'notices', permission: ['notices:create', 'notices:publish'], size: 'stat', component: NoticesStatWidget },
  { key: 'events-upcoming', module: 'events', permission: ['events:create', 'events:update'], size: 'half', component: UpcomingEventsWidget },
  { key: 'my-notices', module: 'notices', permission: 'notices:view', size: 'half', component: MyNoticesWidget },
]);
