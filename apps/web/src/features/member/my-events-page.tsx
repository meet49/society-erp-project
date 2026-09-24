import * as React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { FilterBar } from '@/components/common/search-input';
import { useCommunityRealtime, useEvents } from '@/hooks/use-community';
import { cn, formatDate, formatStatus, formatTime } from '@/lib/utils';

/** Resident view: upcoming events I'm invited to, with my RSVP state. */
export default function MyEventsPage() {
  const [past, setPast] = React.useState(false);
  const events = useEvents({ limit: 50, upcoming: past ? undefined : 'true', sort: past ? '-startAt' : 'startAt' });
  useCommunityRealtime();
  const items: any[] = events.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Events" description="What's happening in your society." />
      <FilterBar onReset={() => setPast(false)}><label className="flex items-center gap-2 text-sm"><Switch checked={past} onCheckedChange={setPast} /> Include past events</label></FilterBar>
      {events.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<CalendarDays />} title="Nothing scheduled" description="Events published by the committee show up here." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((e) => (
            <Card key={e.id} className={cn(e.status === 'CANCELLED' && 'opacity-60')}>
              <CardContent className="p-4">
                <Link to={`/app/my/events/${e.id}`} className="block">
                  <div className="flex items-start gap-3">
                    <div className="flex w-14 shrink-0 flex-col items-center rounded-md border bg-muted/40 py-1"><span className="text-xs uppercase text-muted-foreground">{formatDate(e.startAt, 'MMM')}</span><span className="text-xl font-bold leading-none">{formatDate(e.startAt, 'DD')}</span><span className="text-[10px] text-muted-foreground">{formatDate(e.startAt, 'ddd')}</span></div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{e.title}{e.status !== 'PUBLISHED' ? <StatusBadge status={e.status} /> : null}{e.myRsvp ? <Badge variant={e.myRsvp.status === 'GOING' ? 'success' : e.myRsvp.status === 'MAYBE' ? 'warning' : 'muted'}>{formatStatus(e.myRsvp.status)}</Badge> : null}</p>
                      <p className="text-sm text-muted-foreground">{formatTime(e.startAt)} – {formatTime(e.endAt)}{e.venue ? <span className="inline-flex items-center gap-1"> · <MapPin className="h-3 w-3" />{e.venue}</span> : null}</p>
                      <p className="text-xs text-muted-foreground"><Users className="mr-1 inline h-3 w-3" />{e.goingCount + e.guestsCount} going{e.capacity ? ` · ${Math.max(0, e.capacity - e.goingCount - e.guestsCount)} spots left` : ''} · {formatStatus(e.typeKey)}</p>
                    </div>
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
