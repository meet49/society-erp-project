import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { UserPlus, PhoneCall, Hourglass, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Combobox } from '@/components/common/combobox';
import { useGateUnitSearch, useGateAction, useGateRealtime, useVisitorSettings } from '@/hooks/use-visitors';
import { useCategories } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { GatePicker, OfflineBanner, PhotoCapture, useSelectedGate } from '@/features/guard/gate-shared';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const blank = { name: '', phone: '', categoryKey: 'GUEST', companyName: '', vehicleNumber: '', guestCount: '1', purpose: '', unitId: '', approvedByPhone: false };

/** Walk-in registration: the host gets a live approval request; the guard sees the decision on this screen. */
export default function GateWalkInPage() {
  const navigate = useNavigate();
  const [unitQuery, setUnitQuery] = React.useState('');
  const units = useGateUnitSearch(unitQuery);
  const categories = useCategories('VISITOR_CATEGORY');
  const settings = useVisitorSettings();
  const action = useGateAction();
  const { can } = usePermissions();
  const [gateId] = useSelectedGate();
  const [form, setForm] = React.useState(blank);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [waiting, setWaiting] = React.useState<{ id: string; name: string; unitCode?: string; hostCount: number } | null>(null);
  const [decision, setDecision] = React.useState<{ status: string; reason?: string } | null>(null);
  const onDecision = React.useCallback((d: any) => { if (waiting && d.visitorId === waiting.id) setDecision({ status: d.status, reason: d.reason }); }, [waiting]);
  useGateRealtime(onDecision);
  const requirePhoto = settings.data?.requirePhoto;
  const submit = () => {
    action.mutate(
      { url: '/visitors/walk-in', body: { ...form, guestCount: Number(form.guestCount) || 1, phone: form.phone || undefined, companyName: form.companyName || undefined, vehicleNumber: form.vehicleNumber || undefined, purpose: form.purpose || undefined, photo: photo ?? undefined, gateId: gateId || undefined, approvedByPhone: form.approvedByPhone && can('visitors:approve') }, label: `Walk-in ${form.name}` },
      {
        onSuccess: (r) => {
          if (r.queued) { toast.warning('Saved offline — the resident will be asked when you are back online'); setForm(blank); setPhoto(null); return; }
          const v = r.data;
          if (v.status === 'CHECKED_IN') { toast.success(`${v.name} checked in`); navigate('/guard'); return; }
          setWaiting({ id: v.id, name: v.name, unitCode: v.unitCode, hostCount: v.hostCount });
          setDecision(null);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };
  if (waiting) {
    return (
      <div className="space-y-4">
        <OfflineBanner />
        <div className={cn('rounded-lg border p-5 text-center', decision?.status === 'APPROVED' ? 'border-success/50 bg-success/5' : decision ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5')}>
          {!decision ? <><Hourglass className="mx-auto h-10 w-10 animate-pulse text-warning" /><p className="mt-2 text-lg font-semibold">Waiting for unit {waiting.unitCode}</p><p className="text-sm text-muted-foreground">{waiting.hostCount ? `${waiting.hostCount} resident(s) notified. Ask ${waiting.name} to wait.` : 'No resident has the app for this unit — the office has been asked to decide. You can also confirm by phone.'}</p></> : decision.status === 'APPROVED' ? <><CheckCircle2 className="mx-auto h-10 w-10 text-success" /><p className="mt-2 text-lg font-semibold">Approved — let {waiting.name} in</p></> : <><XCircle className="mx-auto h-10 w-10 text-destructive" /><p className="mt-2 text-lg font-semibold">{decision.status === 'DENIED' ? 'Entry denied' : 'No response'}</p>{decision.reason ? <p className="text-sm text-muted-foreground">{decision.reason}</p> : null}</>}
        </div>
        {decision?.status === 'APPROVED' ? <Button size="lg" className="h-14 w-full text-base" loading={action.isPending} onClick={() => action.mutate({ url: `/visitors/${waiting.id}/check-in`, body: { gateId: gateId || undefined }, label: `Check-in ${waiting.name}` }, { onSuccess: () => { toast.success(`${waiting.name} checked in`); navigate('/guard'); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Check in {waiting.name}</Button> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => { setWaiting(null); setDecision(null); setForm(blank); setPhoto(null); }}>New walk-in</Button>
          <Button variant="ghost" onClick={() => navigate('/guard')}>Back to gate</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <div className="flex items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-lg font-semibold"><UserPlus className="h-5 w-5" /> Walk-in visitor</h1><GatePicker /></div>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="wi-unit">Visiting unit *</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} onSearch={setUnitQuery} loading={units.isLoading && !units.data} placeholder="Choose the unit" searchPlaceholder="Type flat number" /></div>
        <div className="space-y-1.5"><Label htmlFor="wi-name">Visitor name *</Label><Input id="wi-name" className="h-12" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="wi-phone">Phone</Label><Input id="wi-phone" type="tel" inputMode="tel" className="h-12" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="wi-guests">People</Label><Input id="wi-guests" type="number" min={1} max={50} className="h-12" value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Category</Label><div className="flex flex-wrap gap-2">{(categories.data ?? []).map((c: any) => <button key={c.key} type="button" onClick={() => setForm({ ...form, categoryKey: c.key })} className={cn('rounded-full border px-3 py-1.5 text-sm', form.categoryKey === c.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{c.name}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="wi-company">Company</Label><Input id="wi-company" className="h-12" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Swiggy, Urban Company…" /></div>
          <div className="space-y-1.5"><Label htmlFor="wi-vehicle">Vehicle{settings.data?.requireVehicleNumber ? ' *' : ''}</Label><Input id="wi-vehicle" className="h-12 uppercase" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="wi-purpose">Purpose</Label><Textarea id="wi-purpose" rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Photo{requirePhoto ? ' *' : ''}</Label><PhotoCapture value={photo} onChange={setPhoto} /></div>
        {can('visitors:approve') ? <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><Switch checked={form.approvedByPhone} onCheckedChange={(v) => setForm({ ...form, approvedByPhone: v })} /><PhoneCall className="h-4 w-4" /> Resident confirmed by phone — check in directly</label> : null}
        <Button size="lg" className="h-14 w-full text-base" loading={action.isPending} disabled={!form.unitId || form.name.trim().length < 2 || (requirePhoto && !photo)} onClick={submit}><UserPlus /> {form.approvedByPhone ? 'Check in' : 'Ask resident to approve'}</Button>
      </div>
    </div>
  );
}
