import * as React from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, ShieldCheck, ShieldAlert, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Combobox } from '@/components/common/combobox';
import { useHelpTypes, useRegisterHelp, useUpdateHelp } from '@/hooks/use-operations';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { PhotoCapture } from '@/features/guard/gate-shared';

export function VerificationBadge({ status }: { status?: string }) {
  if (status === 'VERIFIED') return <Badge variant="success"><ShieldCheck className="mr-1 h-3 w-3" />Verified</Badge>;
  if (status === 'REJECTED') return <Badge variant="destructive"><Ban className="mr-1 h-3 w-3" />Rejected</Badge>;
  return <Badge variant="warning"><ShieldAlert className="mr-1 h-3 w-3" />Verification pending</Badge>;
}

/** Passcode + QR the resident shares with their help. */
export function HelpPassCard({ help }: { help: any }) {
  const share = async () => {
    if (navigator.share) await navigator.share({ title: `${help.name} - gate pass`, text: help.shareText }).catch(() => undefined);
    else { await navigator.clipboard.writeText(help.shareText); toast.success('Pass details copied'); }
  };
  if (!help?.passcode) return null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-4 text-center sm:flex-row sm:text-left">
      <div className="rounded-md bg-white p-2"><QRCodeSVG value={help.qrPayload} size={112} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase text-muted-foreground">Gate passcode</p>
        <p className="font-mono text-3xl font-bold tracking-[0.3em]">{help.passcode}</p>
        <p className="text-xs text-muted-foreground">Guards match this code or the QR at the gate. Entries are logged and you're notified.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start"><Button size="sm" variant="outline" onClick={share}><Share2 /> Share</Button><Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(help.passcode); toast.success('Passcode copied'); }}><Copy /> Copy</Button></div>
      </div>
    </div>
  );
}

const blank = { name: '', phone: '', typeKey: '', schedule: '', unitId: '', photo: null as string | null, idType: '', idNumber: '' };

/** Register (or edit) domestic help. Residents pick from their units; the office can pick any unit. */
export function HelpDialog({ open, onOpenChange, help, unitOptions, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; help?: any | null; unitOptions?: { value: string; label: string }[]; onSaved?: (h: any) => void }) {
  const types = useHelpTypes();
  const register = useRegisterHelp();
  const update = useUpdateHelp();
  const [form, setForm] = React.useState(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(help ? { name: help.name, phone: help.phone?.includes('*') ? '' : help.phone ?? '', typeKey: help.typeKey, schedule: help.units?.find((u: any) => u.active)?.schedule ?? '', unitId: '', photo: null, idType: help.idProof?.type ?? '', idNumber: '' } : { ...blank, unitId: unitOptions?.length === 1 ? unitOptions[0].value : '' });
  }, [open, help, unitOptions]);
  const submit = () => {
    const payload: any = { name: form.name, typeKey: form.typeKey, schedule: form.schedule || undefined, photo: form.photo ?? undefined, unitId: form.unitId || undefined, idProof: form.idType ? { type: form.idType, number: form.idNumber } : undefined };
    if (form.phone) payload.phone = form.phone;
    const done = { onSuccess: (h: any) => { toast.success(help ? 'Updated' : h.units?.length > 1 ? 'Linked to your unit — this helper already works in the society' : 'Registered · share the passcode with them'); onOpenChange(false); onSaved?.(h); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (help) update.mutate({ id: help.id, ...payload }, done); else register.mutate(payload, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{help ? `Edit ${help.name}` : 'Register domestic help'}</DialogTitle><DialogDescription>The society office verifies the ID; the gate lets them in with the passcode. A helper already working for another flat is linked, not duplicated.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="dh-name">Name *</Label><Input id="dh-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="dh-phone">Phone {help ? '' : '*'}</Label><Input id="dh-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={help?.phone ?? ''} /></div>
          <div className="space-y-1.5"><Label htmlFor="dh-type">Type *</Label><Select value={form.typeKey} onValueChange={(v) => setForm({ ...form, typeKey: v })}><SelectTrigger id="dh-type"><SelectValue placeholder="Maid, cook, driver…" /></SelectTrigger><SelectContent>{(types.data ?? []).map((t: any) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          {unitOptions && unitOptions.length > 1 ? <div className="space-y-1.5"><Label>Unit</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={unitOptions} placeholder="Which flat" /></div> : <div className="space-y-1.5"><Label htmlFor="dh-schedule">Usual timings</Label><Input id="dh-schedule" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Daily 7–9 am" /></div>}
          {unitOptions && unitOptions.length > 1 ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="dh-schedule2">Usual timings</Label><Input id="dh-schedule2" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Daily 7–9 am" /></div> : null}
          <div className="space-y-1.5"><Label htmlFor="dh-idtype">ID proof type</Label><Input id="dh-idtype" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })} placeholder="Aadhaar" /></div>
          <div className="space-y-1.5"><Label htmlFor="dh-idno">ID number</Label><Input id="dh-idno" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} /></div>
          <div className="sm:col-span-2"><PhotoCapture value={form.photo} onChange={(photo) => setForm({ ...form, photo })} label="Photo for the gate" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={register.isPending || update.isPending} disabled={form.name.trim().length < 2 || !form.typeKey || (!help && form.phone.trim().length < 6)} onClick={submit}>{help ? 'Save' : 'Register'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function helpSubtitle(h: any) {
  return `${formatStatus(h.typeKey)}${h.units?.length ? ` · ${h.units.filter((u: any) => u.active).map((u: any) => u.unitId?.code ?? '').filter(Boolean).join(', ')}` : ''}`;
}
