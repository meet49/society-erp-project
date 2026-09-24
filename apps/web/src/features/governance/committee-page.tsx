import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Landmark, Phone, Mail, Pencil, UserMinus, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAddCommitteeMember, useCommitteeOverview, useCommitteePositions, useCompleteHandover, useGovernanceRealtime, useRemoveCommitteeMember, useStartHandover, useTickHandover, useUpdateCommitteeMember } from '@/hooks/use-governance';
import { useSocietyUsers } from '@/hooks/use-society';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatDate, formatDateTime, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const blank = { userId: '', unitId: '', name: '', positionKey: '', phone: '', email: '', showContactToMembers: false, termStart: '', termEnd: '', status: 'ACTIVE', notes: '' };

function MemberDialog({ open, onOpenChange, member, incoming }: { open: boolean; onOpenChange: (o: boolean) => void; member?: any | null; incoming?: boolean }) {
  const positions = useCommitteePositions();
  const users = useSocietyUsers({ limit: 200 });
  const units = useUnitOptions(open);
  const add = useAddCommitteeMember();
  const update = useUpdateCommitteeMember();
  const [form, setForm] = React.useState(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(member ? { userId: member.userId?.id ?? member.userId?._id ?? '', unitId: member.unitId?.id ?? member.unitId?._id ?? '', name: member.name, positionKey: member.positionKey, phone: member.phone ?? '', email: member.email ?? '', showContactToMembers: Boolean(member.showContactToMembers), termStart: member.termStart ? toInputDate(member.termStart) : '', termEnd: member.termEnd ? toInputDate(member.termEnd) : '', status: member.status, notes: member.notes ?? '' } : { ...blank, status: incoming ? 'INCOMING' : 'ACTIVE' });
  }, [open, member, incoming]);
  const submit = () => {
    const payload = { userId: form.userId || null, unitId: form.unitId || null, name: form.name, positionKey: form.positionKey, phone: form.phone || undefined, email: form.email || '', showContactToMembers: form.showContactToMembers, termStart: form.termStart ? new Date(form.termStart).toISOString() : null, termEnd: form.termEnd ? new Date(form.termEnd).toISOString() : null, status: form.status, notes: form.notes || undefined };
    const done = { onSuccess: () => { toast.success(member ? 'Updated' : 'Added to the committee'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (member) update.mutate({ id: member.id, ...payload }, done); else add.mutate(payload, done);
  };
  const pickUser = (id: string | null) => { const m = (users.data?.items ?? []).find((u: any) => (u.user?.id ?? u.userId) === id); setForm({ ...form, userId: id ?? '', name: form.name || m?.user?.name || '', email: form.email || m?.user?.email || '' }); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{member ? `Edit ${member.name}` : incoming ? 'Add incoming member' : 'Add committee member'}</DialogTitle><DialogDescription>Link a login so the member gets committee notifications; contact details stay private unless you allow residents to see them.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Login (optional)</Label><Combobox value={form.userId} onChange={pickUser} options={(users.data?.items ?? []).map((u: any) => ({ value: u.user?.id ?? u.userId, label: u.user?.name ?? '—', description: u.user?.email }))} placeholder="Pick a member" /></div>
          <div className="space-y-1.5"><Label htmlFor="cm-pos">Position *</Label><Select value={form.positionKey} onValueChange={(v) => setForm({ ...form, positionKey: v })}><SelectTrigger id="cm-pos"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(positions.data ?? []).map((p: any) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="cm-name">Name *</Label><Input id="cm-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Unit</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} placeholder="Unit" /></div>
          <div className="space-y-1.5"><Label htmlFor="cm-phone">Phone</Label><Input id="cm-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cm-email">Email</Label><Input id="cm-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cm-start">Term starts</Label><Input id="cm-start" type="date" value={form.termStart} onChange={(e) => setForm({ ...form, termStart: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cm-end">Term ends</Label><Input id="cm-end" type="date" value={form.termEnd} onChange={(e) => setForm({ ...form, termEnd: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cm-status">Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger id="cm-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Serving</SelectItem><SelectItem value="INCOMING">Incoming (takes office at handover)</SelectItem><SelectItem value="ENDED">Term ended</SelectItem></SelectContent></Select></div>
          <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={form.showContactToMembers} onCheckedChange={(v) => setForm({ ...form, showContactToMembers: v })} /> Residents may see contact details</label>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cm-notes">Notes</Label><Textarea id="cm-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={add.isPending || update.isPending} disabled={!form.name.trim() || !form.positionKey} onClick={submit}>{member ? 'Save' : 'Add'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverCard({ overview }: { overview: any }) {
  const start = useStartHandover();
  const tick = useTickHandover();
  const complete = useCompleteHandover();
  const { confirm, ConfirmElement } = useConfirm();
  const [note, setNote] = React.useState('');
  const h = overview.handover ?? {};
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const allDone = (h.checklist ?? []).every((c: any) => c.done);
  return (
    <Card className={cn(h.active && 'border-warning/60')}>
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ArrowRightLeft className="h-4 w-4" /> Committee handover {h.active ? <Badge variant="warning">In progress</Badge> : h.completedAt ? <Badge variant="muted">Last completed {formatDate(h.completedAt)}</Badge> : null}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!h.active ? <>
          <p className="text-muted-foreground">Start a handover when the term ends: add the incoming members, work through the checklist, then complete it to seat the new committee. Every step is recorded in the audit log.</p>
          <div className="space-y-1.5"><Label htmlFor="ho-note">Note</Label><Input id="ho-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Term ends after the AGM…" /></div>
          <Button size="sm" onClick={async () => { if (await confirm({ title: 'Start the handover?', description: 'The committee is notified and a checklist is created.', confirmLabel: 'Start handover' })) start.mutate({ note: note || undefined }, { onSuccess: () => toast.success('Handover started'), onError: err }); }}><ArrowRightLeft /> Start handover</Button>
        </> : <>
          <p className="text-muted-foreground">Started {formatDateTime(h.startedAt)}{h.note ? ` · ${h.note}` : ''}</p>
          <ul className="space-y-1">{(h.checklist ?? []).map((c: any) => <li key={c.key}><label className="flex items-center gap-2"><Checkbox checked={c.done} onCheckedChange={(v) => tick.mutate({ key: c.key, done: Boolean(v) }, { onError: err })} /><span className={cn(c.done && 'text-muted-foreground line-through')}>{c.label}</span>{c.doneAt ? <span className="text-xs text-muted-foreground">{formatDate(c.doneAt)}</span> : null}</label></li>)}</ul>
          <p className="text-xs text-muted-foreground">{overview.incoming?.length ? `${overview.incoming.length} incoming member${overview.incoming.length === 1 ? '' : 's'} ready to take office.` : 'Add the incoming members (status “Incoming”) before completing.'}</p>
          <Button size="sm" disabled={!allDone || !overview.incoming?.length} loading={complete.isPending} onClick={async () => { if (await confirm({ title: 'Complete the handover?', description: 'Current members\' terms end now and incoming members take office.', confirmLabel: 'Complete handover' })) complete.mutate({}, { onSuccess: () => toast.success('New committee seated'), onError: err }); }}><CheckCircle2 /> Complete handover</Button>
        </>}
        {ConfirmElement}
      </CardContent>
    </Card>
  );
}

/** Committee composition, terms, contact privacy and handover. */
export default function CommitteePage() {
  const { can } = usePermissions();
  const overview = useCommitteeOverview();
  const remove = useRemoveCommitteeMember();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | 'incoming' | null>(null);
  useGovernanceRealtime();
  const o = overview.data;
  const manage = can('governance:manage');
  const MemberRow = ({ m }: { m: any }) => (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{m.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 font-medium">{m.name} <Badge variant="outline">{m.positionName}</Badge>{m.status !== 'ACTIVE' ? <StatusBadge status={m.status} /> : null}</span><span className="block text-xs text-muted-foreground">{m.unitCode ? `${m.unitCode} · ` : ''}{m.termStart ? `${formatDate(m.termStart)} – ${m.termEnd ? formatDate(m.termEnd) : 'ongoing'}` : ''}{m.phone ? <span className="ml-2 inline-flex items-center gap-1"><Phone className="h-3 w-3" />{m.phone}</span> : null}{m.email ? <span className="ml-2 inline-flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span> : null}</span></span>
      {manage ? <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: m.status === 'INCOMING' ? `Remove ${m.name}?` : `End ${m.name}'s term?`, destructive: true, confirmLabel: 'Confirm' })) remove.mutate(m.id, { onError: (e) => toast.error(getErrorMessage(e)) }); }}><UserMinus /></Button></span> : null}
    </li>
  );
  return (
    <div>
      <PageHeader title="Committee" description="Who runs the society, for which term, and how the next committee takes over." actions={<PermissionGate permission="governance:manage"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Add member</Button></SubscriptionGate></PermissionGate>} />
      {overview.isLoading ? <CardSkeleton count={2} /> : !o ? null : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Managing committee</CardTitle></CardHeader>
              <CardContent>{o.members?.length ? <ul className="divide-y">{o.members.map((m: any) => <MemberRow key={m.id} m={m} />)}</ul> : <EmptyState icon={<Landmark />} title="No committee recorded" description="Add the office bearers so residents know whom to reach." compact />}{o.vacantPositions?.length && manage ? <p className="mt-2 text-xs text-muted-foreground">Vacant: {o.vacantPositions.map((p: any) => p.name).join(', ')}</p> : null}</CardContent>
            </Card>
            {o.incoming?.length || o.handover?.active ? <Card><CardHeader><CardTitle className="flex items-center justify-between text-sm">Incoming committee {manage ? <Button size="sm" variant="outline" onClick={() => setEditing('incoming')}><Plus /> Incoming member</Button> : null}</CardTitle></CardHeader><CardContent>{o.incoming?.length ? <ul className="divide-y">{o.incoming.map((m: any) => <MemberRow key={m.id} m={m} />)}</ul> : <p className="text-sm text-muted-foreground">No incoming members yet.</p>}</CardContent></Card> : null}
          </div>
          <div>{manage ? <HandoverCard overview={o} /> : null}</div>
        </div>
      )}
      <MemberDialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }} member={editing === 'new' || editing === 'incoming' ? null : editing} incoming={editing === 'incoming'} />
      {ConfirmElement}
    </div>
  );
}
