import * as React from 'react';
import { Link } from 'react-router-dom';
import { Presentation, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { FilterBar } from '@/components/common/search-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useGovernanceRealtime, useMeetings } from '@/hooks/use-governance';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { TypeBadge } from '@/features/governance/meeting-shared';

/** Resident view: meetings I'm invited to, with my RSVP and published minutes. */
export default function MyMeetingsPage() {
  const [past, setPast] = React.useState(false);
  const meetings = useMeetings({ limit: 50, upcoming: past ? undefined : 'true', sort: past ? '-scheduledAt' : 'scheduledAt' });
  useGovernanceRealtime();
  const items: any[] = meetings.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Meetings" description="General meetings and committee meetings you're invited to." />
      <FilterBar onReset={() => setPast(false)}><label className="flex items-center gap-2 text-sm"><Switch checked={past} onCheckedChange={setPast} /> Include past meetings</label></FilterBar>
      {meetings.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<Presentation />} title="No meetings" description="You'll be notified when a meeting is scheduled for you." /> : (
        <div className="space-y-2">
          {items.map((m) => (
            <Card key={m.id} className={cn(m.status === 'CANCELLED' && 'opacity-60')}>
              <CardContent className="p-4">
                <Link to={`/app/my/meetings/${m.id}`} className="flex items-start gap-3">
                  <div className="flex w-14 shrink-0 flex-col items-center rounded-md border bg-muted/40 py-1"><span className="text-xs uppercase text-muted-foreground">{formatDate(m.scheduledAt, 'MMM')}</span><span className="text-xl font-bold leading-none">{formatDate(m.scheduledAt, 'DD')}</span></div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold"><TypeBadge type={m.type} />{m.title}{m.status !== 'SCHEDULED' ? <StatusBadge status={m.status} /> : null}{m.myRsvp ? <Badge variant={m.myRsvp === 'YES' ? 'success' : m.myRsvp === 'MAYBE' ? 'warning' : 'muted'}>{m.myRsvp === 'YES' ? 'Attending' : m.myRsvp === 'MAYBE' ? 'Maybe' : 'Not attending'}</Badge> : null}{m.minutes?.publishedAt ? <Badge variant="info">Minutes available</Badge> : null}</p>
                    <p className="text-sm text-muted-foreground">{formatTime(m.scheduledAt)}{m.venue ? <span className="inline-flex items-center gap-1"> · <MapPin className="h-3 w-3" />{m.venue}</span> : m.mode === 'ONLINE' ? ' · online' : ''}</p>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
