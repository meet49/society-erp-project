import * as React from 'react';
import { toast } from 'sonner';
import { UserCheck, MessageSquarePlus, CheckCircle2, Lock, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { Combobox } from '@/components/common/combobox';
import { useConfirm } from '@/components/common/confirm-dialog';
import { CardSkeleton } from '@/components/common/loading-state';
import { useAssignIncident, useCloseIncident, useCreateIncident, useDeleteIncident, useIncident, useIncidentNote, useIncidentStatus, useIncidentTypes, useResolveIncident, useSecurityGates, useUpdateIncident } from '@/hooks/use-security';
import { useUnitOptions } from '@/hooks/use-units';
import { useSocietyUsers } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { useAuth } from '@/hooks/use-auth';
import { cn, formatDateTime, formatStatus, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { PhotoCapture } from '@/features/guard/gate-shared';

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const INVOLVED_TYPES = ['VISITOR', 'RESIDENT', 'STAFF', 'DOMESTIC_HELP', 'VEHICLE', 'UNKNOWN', 'OTHER'];
const SEVERITY_TONE: Record<string, string> = { LOW: 'border-muted bg-muted text-muted-foreground', MEDIUM: 'border-info/40 bg-info/10 text-info', HIGH: 'border-warning/50 bg-warning/15 text-warning-foreground dark:text-warning', CRITICAL: 'border-destructive/50 bg-destructive/15 text-destructive' };

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', SEVERITY_TONE[severity] ?? SEVERITY_TONE.MEDIUM)}>{formatStatus(severity)}</span>;
}

/** Severity chips: big enough for a gloved thumb at the gate, also used in the office dialog. */
export function SeverityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="grid grid-cols-4 gap-1.5">{SEVERITIES.map((s) => <button key={s} type="button" onClick={() => onChange(s)} className={cn('rounded-md border px-2 py-2 text-xs font-semibold', value === s ? SEVERITY_TONE[s] + ' ring-2 ring-offset-1 ring-primary/40' : 'bg-card text-muted-foreground')}>{formatStatus(s)}</button>)}</div>;
}

const blank = { title: '', description: '', typeKey: '', severity: 'MEDIUM', location: '', gateId: '', unitId: '', occurredAt: '', involvedName: '', involvedType: 'UNKNOWN', policeReported: false, firNumber: '', station: '' };

