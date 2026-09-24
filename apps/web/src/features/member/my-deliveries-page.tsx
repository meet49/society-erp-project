import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Package, PackageCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAnnounceDelivery, useDeliveries, useDeliveryStatus, useVisitorRealtime } from '@/hooks/use-visitors';
import { cn, formatDateTime, formatRelative, formatStatus, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const KINDS = ['PARCEL', 'FOOD', 'GROCERY', 'DOCUMENT', 'OTHER'];

/** Resident view: announce expected deliveries, see what is waiting at the gate, confirm collection. */
export default function MyDeliveriesPage() {
  const deliveries = useDeliveries({ limit: 50, sort: '-createdAt' });
  const announce = useAnnounceDelivery();
  const setStatus = useDeliveryStatus();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ provider: '', kind: 'PARCEL', trackingRef: '', description: '', expectedAt: toInputDateTime(new Date()), leaveAtGate: true });
  useVisitorRealtime();
  const items: any[] = deliveries.data?.items ?? [];
  const held = items.filter((d) => ['ARRIVED', 'NOTIFIED', 'RECEIVED_AT_GATE'].includes(d.status));
  return (
    <div>
      <PageHeader title="My deliveries" description="Tell the gate what to expect and collect parcels kept for you." actions={<SubscriptionGate><Button onClick={() => setOpen(true)}><Plus /> Expecting a delivery</Button></SubscriptionGate>} />
      {held.length ? (
        <div className="mb-6 space-y-2">
          {held.map((d) => (
            <Card key={d.id} className="border-primary/40 bg-primary/5"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <Package className="h-8 w-8 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><p className="font-semibold">{d.provider ?? formatStatus(d.kind)} {d.status === 'RECEIVED_AT_GATE' ? 'is at the gate' : 'has arrived'}</p><p className="text-sm text-muted-foreground">{formatStatus(d.kind)}{d.trackingRef ? ` · ${d.trackingRef}` : ''} · {formatRelative(d.arrivedAt)}</p></div>
              <Button loading={setStatus.isPending} onClick={() => setStatus.mutate({ id: d.id, status: 'COLLECTED' }, { onSuccess: () => toast.success('Marked as collected'), onError: (e) => toast.error(getErrorMessage(e)) })}><PackageCheck /> I collected it</Button>
            </CardContent></Card>
          ))}
        </div>
      ) : null}
      {deliveries.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<Package />} title="No deliveries yet" description="Announce an expected parcel so the guard can accept it even when you're out." /> : (
        <div className="space-y-2">
          {items.filter((d) => !held.includes(d)).map((d) => (
            <Card key={d.id}><CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-medium">{d.provider ?? formatStatus(d.kind)} <Badge variant="outline">{formatStatus(d.kind)}</Badge> <StatusBadge status={d.status} /></p><p className="text-xs text-muted-foreground">{d.status === 'EXPECTED' ? `Expected ${d.expectedAt ? formatDateTime(d.expectedAt) : 'soon'}${d.leaveAtGate ? ' · guard may keep it at the gate' : ''}` : d.collectedAt ? `Collected ${formatDateTime(d.collectedAt)}${d.collectedByName ? ` by ${d.collectedByName}` : ''}` : formatRelative(d.updatedAt)}</p></div>
            </CardContent></Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Expecting a delivery</DialogTitle><DialogDescription>The gate matches the courier to this announcement and can keep the parcel safe if you allow it.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ad-provider">From</Label><Input id="ad-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Amazon, Swiggy…" /></div>
            <div className="space-y-1.5"><Label htmlFor="ad-ref">Order / tracking no.</Label><Input id="ad-ref" value={form.trackingRef} onChange={(e) => setForm({ ...form, trackingRef: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Type</Label><div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={cn('rounded-full border px-2.5 py-1 text-xs', form.kind === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{formatStatus(k)}</button>)}</div></div>
            <div className="space-y-1.5"><Label htmlFor="ad-expected">Expected around</Label><Input id="ad-expected" type="datetime-local" value={form.expectedAt} onChange={(e) => setForm({ ...form, expectedAt: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ad-desc">Note for the guard</Label><Input id="ad-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Fragile, needs signature…" /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.leaveAtGate} onCheckedChange={(v) => setForm({ ...form, leaveAtGate: v })} /> Guard may keep it at the gate if I'm not home</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={announce.isPending} onClick={() => announce.mutate({ provider: form.provider || undefined, kind: form.kind, trackingRef: form.trackingRef || undefined, description: form.description || undefined, expectedAt: form.expectedAt ? new Date(form.expectedAt).toISOString() : undefined, leaveAtGate: form.leaveAtGate }, { onSuccess: () => { toast.success('The gate has been informed'); setOpen(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Announce</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
