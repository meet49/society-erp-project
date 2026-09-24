import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, CalendarDays, FileText, Play, Pencil, XCircle, Send, Vote, CalendarPlus, Users, CheckSquare } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCancelMeeting, useDownloadIcs, useGovernanceRealtime, useMarkAttendance, useMeeting, useMeetingStats, useMeetings, useOpenResolutionVote, usePublishMinutes, useRecordMinutes, useStartMeeting } from '@/hooks/use-governance';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { Combobox } from '@/components/common/combobox';
import { formatDateTime, formatStatus, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AgendaList, MEETING_TYPES, MeetingDialog, ResolutionList, TypeBadge, whenLabel } from './meeting-shared';

function AttendanceTab({ m }: { m: any }) {
  const mark = useMarkAttendance();
  const units = useUnitOptions(['AGM', 'SGM'].includes(m.type));
  const [rows, setRows] = React.useState<any[]>([]);
  const [addUnit, setAddUnit] = React.useState('');
  const [addName, setAddName] = React.useState('');
  React.useEffect(() => { setRows((m.attendees ?? []).map((a: any) => ({ userId: a.userId?.id ?? a.userId?._id ?? a.userId ?? null, unitId: a.unitId?.id ?? a.unitId?._id ?? a.unitId ?? null, name: a.name || a.userId?.name || a.unitId?.code || '', present: Boolean(a.present), proxyFor: a.proxyFor ?? '', rsvp: a.rsvp }))); }, [m.attendees]);
  const save = () => mark.mutate({ id: m.id, attendees: rows.map((r) => ({ userId: r.userId ?? undefined, unitId: r.unitId ?? undefined, name: r.name || undefined, present: r.present, proxyFor: r.proxyFor || undefined })) }, { onSuccess: () => toast.success('Attendance saved'), onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Quorum: {m.quorum?.present ?? 0} of {m.quorum?.eligible ?? 0} {['AGM', 'SGM'].includes(m.type) ? 'units' : 'invitees'} present{m.quorum?.percent ? ` · ${m.quorum.percent}% needed` : ''} · <span className={m.quorum?.met ? 'text-success' : 'text-warning-foreground dark:text-warning'}>{m.quorum?.met ? 'quorum met' : 'quorum not met'}</span></p>
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((r, i) => <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2"><Checkbox checked={r.present} onCheckedChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, present: Boolean(v) } : x)))} /><span className="min-w-0 flex-1 truncate">{r.name}{r.rsvp ? <span className="text-xs text-muted-foreground"> · RSVP {r.rsvp.toLowerCase()}</span> : null}</span><Input className="h-8 w-36" placeholder="Proxy for" value={r.proxyFor} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, proxyFor: e.target.value } : x)))} /></li>)}
        {!rows.length ? <li className="px-3 py-3 text-muted-foreground">No one on the list yet. Add units or names below.</li> : null}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        {['AGM', 'SGM'].includes(m.type) ? <div className="w-56"><Combobox value={addUnit} onChange={(v) => setAddUnit(v ?? '')} options={(units.data ?? []).filter((u: any) => !rows.some((r) => r.unitId === u.value))} placeholder="Add a unit" /></div> : null}
        <Input className="w-48" placeholder="Or a name" value={addName} onChange={(e) => setAddName(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!addUnit && !addName.trim()} onClick={() => { setRows([...rows, { userId: null, unitId: addUnit || null, name: addName || units.data?.find((u: any) => u.value === addUnit)?.label || '', present: true, proxyFor: '' }]); setAddUnit(''); setAddName(''); }}><Plus /> Mark present</Button>
        <Button size="sm" loading={mark.isPending} onClick={save}><CheckSquare /> Save attendance</Button>
      </div>
    </div>
  );
}

function MinutesTab({ m }: { m: any }) {
  const record = useRecordMinutes();
  const publish = usePublishMinutes();
  const openVote = useOpenResolutionVote();
  const [body, setBody] = React.useState('');
  const [outcomes, setOutcomes] = React.useState<Record<string, string>>({});
  const [resolutions, setResolutions] = React.useState<any[]>([]);
  const [complete, setComplete] = React.useState(true);
  const [voteFor, setVoteFor] = React.useState<any | null>(null);
  const [voteEnd, setVoteEnd] = React.useState('');
  React.useEffect(() => { setBody(m.minutes?.body ?? ''); setOutcomes(Object.fromEntries((m.agenda ?? []).map((a: any) => [a.key, a.outcome ?? '']))); setResolutions((m.resolutions ?? []).map((r: any) => ({ ...r }))); }, [m]);
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const save = () => record.mutate({ id: m.id, body, agendaOutcomes: Object.entries(outcomes).filter(([, v]) => v).map(([key, outcome]) => ({ key, outcome })), resolutions: resolutions.filter((r) => r.title?.trim()).map((r) => ({ key: r.key, title: r.title, description: r.description || undefined, proposedBy: r.proposedBy || undefined, secondedBy: r.secondedBy || undefined, votesFor: Number(r.votesFor) || 0, votesAgainst: Number(r.votesAgainst) || 0, abstained: Number(r.abstained) || 0, outcome: r.outcome || 'PENDING' })), complete }, { onSuccess: () => toast.success(complete ? 'Minutes saved · meeting completed' : 'Draft minutes saved'), onError: err });
  return (
    <div className="space-y-4">
      {m.minutes?.publishedAt ? <p className="rounded-md bg-success/10 p-2 text-sm">Published to invitees on {formatDateTime(m.minutes.publishedAt)}.</p> : null}
      <div className="space-y-1.5"><Label htmlFor="mn-body">Minutes</Label><Textarea id="mn-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was discussed and decided…" /></div>
      {m.agenda?.length ? <div className="space-y-2"><Label>Agenda outcomes</Label>{m.agenda.map((a: any) => <div key={a.key} className="grid gap-1 sm:grid-cols-3"><span className="text-sm sm:col-span-1">{a.title}</span><Input className="sm:col-span-2" value={outcomes[a.key] ?? ''} onChange={(e) => setOutcomes({ ...outcomes, [a.key]: e.target.value })} placeholder="Outcome" /></div>)}</div> : null}
      <div className="space-y-2">
        <Label>Resolutions</Label>
        {resolutions.map((r, i) => (
          <div key={r.key ?? i} className="space-y-2 rounded-md border p-3">
            <div className="flex gap-2"><Input value={r.title} placeholder="Resolution" onChange={(e) => setResolutions(resolutions.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />{!r.votingId ? <Button size="sm" variant="ghost" onClick={() => setResolutions(resolutions.filter((_, j) => j !== i))}><XCircle /></Button> : null}</div>
            <div className="grid gap-2 sm:grid-cols-6">
              <Input className="sm:col-span-2" value={r.proposedBy ?? ''} placeholder="Proposed by" onChange={(e) => setResolutions(resolutions.map((x, j) => (j === i ? { ...x, proposedBy: e.target.value } : x)))} />
              <Input type="number" min={0} value={r.votesFor ?? 0} aria-label="For" onChange={(e) => setResolutions(resolutions.map((x, j) => (j === i ? { ...x, votesFor: e.target.value } : x)))} />
              <Input type="number" min={0} value={r.votesAgainst ?? 0} aria-label="Against" onChange={(e) => setResolutions(resolutions.map((x, j) => (j === i ? { ...x, votesAgainst: e.target.value } : x)))} />
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={r.outcome ?? 'PENDING'} onChange={(e) => setResolutions(resolutions.map((x, j) => (j === i ? { ...x, outcome: e.target.value } : x)))}><option value="PENDING">Pending</option><option value="PASSED">Passed</option><option value="FAILED">Failed</option><option value="DEFERRED">Deferred</option></select>
              {r.key && !r.votingId ? <Button size="sm" variant="outline" onClick={() => { setVoteFor(r); setVoteEnd(toInputDateTime(new Date(Date.now() + 3 * 86_400_000))); }}><Vote /> E-vote</Button> : r.votingId ? <Badge variant="info" className="self-center">E-vote linked</Badge> : null}
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setResolutions([...resolutions, { title: '', outcome: 'PENDING', votesFor: 0, votesAgainst: 0, abstained: 0 }])}><Plus /> Resolution</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={complete} onCheckedChange={setComplete} /> Mark the meeting as completed</label>
        <div className="flex gap-2"><Button loading={record.isPending} disabled={!body.trim()} onClick={save}><FileText /> Save minutes</Button>{m.minutes?.body && !m.minutes?.publishedAt ? <Button variant="outline" loading={publish.isPending} onClick={() => publish.mutate(m.id, { onSuccess: () => toast.success('Minutes published'), onError: err })}><Send /> Publish</Button> : null}</div>
      </div>
      <Dialog open={Boolean(voteFor)} onOpenChange={(o) => { if (!o) setVoteFor(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Open an e-vote</DialogTitle></DialogHeader>
          <p className="text-sm">“{voteFor?.title}” goes to the meeting's audience as a formal for / against vote. The result is written back into the minutes.</p>
          <div className="space-y-1.5"><Label htmlFor="ev-end">Voting closes</Label><Input id="ev-end" type="datetime-local" value={voteEnd} onChange={(e) => setVoteEnd(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setVoteFor(null)}>Cancel</Button><Button loading={openVote.isPending} disabled={!voteEnd} onClick={() => openVote.mutate({ id: m.id, resolutionKey: voteFor.key, endAt: new Date(voteEnd).toISOString() }, { onSuccess: () => { toast.success('E-vote opened'); setVoteFor(null); }, onError: err })}><Vote /> Open vote</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeetingSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (m: any) => void }) {
  const meeting = useMeeting(id ?? '');
  const start = useStartMeeting();
  const cancel = useCancelMeeting();
  const ics = useDownloadIcs();
  const { can } = usePermissions();
  const { confirm, ConfirmElement } = useConfirm();
  const m = meeting.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        {m ? <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2"><TypeBadge type={m.type} />{m.title} <StatusBadge status={m.status} /></SheetTitle><SheetDescription>{m.meetingNumber} · {whenLabel(m)} · {m.audienceLabel} · RSVPs: {m.rsvpCounts?.yes ?? 0} yes / {m.rsvpCounts?.maybe ?? 0} maybe / {m.rsvpCounts?.no ?? 0} no</SheetDescription></SheetHeader>
          <div className="my-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={ics.isPending} onClick={() => ics.mutate(m.id, { onError: err })}><CalendarPlus /> Calendar file</Button>
            {m.status === 'SCHEDULED' && can('meetings:update') ? <Button size="sm" variant="outline" onClick={() => onEdit(m)}><Pencil /> Edit</Button> : null}
            {m.status === 'SCHEDULED' && (can('meetings:update') || can('meetings:minutes')) ? <Button size="sm" onClick={() => start.mutate(m.id, { onSuccess: () => toast.success('Meeting started'), onError: err })}><Play /> Start</Button> : null}
            {['SCHEDULED', 'IN_PROGRESS'].includes(m.status) && can('meetings:update') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Cancel “${m.title}”?`, description: 'Invitees are notified.', destructive: true, confirmLabel: 'Cancel meeting' })) cancel.mutate({ id: m.id }, { onSuccess: () => toast.success('Meeting cancelled'), onError: err }); }}><XCircle /> Cancel</Button> : null}
          </div>
          <Tabs defaultValue="agenda">
            <TabsList className="mb-3"><TabsTrigger value="agenda">Agenda</TabsTrigger>{can('meetings:minutes') || can('meetings:update') ? <TabsTrigger value="attendance"><Users className="mr-1 h-3.5 w-3.5" />Attendance</TabsTrigger> : null}{can('meetings:minutes') ? <TabsTrigger value="minutes">Minutes</TabsTrigger> : null}</TabsList>
            <TabsContent value="agenda">{m.description ? <p className="mb-3 text-sm text-muted-foreground">{m.description}</p> : null}<AgendaList agenda={m.agenda} showOutcomes />{m.resolutions?.length ? <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Resolutions</h3><ResolutionList resolutions={m.resolutions} /></div> : null}</TabsContent>
            <TabsContent value="attendance"><AttendanceTab m={m} /></TabsContent>
            <TabsContent value="minutes"><MinutesTab m={m} /></TabsContent>
          </Tabs>
        </> : null}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}

/** Committee view: schedule, run and minute meetings. */
export default function MeetingsPage() {
  const [params, setParams] = useSearchParams();
  const stats = useMeetingStats();
  const list = useListState({ limit: 20, sort: '-scheduledAt' });
  const type = params.get('type') ?? '';
  const meetings = useMeetings({ ...list.params, type: type || undefined });
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useGovernanceRealtime();
  const selected = params.get('meeting');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title={type === 'AGM' ? 'Annual general meetings' : 'Meetings'} description="Committee meetings, AGMs and SGMs with agenda, attendance, quorum, minutes and resolutions." actions={<PermissionGate permission="meetings:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Schedule meeting</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Upcoming" value={stats.data?.upcoming ?? 0} icon={<CalendarDays />} loading={stats.isLoading} />
        <StatCard label="Next meeting" value={stats.data?.next?.title ?? '—'} hint={stats.data?.next ? formatDateTime(stats.data.next.scheduledAt) : undefined} icon={<CalendarDays />} loading={stats.isLoading} />
        <StatCard label="Minutes to publish" value={stats.data?.pendingMinutes ?? 0} icon={<FileText />} tone={(stats.data?.pendingMinutes ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Held this year" value={stats.data?.completedThisYear ?? 0} icon={<CheckSquare />} loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={() => { list.reset(); setParam('type', null); }}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Title, number, venue…" className="w-full sm:w-64" />
        <FilterSelect value={type} onChange={(v) => setParam('type', v)} options={MEETING_TYPES} allLabel="All types" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.upcoming === 'true'} onCheckedChange={(v) => list.setFilter('upcoming', v ? 'true' : '')} /> Upcoming only</label>
      </FilterBar>
      <DataTable
        rows={meetings.data?.items}
        loading={meetings.isFetching}
        error={meetings.error}
        onRetry={() => meetings.refetch()}
        rowKey={(m: any) => m.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(m: any) => setParam('meeting', m.id)}
        emptyTitle="No meetings yet"
        emptyDescription="Schedule a committee meeting or the AGM; invitees get notified and can RSVP."
        columns={[
          { key: 'title', header: 'Meeting', sortable: true, cell: (m: any) => <span><span className="flex items-center gap-2 font-medium"><TypeBadge type={m.type} />{m.title}</span><span className="block text-xs text-muted-foreground">{m.meetingNumber} · {m.audienceLabel}</span></span> },
          { key: 'scheduledAt', header: 'When', sortable: true, cell: (m: any) => whenLabel(m) },
          { key: 'rsvp', header: 'RSVP / present', hideBelow: 'md', cell: (m: any) => `${m.rsvpCounts?.yes ?? 0} yes · ${m.quorum?.present ?? 0}/${m.quorum?.eligible ?? 0} present` },
          { key: 'minutes', header: 'Minutes', hideBelow: 'lg', cell: (m: any) => m.minutes?.publishedAt ? <Badge variant="success">Published</Badge> : m.minutes?.recordedAt ? <Badge variant="warning">Draft</Badge> : <span className="text-muted-foreground">—</span> },
          { key: 'status', header: 'Status', sortable: true, cell: (m: any) => <StatusBadge status={m.status} /> },
        ]}
        pagination={meetings.data ? { page: meetings.data.page, pages: meetings.data.pages, total: meetings.data.total, limit: meetings.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <MeetingDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} meeting={editing === 'new' ? null : editing} />
      <MeetingSheet id={selected} onClose={() => setParam('meeting', null)} onEdit={(m) => { setParam('meeting', null); setEditing(m); }} />
    </div>
  );
}