/** Office dialog: report a new incident or edit the facts of an existing one. */
export function IncidentDialog({ open, onOpenChange, incident }: { open: boolean; onOpenChange: (o: boolean) => void; incident?: any | null }) {
  const types = useIncidentTypes();
  const gates = useSecurityGates();
  const units = useUnitOptions(open);
  const create = useCreateIncident();
  const update = useUpdateIncident();
  const [form, setForm] = React.useState(blank);
  const [photos, setPhotos] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!open) return;
    setPhotos([]);
    setForm(incident ? { ...blank, title: incident.title, description: incident.description ?? '', typeKey: incident.typeKey, severity: incident.severity, location: incident.location ?? '', gateId: incident.gateId?.id ?? '', unitId: incident.unitId?.id ?? '', occurredAt: incident.occurredAt ? toInputDateTime(incident.occurredAt) : '', policeReported: Boolean(incident.police?.reported), firNumber: incident.police?.firNumber ?? '', station: incident.police?.station ?? '' } : { ...blank, occurredAt: toInputDateTime(new Date()) });
  }, [open, incident]);
  const submit = () => {
    const payload: any = { title: form.title, description: form.description || undefined, typeKey: form.typeKey, severity: form.severity, location: form.location || undefined, unitId: form.unitId || null, occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined, police: form.policeReported ? { reported: true, firNumber: form.firNumber || undefined, station: form.station || undefined } : { reported: false } };
    const done = { onSuccess: () => { toast.success(incident ? 'Incident updated' : 'Incident logged'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (incident) update.mutate({ id: incident.id, ...payload }, done);
    else create.mutate({ ...payload, gateId: form.gateId || null, photos: photos.length ? photos : undefined, involved: form.involvedName ? [{ name: form.involvedName, type: form.involvedType }] : undefined }, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{incident ? `Edit ${incident.incidentNumber}` : 'Log an incident'}</DialogTitle><DialogDescription>Facts only: what happened, where, how serious. The timeline records who changed what.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="in-title">Title *</Label><Input id="in-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short description of what happened" /></div>
          <div className="space-y-1.5"><Label htmlFor="in-type">Type *</Label><Select value={form.typeKey} onValueChange={(v) => setForm({ ...form, typeKey: v })}><SelectTrigger id="in-type"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(types.data ?? []).map((t: any) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label>Severity</Label><SeverityPicker value={form.severity} onChange={(severity) => setForm({ ...form, severity })} /></div>
          <div className="space-y-1.5"><Label htmlFor="in-when">When</Label><Input id="in-when" type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="in-loc">Location</Label><Input id="in-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Basement 2, near lift" /></div>
          {!incident ? <div className="space-y-1.5"><Label htmlFor="in-gate">Gate</Label><Select value={form.gateId || 'none'} onValueChange={(v) => setForm({ ...form, gateId: v === 'none' ? '' : v })}><SelectTrigger id="in-gate"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not at a gate</SelectItem>{(gates.data ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div> : null}
          <div className="space-y-1.5"><Label>Unit involved</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} placeholder="Optional" /></div>
          {!incident ? <><div className="space-y-1.5"><Label htmlFor="in-inv">Person / vehicle involved</Label><Input id="in-inv" value={form.involvedName} onChange={(e) => setForm({ ...form, involvedName: e.target.value })} placeholder="Name or number plate" /></div><div className="space-y-1.5"><Label htmlFor="in-invtype">They are a</Label><Select value={form.involvedType} onValueChange={(v) => setForm({ ...form, involvedType: v })}><SelectTrigger id="in-invtype"><SelectValue /></SelectTrigger><SelectContent>{INVOLVED_TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div></> : null}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="in-desc">Details</Label><Textarea id="in-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={form.policeReported} onChange={(e) => setForm({ ...form, policeReported: e.target.checked })} /> Reported to police</Label></div>
          {form.policeReported ? <><div className="space-y-1.5"><Label htmlFor="in-fir">FIR number</Label><Input id="in-fir" value={form.firNumber} onChange={(e) => setForm({ ...form, firNumber: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="in-station">Police station</Label><Input id="in-station" value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} /></div></> : null}
          {!incident ? <div className="sm:col-span-2 lg:col-span-3"><PhotoCapture value={photos[0] ?? null} onChange={(p) => setPhotos(p ? [p] : [])} label="Attach a photo" /></div> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={form.title.trim().length < 3 || !form.typeKey} onClick={submit}>{incident ? 'Save' : 'Log incident'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssigneePicker({ value, onChange }: { value: string; onChange: (v: string | null) => void }) {
  const users = useSocietyUsers({ limit: 200 });
  const options = (users.data?.items ?? []).map((u: any) => ({ value: u.id ?? u.user?.id, label: u.name ?? u.user?.name ?? '', description: (u.roles ?? []).map((r: any) => r.name).join(', ') })).filter((o: any) => o.value && o.label);
  return <Combobox value={value} onChange={(v) => onChange(v ?? null)} options={options} placeholder="Assign to…" />;
}

/** Full incident record: facts, photos, timeline and every action the caller is allowed to take. */
export function IncidentSheet({ id, onClose, onEdit, compact }: { id: string | null; onClose: () => void; onEdit?: (incident: any) => void; compact?: boolean }) {
  const incident = useIncident(id ?? '');
  const { can } = usePermissions();
  const { user } = useAuth();
  const assign = useAssignIncident();
  const note = useIncidentNote();
  const status = useIncidentStatus();
  const resolve = useResolveIncident();
  const close = useCloseIncident();
  const remove = useDeleteIncident();
  const { confirm, ConfirmElement } = useConfirm();
  const [noteText, setNoteText] = React.useState('');
  const [notePhoto, setNotePhoto] = React.useState<string | null>(null);
  const [resolving, setResolving] = React.useState(false);
  const [resolution, setResolution] = React.useState({ note: '', actionTaken: '', close: false });
  const [assignee, setAssignee] = React.useState('');
  React.useEffect(() => { setNoteText(''); setNotePhoto(null); setResolving(false); setResolution({ note: '', actionTaken: '', close: false }); setAssignee(incident.data?.assignedTo?.id ?? ''); }, [id, incident.data?.assignedTo?.id]);
  const i = incident.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const isOpen = i && (i.status === 'OPEN' || i.status === 'INVESTIGATING');
  const canNote = i && (can('security:update') || i.reportedBy?.id === user?.id) && i.status !== 'CLOSED';
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        {incident.isLoading || !i ? <CardSkeleton count={2} /> : <>
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{i.incidentNumber}</span><StatusBadge status={i.status} /><SeverityBadge severity={i.severity} /></SheetTitle>
            <SheetDescription className="text-base font-medium text-foreground">{i.title}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            <KeyValue columns={2} items={[
              { label: 'Type', value: formatStatus(i.typeKey) },
              { label: 'When', value: formatDateTime(i.occurredAt) },
              { label: 'Where', value: [i.location, i.gateId?.name].filter(Boolean).join(' · ') || '—' },
              { label: 'Unit', value: i.unitId?.code ?? '—' },
              { label: 'Reported by', value: `${i.reportedBy?.name ?? '—'} · ${i.reportedVia === 'GATE' ? 'gate app' : 'office'}` },
              { label: 'Assigned to', value: i.assignedTo?.name ?? 'Unassigned' },
              ...(i.police?.reported ? [{ label: 'Police', value: `Reported${i.police.firNumber ? ` · FIR ${i.police.firNumber}` : ''}${i.police.station ? ` · ${i.police.station}` : ''}` }] : []),
              ...(i.involved?.length ? [{ label: 'Involved', value: i.involved.map((p: any) => `${p.name} (${formatStatus(p.type).toLowerCase()})`).join(', '), span: 2 }] : []),
              ...(i.description ? [{ label: 'Details', value: <span className="whitespace-pre-wrap">{i.description}</span>, span: 2 }] : []),
              ...(i.resolution?.resolvedAt ? [{ label: 'Resolution', value: <span className="whitespace-pre-wrap">{i.resolution.note}{i.resolution.actionTaken ? ` · Action: ${i.resolution.actionTaken}` : ''} — {i.resolution.resolvedBy?.name}, {formatDateTime(i.resolution.resolvedAt)}</span>, span: 2 }] : []),
            ]} />
            {i.photos?.length ? <div className="flex flex-wrap gap-2">{i.photos.map((p: any) => p.url ? <a key={p.id || p.storageKey} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name} className="h-24 w-24 rounded-md border object-cover" /></a> : null)}</div> : null}
            {!compact && can('security:update') && isOpen ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="flex items-center gap-1 text-xs uppercase text-muted-foreground"><UserCheck className="h-3.5 w-3.5" /> Assignment</Label>
                <div className="flex gap-2"><div className="flex-1"><AssigneePicker value={assignee} onChange={(v) => setAssignee(v ?? '')} /></div><Button size="sm" variant="outline" loading={assign.isPending} disabled={assignee === (i.assignedTo?.id ?? '')} onClick={() => assign.mutate({ id: i.id, assignedTo: assignee || null }, { onSuccess: () => toast.success(assignee ? 'Assigned' : 'Unassigned'), onError: err })}>Save</Button></div>
                {i.status === 'OPEN' ? <Button size="sm" variant="ghost" loading={status.isPending} onClick={() => status.mutate({ id: i.id, status: 'INVESTIGATING' }, { onError: err })}><Search /> Mark as investigating</Button> : null}
              </div>
            ) : null}
            {canNote ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="in-note" className="flex items-center gap-1 text-xs uppercase text-muted-foreground"><MessageSquarePlus className="h-3.5 w-3.5" /> Add a note</Label>
                <Textarea id="in-note" rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What happened next…" />
                <div className="flex flex-wrap items-center gap-2"><PhotoCapture value={notePhoto} onChange={setNotePhoto} label="Photo" /><span className="flex-1" /><Button size="sm" loading={note.isPending} disabled={!noteText.trim()} onClick={() => note.mutate({ id: i.id, note: noteText, photos: notePhoto ? [notePhoto] : undefined }, { onSuccess: () => { setNoteText(''); setNotePhoto(null); }, onError: err })}>Add note</Button></div>
              </div>
            ) : null}
            {!compact ? (
              <div className="flex flex-wrap gap-2">
                {can('security:resolve') && isOpen && !resolving ? <Button size="sm" onClick={() => setResolving(true)}><CheckCircle2 /> Resolve</Button> : null}
                {(can('security:resolve') || can('security:update')) && i.status === 'RESOLVED' ? <Button size="sm" variant="outline" loading={close.isPending} onClick={() => close.mutate({ id: i.id }, { onSuccess: () => toast.success('Closed'), onError: err })}><Lock /> Close</Button> : null}
                {can('security:update') && (i.status === 'RESOLVED' || i.status === 'CLOSED' || i.status === 'INVESTIGATING') ? <Button size="sm" variant="ghost" loading={status.isPending} onClick={() => status.mutate({ id: i.id, status: 'OPEN' }, { onSuccess: () => toast.success('Reopened'), onError: err })}><RotateCcw /> {i.status === 'INVESTIGATING' ? 'Back to open' : 'Reopen'}</Button> : null}
                {can('security:update') && onEdit && i.status !== 'CLOSED' ? <Button size="sm" variant="ghost" onClick={() => onEdit(i)}>Edit facts</Button> : null}
                {can('security:update') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete ${i.incidentNumber}?`, description: 'Use this only for records logged by mistake; it stays in the audit log.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(i.id, { onSuccess: () => { toast.success('Deleted'); onClose(); }, onError: err }); }}><Trash2 /></Button> : null}
              </div>
            ) : null}
            {resolving ? (
              <div className="space-y-2 rounded-md border border-success/40 p-3">
                <Label htmlFor="in-res">Outcome *</Label><Textarea id="in-res" rows={3} value={resolution.note} onChange={(e) => setResolution({ ...resolution, note: e.target.value })} placeholder="What was found and how it was settled" />
                <Label htmlFor="in-act">Action taken</Label><Input id="in-act" value={resolution.actionTaken} onChange={(e) => setResolution({ ...resolution, actionTaken: e.target.value })} placeholder="Warning issued, police informed, repair ordered…" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={resolution.close} onChange={(e) => setResolution({ ...resolution, close: e.target.checked })} /> Close immediately (no follow-up expected)</label>
                <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setResolving(false)}>Cancel</Button><Button size="sm" loading={resolve.isPending} disabled={resolution.note.trim().length < 2} onClick={() => resolve.mutate({ id: i.id, note: resolution.note, actionTaken: resolution.actionTaken || undefined, close: resolution.close }, { onSuccess: () => { toast.success('Resolved'); setResolving(false); }, onError: err })}>Mark resolved</Button></div>
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Timeline</h3>
              <ol className="space-y-2 border-l pl-3 text-sm">{[...(i.timeline ?? [])].reverse().map((t: any, idx: number) => <li key={idx}><span className="font-medium">{formatStatus(t.action)}</span>{t.to && t.action !== 'ASSIGNED' ? <Badge variant="outline" className="ml-1">{formatStatus(t.to)}</Badge> : null}<span className="block text-xs text-muted-foreground">{t.userId?.name ?? 'System'} · {formatDateTime(t.at)}</span>{t.note ? <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{t.note}</p> : null}</li>)}</ol>
            </div>
          </div>
        </>}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}
