import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { ALL_AUDIENCE, type AudienceValue } from '@/hooks/use-community';
import { useCreateMeeting, useUpdateMeeting } from '@/hooks/use-governance';
import { formatDateTime, formatStatus, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from '@/features/community/audience-picker';

export const MEETING_TYPES = [{ value: 'COMMITTEE', label: 'Committee meeting' }, { value: 'AGM', label: 'Annual general meeting' }, { value: 'SGM', label: 'Special general meeting' }, { value: 'OTHER', label: 'Other' }];
const COMMITTEE_AUDIENCE: AudienceValue = { ...ALL_AUDIENCE, type: 'ROLE', roleKeys: ['COMMITTEE', 'SOCIETY_ADMIN'] };

export function whenLabel(m: any) {
  return `${formatDateTime(m.scheduledAt)}${m.venue ? ` · ${m.venue}` : m.mode === 'ONLINE' ? ' · online' : ''}`;
}

export function AgendaList({ agenda, showOutcomes }: { agenda: any[]; showOutcomes?: boolean }) {
  if (!agenda?.length) return <p className="text-sm text-muted-foreground">No agenda yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {agenda.map((a, i) => (
        <li key={a.key ?? i} className="rounded-md border p-3">
          <p className="font-medium">{i + 1}. {a.title}{a.durationMinutes ? <span className="text-xs font-normal text-muted-foreground"> · {a.durationMinutes} min</span> : null}{a.presenter ? <span className="text-xs font-normal text-muted-foreground"> · {a.presenter}</span> : null}</p>
          {a.description ? <p className="text-muted-foreground">{a.description}</p> : null}
          {showOutcomes && a.outcome ? <p className="mt-1 rounded bg-success/10 px-2 py-1 text-xs">Outcome: {a.outcome}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function ResolutionList({ resolutions }: { resolutions: any[] }) {
  if (!resolutions?.length) return null;
  return (
    <ul className="space-y-2 text-sm">
      {resolutions.map((r, i) => (
        <li key={r.key ?? i} className="rounded-md border p-3">
          <p className="flex flex-wrap items-center gap-2 font-medium">{i + 1}. {r.title} <StatusBadge status={r.outcome} /></p>
          {r.description ? <p className="text-muted-foreground">{r.description}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">{r.proposedBy ? `Proposed by ${r.proposedBy}` : ''}{r.secondedBy ? ` · seconded by ${r.secondedBy}` : ''}{r.votesFor || r.votesAgainst || r.abstained ? ` · ${r.votesFor} for, ${r.votesAgainst} against, ${r.abstained} abstained` : ''}{r.votingId ? ' · decided by e-vote' : ''}</p>
        </li>
      ))}
    </ul>
  );
}

const blank = { title: '', type: 'COMMITTEE', description: '', scheduledAt: '', endAt: '', venue: '', mode: 'IN_PERSON', meetingLink: '', audience: COMMITTEE_AUDIENCE as AudienceValue, agenda: [{ title: '', presenter: '', durationMinutes: '' }] as any[], quorumPercent: '' };

/** Schedule / edit dialog with agenda builder. */
export function MeetingDialog({ open, onOpenChange, meeting }: { open: boolean; onOpenChange: (o: boolean) => void; meeting?: any | null }) {
  const create = useCreateMeeting();
  const update = useUpdateMeeting();
  const [form, setForm] = React.useState<typeof blank>(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(meeting ? { title: meeting.title, type: meeting.type, description: meeting.description ?? '', scheduledAt: toInputDateTime(meeting.scheduledAt), endAt: meeting.endAt ? toInputDateTime(meeting.endAt) : '', venue: meeting.venue ?? '', mode: meeting.mode ?? 'IN_PERSON', meetingLink: meeting.meetingLink ?? '', audience: { ...ALL_AUDIENCE, ...(meeting.audience ?? {}) }, agenda: meeting.agenda?.length ? meeting.agenda.map((a: any) => ({ key: a.key, title: a.title, presenter: a.presenter ?? '', durationMinutes: a.durationMinutes ? String(a.durationMinutes) : '' })) : [{ title: '', presenter: '', durationMinutes: '' }], quorumPercent: meeting.quorum?.percent ? String(meeting.quorum.percent) : '' } : blank);
  }, [open, meeting]);
  const setType = (type: string) => setForm({ ...form, type, audience: ['AGM', 'SGM'].includes(type) ? ALL_AUDIENCE : COMMITTEE_AUDIENCE });
  const payload = () => ({ title: form.title, type: form.type, description: form.description || undefined, scheduledAt: new Date(form.scheduledAt).toISOString(), endAt: form.endAt ? new Date(form.endAt).toISOString() : null, venue: form.venue || undefined, mode: form.mode, meetingLink: form.meetingLink || '', audience: form.audience, agenda: form.agenda.filter((a) => a.title.trim()).map((a) => ({ key: a.key, title: a.title, presenter: a.presenter || undefined, durationMinutes: a.durationMinutes ? Number(a.durationMinutes) : undefined })), quorumPercent: form.quorumPercent ? Number(form.quorumPercent) : undefined });
  const submit = () => {
    const done = { onSuccess: () => { toast.success(meeting ? 'Meeting updated' : 'Meeting scheduled'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (meeting) update.mutate({ id: meeting.id, ...payload() }, done); else create.mutate({ ...payload(), notify: true }, done);
  };
  const valid = form.title.trim().length >= 3 && Boolean(form.scheduledAt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{meeting ? `Edit ${meeting.meetingNumber}` : 'Schedule a meeting'}</DialogTitle><DialogDescription>Invitees are notified and can RSVP; the secretary records attendance, minutes and resolutions afterwards.</DialogDescription></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="mt-title">Title *</Label><Input id="mt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="mt-type">Type</Label><Select value={form.type} onValueChange={setType}><SelectTrigger id="mt-type"><SelectValue /></SelectTrigger><SelectContent>{MEETING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="mt-mode">Mode</Label><Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}><SelectTrigger id="mt-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="IN_PERSON">In person</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="HYBRID">Hybrid</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="mt-start">Starts *</Label><Input id="mt-start" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="mt-end">Ends</Label><Input id="mt-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="mt-venue">Venue</Label><Input id="mt-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
              {form.mode !== 'IN_PERSON' ? <div className="space-y-1.5"><Label htmlFor="mt-link">Meeting link</Label><Input id="mt-link" value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} placeholder="https://" /></div> : <div className="space-y-1.5"><Label htmlFor="mt-quorum">Quorum %</Label><Input id="mt-quorum" type="number" min={0} max={100} value={form.quorumPercent} onChange={(e) => setForm({ ...form, quorumPercent: e.target.value })} placeholder="default" /></div>}
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="mt-desc">Notes for invitees</Label><Textarea id="mt-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Agenda</Label>
              {form.agenda.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-6"><Input className="sm:col-span-3" value={a.title} placeholder={`Item ${i + 1}`} aria-label={`Agenda item ${i + 1}`} onChange={(e) => setForm({ ...form, agenda: form.agenda.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Input className="sm:col-span-2" value={a.presenter} placeholder="Presenter" aria-label="Presenter" onChange={(e) => setForm({ ...form, agenda: form.agenda.map((x, j) => (j === i ? { ...x, presenter: e.target.value } : x)) })} /><div className="flex gap-1"><Input type="number" min={0} value={a.durationMinutes} placeholder="min" aria-label="Minutes" onChange={(e) => setForm({ ...form, agenda: form.agenda.map((x, j) => (j === i ? { ...x, durationMinutes: e.target.value } : x)) })} />{form.agenda.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, agenda: form.agenda.filter((_, j) => j !== i) })}><Trash2 /></Button> : null}</div></div>)}
              <Button size="sm" variant="outline" onClick={() => setForm({ ...form, agenda: [...form.agenda, { title: '', presenter: '', durationMinutes: '' }] })}><Plus /> Agenda item</Button>
            </div>
          </div>
          <div className="lg:col-span-2"><AudiencePicker value={form.audience} onChange={(audience) => setForm({ ...form, audience })} /><p className="mt-2 text-xs text-muted-foreground">{['AGM', 'SGM'].includes(form.type) ? 'General meetings invite every unit; quorum counts units present.' : 'Committee meetings invite the committee by default.'}</p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={!valid} onClick={submit}><Send /> {meeting ? 'Save' : 'Schedule & invite'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return <Badge variant={type === 'AGM' || type === 'SGM' ? 'info' : 'outline'}>{formatStatus(type === 'AGM' || type === 'SGM' ? type : type.toLowerCase())}</Badge>;
}
