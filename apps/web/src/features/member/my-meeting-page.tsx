import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CalendarPlus, Check, HelpCircle, X, Video, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDownloadIcs, useGovernanceRealtime, useMeeting, useMeetingRsvp } from '@/hooks/use-governance';
import { cn, formatDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AgendaList, ResolutionList, TypeBadge } from '@/features/governance/meeting-shared';

/** Meeting detail for an invitee: agenda, RSVP, calendar file, published minutes and resolutions. */
export default function MyMeetingPage() {
  const { id = '' } = useParams();
  const meeting = useMeeting(id);
  const rsvp = useMeetingRsvp();
  const ics = useDownloadIcs();
  useGovernanceRealtime();
  if (meeting.isLoading) return <PageSkeleton />;
  if (meeting.isError || !meeting.data) return <ErrorState error={meeting.error} onRetry={() => meeting.refetch()} />;
  const m = meeting.data;
  const answer = (value: string) => rsvp.mutate({ id, rsvp: value }, { onSuccess: () => toast.success('Response saved'), onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={<span className="flex flex-wrap items-center gap-2"><TypeBadge type={m.type} />{m.title}</span>} description={`${m.meetingNumber} · ${formatDateTime(m.scheduledAt)}${m.endAt ? ` – ${formatDateTime(m.endAt)}` : ''}`} actions={<><Button variant="outline" loading={ics.isPending} onClick={() => ics.mutate(m.id, { onError: (e) => toast.error(getErrorMessage(e)) })}><CalendarPlus /> Add to calendar</Button><Button asChild variant="ghost"><Link to="/app/my/meetings"><ArrowLeft /> All meetings</Link></Button></>} />
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="flex flex-wrap gap-2">{m.status !== 'SCHEDULED' ? <StatusBadge status={m.status} /> : null}{m.venue ? <Badge variant="outline"><MapPin className="mr-1 h-3 w-3" />{m.venue}</Badge> : null}{m.meetingLink ? <a href={m.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Video className="h-3.5 w-3.5" /> Join online</a> : null}<Badge variant="outline">{m.audienceLabel}</Badge></p>
          {m.status === 'CANCELLED' ? <p className="rounded-md bg-destructive/10 p-3 text-sm">This meeting was cancelled{m.cancelReason ? `: ${m.cancelReason}` : ''}.</p> : null}
          {m.description ? <p className="whitespace-pre-line text-sm">{m.description}</p> : null}
          {m.status === 'SCHEDULED' ? (
            <div className="rounded-md border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-medium">Will you attend?</p>
              <div className="flex flex-wrap gap-2">
                <Button loading={rsvp.isPending} variant={m.myRsvp === 'YES' ? 'default' : 'outline'} className={cn(m.myRsvp === 'YES' && 'ring-2 ring-primary/40')} onClick={() => answer('YES')}><Check /> Yes</Button>
                <Button loading={rsvp.isPending} variant={m.myRsvp === 'MAYBE' ? 'default' : 'outline'} onClick={() => answer('MAYBE')}><HelpCircle /> Maybe</Button>
                <Button loading={rsvp.isPending} variant={m.myRsvp === 'NO' ? 'default' : 'outline'} onClick={() => answer('NO')}><X /> No</Button>
              </div>
            </div>
          ) : null}
          <div><h3 className="mb-2 text-sm font-semibold">Agenda</h3><AgendaList agenda={m.agenda} showOutcomes={Boolean(m.minutes?.publishedAt)} /></div>
        </CardContent>
      </Card>
      {m.minutes?.publishedAt ? (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Minutes <span className="text-xs font-normal text-muted-foreground">· published {formatDateTime(m.minutes.publishedAt)}</span></CardTitle></CardHeader>
          <CardContent className="space-y-4"><p className="whitespace-pre-line text-sm leading-relaxed">{m.minutes.body}</p>{m.resolutions?.length ? <div><h3 className="mb-2 text-sm font-semibold">Resolutions</h3><ResolutionList resolutions={m.resolutions} /></div> : null}{m.quorum?.eligible ? <p className="text-xs text-muted-foreground">Attendance: {m.quorum.present} of {m.quorum.eligible} · quorum {m.quorum.met ? 'met' : 'not met'}</p> : null}</CardContent>
        </Card>
      ) : m.minutes?.recordedAt ? <p className="mt-4 text-sm text-muted-foreground">Minutes are being finalised.</p> : null}
    </div>
  );
}
