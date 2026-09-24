import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, Users, CalendarDays, Check, HelpCircle, X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCommunityRealtime, useEvent, useRsvp } from '@/hooks/use-community';
import { cn, formatDateTime, formatStatus, formatTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Event detail with RSVP (going / maybe / not going, guests). */
export default function MyEventPage() {
  const { id = '' } = useParams();
  const event = useEvent(id);
  const rsvp = useRsvp();
  const [guests, setGuests] = React.useState('0');
  useCommunityRealtime();
  React.useEffect(() => { if (event.data?.myRsvp) setGuests(String(event.data.myRsvp.guests ?? 0)); }, [event.data?.myRsvp]);
  if (event.isLoading) return <PageSkeleton />;
  if (event.isError || !event.data) return <ErrorState error={event.error} onRetry={() => event.refetch()} />;
  const e = event.data;
  const open = e.status === 'PUBLISHED' && e.allowRsvp && (!e.rsvpDeadline || new Date(e.rsvpDeadline) > new Date()) && new Date(e.endAt) > new Date();
  const answer = (status: string) => rsvp.mutate({ id, status, guests: status === 'GOING' ? Number(guests) || 0 : 0 }, { onSuccess: () => toast.success(status === 'GOING' ? 'See you there!' : 'Response saved'), onError: (err) => toast.error(getErrorMessage(err)) });
  const mine = e.myRsvp?.status;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={e.title} description={`${formatStatus(e.typeKey)} · ${e.audienceLabel}`} actions={<Button asChild variant="ghost"><Link to="/app/my/events"><ArrowLeft /> All events</Link></Button>} />
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="flex flex-wrap gap-2"><Badge variant="outline"><CalendarDays className="mr-1 h-3 w-3" />{formatDateTime(e.startAt)} – {formatTime(e.endAt)}</Badge>{e.venue ? <Badge variant="outline"><MapPin className="mr-1 h-3 w-3" />{e.venue}</Badge> : null}<Badge variant="outline"><Users className="mr-1 h-3 w-3" />{e.goingCount + e.guestsCount} going{e.spotsLeft != null ? ` · ${e.spotsLeft} spots left` : ''}</Badge>{e.status !== 'PUBLISHED' ? <StatusBadge status={e.status} /> : null}</p>
          {e.status === 'CANCELLED' ? <p className="rounded-md bg-destructive/10 p-3 text-sm">This event was cancelled{e.cancelReason ? `: ${e.cancelReason}` : ''}.</p> : null}
          {e.description ? <div className="whitespace-pre-line text-sm leading-relaxed">{e.description}</div> : null}
          {open ? (
            <PermissionGate permission="events:rsvp">
              <SubscriptionGate>
                <div className="rounded-md border bg-muted/40 p-4">
                  <p className="mb-3 text-sm font-medium">Will you come?{e.rsvpDeadline ? <span className="font-normal text-muted-foreground"> RSVP by {formatDateTime(e.rsvpDeadline)}.</span> : null}</p>
                  <div className="flex flex-wrap items-end gap-3">
                    {e.maxGuestsPerRsvp > 0 ? <div className="space-y-1.5"><Label htmlFor="rsvp-guests">Guests (max {e.maxGuestsPerRsvp})</Label><Input id="rsvp-guests" type="number" min={0} max={e.maxGuestsPerRsvp} className="w-28" value={guests} onChange={(ev) => setGuests(ev.target.value)} /></div> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button loading={rsvp.isPending} variant={mine === 'GOING' ? 'default' : 'outline'} className={cn(mine === 'GOING' && 'ring-2 ring-primary/40')} onClick={() => answer('GOING')} disabled={e.spotsLeft === 0 && mine !== 'GOING'}><Check /> Going</Button>
                      <Button loading={rsvp.isPending} variant={mine === 'MAYBE' ? 'default' : 'outline'} onClick={() => answer('MAYBE')}><HelpCircle /> Maybe</Button>
                      <Button loading={rsvp.isPending} variant={mine === 'NOT_GOING' ? 'default' : 'outline'} onClick={() => answer('NOT_GOING')}><X /> Can't make it</Button>
                    </div>
                  </div>
                  {e.spotsLeft === 0 && mine !== 'GOING' ? <p className="mt-2 text-xs text-muted-foreground">The event is full. You can still mark “maybe” in case a spot frees up.</p> : null}
                </div>
              </SubscriptionGate>
            </PermissionGate>
          ) : null}
        </CardContent>
      </Card>
      {e.attendeesVisible && e.attendees?.length ? (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Who's coming</CardTitle></CardHeader>
          <CardContent><ul className="flex flex-wrap gap-2 text-sm">{e.attendees.map((a: any) => <li key={a.id} className={cn('rounded-full border px-3 py-1', a.status === 'MAYBE' && 'border-dashed text-muted-foreground')}>{a.name}{a.unitCode ? <span className="text-muted-foreground"> · {a.unitCode}</span> : null}{a.guests ? <span className="text-muted-foreground"> +{a.guests}</span> : null}</li>)}</ul></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
