import * as React from 'react';
import { toast } from 'sonner';
import { Plus, CalendarDays, Users, FileText, Send, Pencil, XCircle, Trash2, Download } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ALL_AUDIENCE, useCancelEvent, useCommunityRealtime, useCreateEvent, useDeleteEvent, useEventAttendees, useEventStats, useEventTypes, useEvents, useExportAttendees, usePublishEvent, useUpdateEvent, type AudienceValue } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { formatDateTime, formatStatus, formatTime, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from './audience-picker';

const blank = { title: '', description: '', typeKey: 'COMMUNITY', startAt: '', endAt: '', venue: '', audience: ALL_AUDIENCE as AudienceValue, capacity: '0', maxGuestsPerRsvp: '0', rsvpDeadline: '', allowRsvp: true };

export function EventDialog({ open, onOpenChange, event }: { open: boolean; onOpenChange: (o: boolean) => void; event?: any | null }) {
  const types = useEventTypes();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const [form, setForm] = React.useState<typeof blank>(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(event ? { title: event.title, description: event.description ?? '', typeKey: event.typeKey ?? 'COMMUNITY', startAt: toInputDateTime(event.startAt), endAt: toInputDateTime(event.endAt), venue: event.venue ?? '', audience: { ...ALL_AUDIENCE, ...(event.audience ?? {}) }, capacity: String(event.capacity ?? 0), maxGuestsPerRsvp: String(event.maxGuestsPerRsvp ?? 0), rsvpDeadline: event.rsvpDeadline ? toInputDateTime(event.rsvpDeadline) : '', allowRsvp: event.allowRsvp !== false } : blank);
  }, [open, event]);
  const payload = (publishNow: boolean) => ({ title: form.title, description: form.description || undefined, typeKey: form.typeKey, startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString(), venue: form.venue || undefined, audience: form.audience, capacity: Number(form.capacity) || 0, maxGuestsPerRsvp: Number(form.maxGuestsPerRsvp) || 0, rsvpDeadline: form.rsvpDeadline ? new Date(form.rsvpDeadline).toISOString() : null, allowRsvp: form.allowRsvp, publishNow });
  const done = (msg: string) => ({ onSuccess: () => { toast.success(msg); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) });
  const save = (publishNow: boolean) => { if (event) update.mutate({ id: event.id, ...payload(false) }, done('Event saved')); else create.mutate(payload(publishNow), done(publishNow ? 'Event published' : 'Draft saved')); };
  const valid = form.title.trim().length >= 3 && form.startAt && form.endAt && new Date(form.endAt) > new Date(form.startAt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{event ? `Edit ${event.title}` : 'New event'}</DialogTitle><DialogDescription>Residents in the audience are invited when the event is published and can RSVP until the deadline.</DialogDescription></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="space-y-1.5"><Label htmlFor="ev-title">Title *</Label><Input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ev-desc">Details</Label><Textarea id="ev-desc" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="ev-start">Starts *</Label><Input id="ev-start" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ev-end">Ends *</Label><Input id="ev-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ev-venue">Venue</Label><Input id="ev-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ev-type">Type</Label><Select value={form.typeKey} onValueChange={(v) => setForm({ ...form, typeKey: v })}><SelectTrigger id="ev-type"><SelectValue /></SelectTrigger><SelectContent>{(types.data ?? []).map((t: any) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}{!types.data?.length ? <SelectItem value="COMMUNITY">Community</SelectItem> : null}</SelectContent></Select></div>
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <AudiencePicker value={form.audience} onChange={(audience) => setForm({ ...form, audience })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="ev-cap">Capacity (0 = unlimited)</Label><Input id="ev-cap" type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ev-guests">Guests per household</Label><Input id="ev-guests" type="number" min={0} value={form.maxGuestsPerRsvp} onChange={(e) => setForm({ ...form, maxGuestsPerRsvp: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ev-deadline">RSVP deadline</Label><Input id="ev-deadline" type="datetime-local" value={form.rsvpDeadline} onChange={(e) => setForm({ ...form, rsvpDeadline: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.allowRsvp} onCheckedChange={(v) => setForm({ ...form, allowRsvp: v })} /> Collect RSVPs</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={event ? 'default' : 'outline'} loading={create.isPending || update.isPending} disabled={!valid} onClick={() => save(false)}>{event ? 'Save changes' : 'Save draft'}</Button>
          {!event ? <Button loading={create.isPending} disabled={!valid} onClick={() => save(true)}><Send /> Publish</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttendeesSheet({ event, onClose }: { event: any | null; onClose: () => void }) {
  const attendees = useEventAttendees(event?.id ?? '', Boolean(event));
  const exportRows = useExportAttendees();
  const d = attendees.data;
  return (
    <Sheet open={Boolean(event)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {event ? <>
          <SheetHeader><SheetTitle>{event.title}</SheetTitle><SheetDescription>{formatDateTime(event.startAt)} · {event.venue ?? ''}</SheetDescription></SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md border p-2"><p className="text-lg font-semibold">{event.goingCount}{event.guestsCount ? <span className="text-xs text-muted-foreground"> +{event.guestsCount}</span> : null}</p><p className="text-xs text-muted-foreground">Going</p></div>
            <div className="rounded-md border p-2"><p className="text-lg font-semibold">{event.maybeCount}</p><p className="text-xs text-muted-foreground">Maybe</p></div>
            <div className="rounded-md border p-2"><p className="text-lg font-semibold">{event.capacity ? Math.max(0, event.capacity - event.goingCount - event.guestsCount) : '∞'}</p><p className="text-xs text-muted-foreground">Spots left</p></div>
          </div>
          <div className="mt-3 flex justify-end"><PermissionGate permission="events:export"><Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(event.id, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate></div>
          <ul className="mt-2 divide-y text-sm">{(d?.rsvps ?? []).map((r: any) => <li key={r.id} className="flex items-center justify-between py-2"><span>{r.user?.name ?? '—'}<span className="block text-xs text-muted-foreground">{r.unitCode ?? ''}{r.guests ? ` · +${r.guests} guests` : ''}{r.note ? ` · ${r.note}` : ''}</span></span><StatusBadge status={r.status} /></li>)}{d && !d.rsvps.length ? <li className="py-3 text-muted-foreground">No RSVPs yet.</li> : null}</ul>
        </> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Committee view of events: drafts, publishing, RSVPs and cancellations. */
export default function EventsPage() {
  const { can } = usePermissions();
  const stats = useEventStats();
  const types = useEventTypes();
  const list = useListState({ limit: 20, sort: '-startAt' });
  const events = useEvents(list.params);
  const publish = usePublishEvent();
  const cancel = useCancelEvent();
  const remove = useDeleteEvent();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [attendees, setAttendees] = React.useState<any | null>(null);
  useCommunityRealtime();
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const doCancel = async (ev: any) => { if (await confirm({ title: `Cancel “${ev.title}”?`, description: 'Everyone who RSVP’d is notified.', confirmLabel: 'Cancel event', destructive: true })) cancel.mutate({ id: ev.id }, { onSuccess: () => toast.success('Event cancelled'), onError: err }); };
  const doDelete = async (ev: any) => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(ev.id, { onSuccess: () => toast.success('Deleted'), onError: err }); };
  return (
    <div>
      <PageHeader title="Events" description="Community events, meetings and celebrations with RSVP tracking." actions={<PermissionGate permission="events:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> New event</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Upcoming" value={stats.data?.upcoming ?? 0} icon={<CalendarDays />} loading={stats.isLoading} />
        <StatCard label="Drafts" value={stats.data?.drafts ?? 0} icon={<FileText />} loading={stats.isLoading} />
        <StatCard label="Next event" value={stats.data?.next?.title ?? '—'} hint={stats.data?.next ? `${formatDateTime(stats.data.next.startAt)} · ${stats.data.next.goingCount + stats.data.next.guestsCount} going` : undefined} icon={<Users />} loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Title, venue…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.typeKey ?? ''} onChange={(v) => list.setFilter('typeKey', v)} options={(types.data ?? []).map((t: any) => ({ value: t.key, label: t.name }))} allLabel="All types" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.upcoming === 'true'} onCheckedChange={(v) => list.setFilter('upcoming', v ? 'true' : '')} /> Upcoming only</label>
      </FilterBar>
      <DataTable
        rows={events.data?.items}
        loading={events.isFetching}
        error={events.error}
        onRetry={() => events.refetch()}
        rowKey={(e: any) => e.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(e: any) => setAttendees(e)}
        emptyTitle="No events yet"
        emptyDescription="Plan a get-together, publish it to an audience and watch the RSVPs come in."
        columns={[
          { key: 'title', header: 'Event', cell: (e: any) => <span><span className="font-medium">{e.title}</span><span className="block text-xs text-muted-foreground">{formatStatus(e.typeKey)} · {e.venue ?? 'Venue TBC'} · {e.audienceLabel}</span></span> },
          { key: 'startAt', header: 'When', sortable: true, cell: (e: any) => `${formatDateTime(e.startAt)} – ${formatTime(e.endAt)}` },
          { key: 'goingCount', header: 'RSVPs', sortable: true, hideBelow: 'md', cell: (e: any) => <span>{e.goingCount + e.guestsCount} going{e.capacity ? <Badge variant="outline" className="ml-1">of {e.capacity}</Badge> : null}{e.maybeCount ? <span className="text-xs text-muted-foreground"> · {e.maybeCount} maybe</span> : null}</span> },
          { key: 'status', header: 'Status', sortable: true, cell: (e: any) => <StatusBadge status={e.status} /> },
          { key: 'actions', header: '', cell: (e: any) => <span className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
            {e.status === 'DRAFT' && can('events:create') ? <Button size="sm" variant="ghost" onClick={() => publish.mutate(e.id, { onSuccess: () => toast.success('Published'), onError: err })}><Send /> Publish</Button> : null}
            {['DRAFT', 'PUBLISHED'].includes(e.status) && can('events:update') ? <Button size="sm" variant="ghost" onClick={() => setEditing(e)}><Pencil /></Button> : null}
            {['DRAFT', 'PUBLISHED'].includes(e.status) && can('events:update') ? <Button size="sm" variant="ghost" onClick={() => doCancel(e)}><XCircle /></Button> : null}
            {e.status === 'DRAFT' && can('events:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => doDelete(e)}><Trash2 /></Button> : null}
          </span> },
        ]}
        pagination={events.data ? { page: events.data.page, pages: events.data.pages, total: events.data.total, limit: events.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <EventDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} event={editing === 'new' ? null : editing} />
      <AttendeesSheet event={attendees} onClose={() => setAttendees(null)} />
      {ConfirmElement}
    </div>
  );
}
