import * as React from 'react';
import { toast } from 'sonner';
import { Siren, Phone, CheckCircle2, ShieldCheck, Megaphone, MapPin, Clock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { useAcknowledgeAlert, useEmergencyContacts, useRaiseSos, useResolveAlert } from '@/hooks/use-security';
import { useUiStore } from '@/stores/ui.store';
import { cn, formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export const SOS_CATEGORIES = [
  { key: 'MEDICAL', label: 'Medical', hint: 'Someone is hurt or unwell' },
  { key: 'FIRE', label: 'Fire', hint: 'Fire or smoke' },
  { key: 'SECURITY', label: 'Security', hint: 'Intruder, theft, threat' },
  { key: 'ACCIDENT', label: 'Accident', hint: 'Fall, lift, vehicle' },
  { key: 'DISASTER', label: 'Disaster', hint: 'Flood, gas leak, structure' },
  { key: 'OTHER', label: 'Other', hint: 'Anything else urgent' },
];
const CONTACT_ICON_TONE: Record<string, string> = { POLICE: 'bg-info/15 text-info', FIRE: 'bg-destructive/15 text-destructive', AMBULANCE: 'bg-success/15 text-success', HOSPITAL: 'bg-success/15 text-success', SECURITY: 'bg-warning/20 text-warning-foreground dark:text-warning' };

/** Click-to-call list of the society's emergency numbers. */
export function ContactsList({ compact }: { compact?: boolean }) {
  const contacts = useEmergencyContacts();
  const items: any[] = contacts.data ?? [];
  if (contacts.isLoading) return <p className="text-sm text-muted-foreground">Loading contacts…</p>;
  if (!items.length) return <p className="text-sm text-muted-foreground">No emergency contacts published yet.</p>;
  return (
    <ul className={cn('grid gap-2', compact ? '' : 'sm:grid-cols-2')}>
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 rounded-md border bg-card p-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', CONTACT_ICON_TONE[c.category] ?? 'bg-muted text-muted-foreground')}><Phone className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.name}</span><span className="block truncate text-xs text-muted-foreground">{formatStatus(c.category)}{c.notes ? ` · ${c.notes}` : ''}{c.address ? ` · ${c.address}` : ''}</span></span>
          <Button asChild size="sm"><a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}><Phone /> {c.phone}</a></Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The SOS button. Pressing it opens a confirm step (category + where), then sends the alert **online only**:
 * an SOS is never queued, because a queued alert that nobody received would be worse than an honest failure.
 */
export function SosButton({ unitId, location: defaultLocation, className, onRaised }: { unitId?: string | null; location?: string; className?: string; onRaised?: (alert: any) => void }) {
  const raise = useRaiseSos();
  const online = useUiStore((s) => s.online);
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState('MEDICAL');
  const [location, setLocation] = React.useState(defaultLocation ?? '');
  const [message, setMessage] = React.useState('');
  React.useEffect(() => { if (open) { setLocation(defaultLocation ?? ''); setMessage(''); } }, [open, defaultLocation]);
  const send = () => {
    const coords = new Promise<{ lat: number; lng: number } | undefined>((resolve) => { if (!navigator.geolocation) return resolve(undefined); navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(undefined), { timeout: 3000, maximumAge: 60000 }); });
    void coords.then((coordinates) => raise.mutate({ category, location: location || undefined, message: message || undefined, unitId: unitId ?? undefined, coordinates }, {
      onSuccess: (a) => { toast.success(a.replayed ? 'Your SOS is already active — responders have been alerted' : 'SOS sent — responders have been alerted', { duration: 8000 }); setOpen(false); onRaised?.(a); },
      onError: (e) => toast.error(`SOS was NOT sent: ${getErrorMessage(e)}. Call the emergency numbers below.`, { duration: 15000 }),
    }));
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('flex h-40 w-40 flex-col items-center justify-center rounded-full border-8 border-destructive/30 bg-destructive text-destructive-foreground shadow-lg transition active:scale-95', className)} aria-label="Raise SOS">
        <Siren className="h-12 w-12" />
        <span className="mt-1 text-2xl font-black tracking-widest">SOS</span>
        <span className="text-[11px] opacity-90">Tap for help</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Siren className="h-5 w-5" /> Send SOS</DialogTitle><DialogDescription>Guards, the committee and the office get an immediate alert with your name{unitId ? ' and flat' : ''}. Use it only for real emergencies.</DialogDescription></DialogHeader>
          {!online ? <p className="rounded-md border border-warning/50 bg-warning/10 p-2 text-sm">You appear to be offline. The SOS cannot reach anyone right now — call the numbers below instead.</p> : null}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{SOS_CATEGORIES.map((c) => <button key={c.key} type="button" onClick={() => setCategory(c.key)} className={cn('rounded-md border p-2 text-left', category === c.key ? 'border-destructive bg-destructive/10' : 'bg-card')}><span className="block text-sm font-semibold">{c.label}</span><span className="block text-[11px] text-muted-foreground">{c.hint}</span></button>)}</div>
          <div className="space-y-1.5"><Label htmlFor="sos-loc">Where exactly?</Label><Input id="sos-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Flat, floor, basement, lawn…" /></div>
          <div className="space-y-1.5"><Label htmlFor="sos-msg">Anything responders should know</Label><Textarea id="sos-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" size="lg" loading={raise.isPending} disabled={!online} onClick={send}><Siren /> Send SOS now</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One live or historical alert with the actions the caller may take. */
export function AlertCard({ alert, canRespond, ownUserId, compact }: { alert: any; canRespond?: boolean; ownUserId?: string; compact?: boolean }) {
  const ack = useAcknowledgeAlert();
  const resolve = useResolveAlert();
  const [resolving, setResolving] = React.useState(false);
  const [note, setNote] = React.useState('');
  const live = alert.status === 'ACTIVE' || alert.status === 'ACKNOWLEDGED';
  const own = ownUserId && (alert.raisedBy?.id === ownUserId || alert.raisedBy === ownUserId);
  const sos = alert.kind === 'SOS';
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <div className={cn('rounded-lg border p-4', live && sos ? 'border-destructive/60 bg-destructive/5' : live ? 'border-warning/60 bg-warning/5' : 'bg-card')}>
      <div className="flex flex-wrap items-start gap-2">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', sos ? 'bg-destructive/15 text-destructive' : 'bg-warning/20 text-warning-foreground dark:text-warning')}>{sos ? <Siren className={cn('h-5 w-5', alert.status === 'ACTIVE' && 'animate-pulse')} /> : <Megaphone className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">{sos ? `${formatStatus(alert.category)} SOS` : alert.title}<StatusBadge status={alert.status} /><span className="font-mono text-xs font-normal text-muted-foreground">{alert.alertNumber}</span></p>
          <p className="text-sm text-muted-foreground">{sos ? <>{alert.raisedBy?.name ?? 'Someone'}{alert.unitId?.code ? ` · flat ${alert.unitId.code}` : ''}{alert.raisedBy?.phone ? <> · <a className="underline" href={`tel:${alert.raisedBy.phone}`}>{alert.raisedBy.phone}</a></> : null}</> : <>{alert.message}</>}</p>
          {sos && alert.location ? <p className="flex items-center gap-1 text-sm"><MapPin className="h-3.5 w-3.5" /> {alert.location}{alert.coordinates?.lat ? <a className="ml-1 text-xs underline" href={`https://maps.google.com/?q=${alert.coordinates.lat},${alert.coordinates.lng}`} target="_blank" rel="noreferrer">map</a> : null}</p> : null}
          {sos && alert.message ? <p className="mt-1 text-sm">“{alert.message}”</p> : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatRelative(alert.createdAt)}</span>{alert.acknowledgedBy?.name ? <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> {alert.acknowledgedBy.name} responding{alert.responders?.length > 1 ? ` +${alert.responders.length - 1}` : ''}</span> : null}{alert.resolvedAt ? <span>{formatStatus(alert.status)} by {alert.resolvedBy?.name ?? '—'} · {formatDateTime(alert.resolvedAt)}{alert.resolutionNote ? ` · ${alert.resolutionNote}` : ''}</span> : null}{!sos && alert.audienceSummary ? <span>To: {alert.audienceSummary}{alert.notifiedCount ? ` (${alert.notifiedCount})` : ''}</span> : null}{!sos && alert.expiresAt && live ? <span>Until {formatDateTime(alert.expiresAt)}</span> : null}</p>
        </div>
      </div>
      {live && !compact && (canRespond || own) ? (
        <div className="mt-3 space-y-2">
          {resolving ? <div className="space-y-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={sos ? 'What was done' : 'All-clear message'} /><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setResolving(false)}>Cancel</Button>{sos && canRespond ? <Button size="sm" variant="outline" loading={resolve.isPending} onClick={() => resolve.mutate({ id: alert.id, note: note || undefined, falseAlarm: true }, { onSuccess: () => setResolving(false), onError: err })}>False alarm</Button> : null}<Button size="sm" loading={resolve.isPending} onClick={() => resolve.mutate({ id: alert.id, note: note || undefined }, { onSuccess: () => { toast.success(sos ? 'Resolved' : 'All clear sent'); setResolving(false); }, onError: err })}><CheckCircle2 /> {sos ? (own && !canRespond ? 'Cancel my SOS' : 'Resolved') : 'Send all clear'}</Button></div></div> : (
            <div className="flex flex-wrap gap-2">
              {sos && canRespond && !alert.responders?.some((r: any) => (r.userId?.id ?? r.userId) === ownUserId) ? <Button size="lg" className="h-12 flex-1" loading={ack.isPending} onClick={() => ack.mutate({ id: alert.id }, { onSuccess: () => toast.success('They know you are coming'), onError: err })}><ShieldCheck /> I'm responding</Button> : null}
              {(sos && (canRespond || own)) || (!sos && canRespond) ? <Button size="lg" variant={sos && own && !canRespond ? 'outline' : 'default'} className="h-12 flex-1" onClick={() => setResolving(true)}>{sos ? (own && !canRespond ? <><X /> Cancel SOS</> : <><CheckCircle2 /> Resolve</>) : <><CheckCircle2 /> All clear</>}</Button> : null}
            </div>
          )}
        </div>
      ) : null}
      {sos && alert.timeline?.length > 1 && !compact ? <ol className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">{alert.timeline.map((t: any, i: number) => <li key={i}>{formatDateTime(t.at)} · {formatStatus(t.action)}{t.userId?.name ? ` · ${t.userId.name}` : ''}{t.note ? ` · ${t.note}` : ''}</li>)}</ol> : null}
      {!sos && live && compact ? <Badge variant="warning" className="mt-2">Active emergency notice</Badge> : null}
    </div>
  );
}
