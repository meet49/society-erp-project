import * as React from 'react';
import { toast } from 'sonner';
import { Package, PackageCheck, Undo2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/common/combobox';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGateUnitSearch, useDeliveriesAtGate, useGateAction, useGateRealtime } from '@/hooks/use-visitors';
import { OfflineBanner, PhotoCapture, RefreshButton, useSelectedGate } from '@/features/guard/gate-shared';
import { cn, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const KINDS = ['PARCEL', 'FOOD', 'GROCERY', 'DOCUMENT', 'OTHER'];
const PROVIDERS = ['Amazon', 'Flipkart', 'Swiggy', 'Zomato', 'Blinkit', 'Zepto', 'BigBasket', 'Dunzo', 'Courier'];
const blank = { unitId: '', provider: '', kind: 'PARCEL', trackingRef: '', deliveryPersonName: '', leaveAtGate: false };

/** Guard screen: log arrivals (matched to what residents announced), keep parcels at the gate, hand over. */
export default function GateDeliveriesPage() {
  const atGate = useDeliveriesAtGate();
  const [unitQuery, setUnitQuery] = React.useState('');
  const units = useGateUnitSearch(unitQuery);
  const action = useGateAction();
  const [gateId] = useSelectedGate();
  const [logging, setLogging] = React.useState(false);
  const [form, setForm] = React.useState(blank);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [collecting, setCollecting] = React.useState<any | null>(null);
  const [collector, setCollector] = React.useState('');
  useGateRealtime();
  const log = () => action.mutate({ url: '/deliveries/arrive', body: { ...form, provider: form.provider || undefined, trackingRef: form.trackingRef || undefined, deliveryPersonName: form.deliveryPersonName || undefined, gateId: gateId || undefined, photo: photo ?? undefined }, label: `Delivery ${form.provider || form.kind} → ${form.unitId}` }, { onSuccess: (r) => { toast[r.queued ? 'warning' : 'success'](r.queued ? 'Saved offline — resident will be notified when online' : r.data?.leaveAtGate ? 'Logged · kept at the gate, resident notified' : 'Logged · resident notified'); setLogging(false); setForm(blank); setPhoto(null); }, onError: (e) => toast.error(getErrorMessage(e)) });
  const setStatus = (d: any, status: string, extra: Record<string, unknown> = {}) => action.mutate({ url: `/deliveries/${d.id}/status`, body: { status, ...extra }, label: `${formatStatus(status)} ${d.provider ?? 'delivery'}` }, { onSuccess: (r) => { toast[r.queued ? 'warning' : 'success'](r.queued ? 'Saved offline — will sync' : 'Updated'); setCollecting(null); setCollector(''); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <div className="flex items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-lg font-semibold"><Package className="h-5 w-5" /> Deliveries</h1><div className="flex items-center gap-1"><RefreshButton onClick={() => atGate.refetch()} loading={atGate.isFetching} /><Button onClick={() => setLogging(true)}><Plus /> Log delivery</Button></div></div>
      {atGate.isLoading ? <CardSkeleton count={3} /> : (atGate.data ?? []).length ? (
        <div className="space-y-2">
          {(atGate.data ?? []).map((d: any) => (
            <div key={d.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium">{d.provider ?? formatStatus(d.kind)} · Unit {d.unitId?.code}</p><p className="text-xs text-muted-foreground">{formatStatus(d.kind)}{d.trackingRef ? ` · ${d.trackingRef}` : ''} · {formatRelative(d.arrivedAt)}{d.deliveryPersonName ? ` · ${d.deliveryPersonName}` : ''}</p></div><StatusBadge status={d.status} /></div>
              {d.leaveAtGate ? <Badge variant="secondary" className="mt-1">Keep at gate</Badge> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {d.status === 'ARRIVED' || d.status === 'NOTIFIED' ? <Button size="sm" variant="outline" loading={action.isPending} onClick={() => setStatus(d, 'RECEIVED_AT_GATE')}><Package /> Keep at gate</Button> : null}
                <Button size="sm" loading={action.isPending} onClick={() => { setCollecting(d); setCollector(''); }}><PackageCheck /> Handed over</Button>
                <Button size="sm" variant="ghost" loading={action.isPending} onClick={() => setStatus(d, 'RETURNED')}><Undo2 /> Returned</Button>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState compact icon={<Package />} title="Nothing at the gate" description="Log a delivery when a courier arrives; residents get notified instantly." />}
      <Dialog open={logging} onOpenChange={setLogging}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log a delivery</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Unit *</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} onSearch={setUnitQuery} loading={units.isLoading && !units.data} placeholder="Choose the unit" searchPlaceholder="Type flat number" /></div>
            <div className="space-y-1.5"><Label>Provider</Label><div className="flex flex-wrap gap-1.5">{PROVIDERS.map((p) => <button key={p} type="button" onClick={() => setForm({ ...form, provider: p })} className={cn('rounded-full border px-2.5 py-1 text-xs', form.provider === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{p}</button>)}</div><Input className="mt-1" placeholder="Other provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} aria-label="Provider" /></div>
            <div className="space-y-1.5"><Label>Type</Label><div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={cn('rounded-full border px-2.5 py-1 text-xs', form.kind === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{formatStatus(k)}</button>)}</div></div>
            <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label htmlFor="dl-ref">Tracking / order no.</Label><Input id="dl-ref" value={form.trackingRef} onChange={(e) => setForm({ ...form, trackingRef: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="dl-person">Delivery person</Label><Input id="dl-person" value={form.deliveryPersonName} onChange={(e) => setForm({ ...form, deliveryPersonName: e.target.value })} /></div></div>
            <PhotoCapture value={photo} onChange={setPhoto} label="Photo of parcel" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.leaveAtGate} onCheckedChange={(v) => setForm({ ...form, leaveAtGate: v })} /> Keep at the gate (resident collects later)</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLogging(false)}>Cancel</Button><Button loading={action.isPending} disabled={!form.unitId} onClick={log}>Log & notify</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(collecting)} onOpenChange={(o) => { if (!o) setCollecting(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Handed over</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="dl-collector">Collected by</Label><Input id="dl-collector" value={collector} onChange={(e) => setCollector(e.target.value)} placeholder="Resident / family member name" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setCollecting(null)}>Cancel</Button><Button loading={action.isPending} onClick={() => setStatus(collecting, 'COLLECTED', { collectedByName: collector || undefined })}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
