import * as React from 'react';
import { toast } from 'sonner';
import { Plus, ParkingSquare, Layers, Unlink, Link2, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { FilterSelect, FilterBar, SearchInput } from '@/components/common/search-input';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { CardSkeleton } from '@/components/common/loading-state';
import { EmptyState } from '@/components/common/empty-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAllocateSlot, useBulkSlots, useCreateSlot, useDeleteSlot, useOperationsRealtime, useParkingSlots, useParkingStats, useReleaseSlot, useVehicles } from '@/hooks/use-operations';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const SLOT_TYPES = ['CAR', 'BIKE', 'EV', 'VISITOR', 'COMMERCIAL'];
const TONE: Record<string, string> = { AVAILABLE: 'border-success/50 bg-success/5 hover:bg-success/10', ALLOCATED: 'border-primary/40 bg-primary/10', RESERVED: 'border-warning/50 bg-warning/10', BLOCKED: 'border-muted bg-muted text-muted-foreground' };

function BulkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const bulk = useBulkSlots();
  const create = useCreateSlot();
  const [form, setForm] = React.useState({ mode: 'bulk', prefix: 'B1-', from: '1', to: '20', code: '', zone: '', level: '', type: 'CAR', monthlyCharge: '' });
  const submit = () => {
    const done = { onSuccess: (r: any) => { toast.success(form.mode === 'bulk' ? `${r.created} slots created${r.skipped ? `, ${r.skipped} already existed` : ''}` : 'Slot created'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (form.mode === 'bulk') bulk.mutate({ prefix: form.prefix, from: Number(form.from), to: Number(form.to), zone: form.zone || undefined, level: form.level || undefined, type: form.type, monthlyCharge: form.monthlyCharge ? Number(form.monthlyCharge) : undefined }, done);
    else create.mutate({ code: form.code, zone: form.zone || undefined, level: form.level || undefined, type: form.type, monthlyCharge: form.monthlyCharge ? Number(form.monthlyCharge) : undefined }, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Add parking slots</DialogTitle><DialogDescription>Create a numbered range in one go (B1-1 … B1-20) or a single slot.</DialogDescription></DialogHeader>
        <div className="flex gap-1.5">{(['bulk', 'single'] as const).map((m) => <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })} className={cn('rounded-full border px-3 py-1 text-xs', form.mode === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{m === 'bulk' ? 'Range' : 'Single slot'}</button>)}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {form.mode === 'bulk' ? <><div className="space-y-1.5"><Label htmlFor="pk-prefix">Prefix</Label><Input id="pk-prefix" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="pk-from">From</Label><Input id="pk-from" type="number" min={0} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="pk-to">To</Label><Input id="pk-to" type="number" min={0} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div></> : <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="pk-code">Slot code</Label><Input id="pk-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="V-7" /></div>}
          <div className="space-y-1.5"><Label htmlFor="pk-type">Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger id="pk-type"><SelectValue /></SelectTrigger><SelectContent>{SLOT_TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="pk-level">Level</Label><Input id="pk-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="Basement 1" /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-zone">Zone</Label><Input id="pk-zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Tower A side" /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-charge">Monthly charge (₹)</Label><Input id="pk-charge" type="number" min={0} value={form.monthlyCharge} onChange={(e) => setForm({ ...form, monthlyCharge: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={bulk.isPending || create.isPending} onClick={submit}><Plus /> Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocateDialog({ slot, onClose }: { slot: any | null; onClose: () => void }) {
  const allocate = useAllocateSlot();
  const units = useUnitOptions(Boolean(slot));
  const [unitId, setUnitId] = React.useState('');
  const vehicles = useVehicles({ unitId: unitId || undefined, unparkedOnly: 'true', limit: 50 }, Boolean(unitId));
  const [vehicleId, setVehicleId] = React.useState('');
  React.useEffect(() => { setUnitId(''); setVehicleId(''); }, [slot]);
  return (
    <Dialog open={Boolean(slot)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Allocate {slot?.code}</DialogTitle><DialogDescription>{slot ? `${formatStatus(slot.type)} slot${slot.level ? ` · ${slot.level}` : ''}` : ''}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Unit *</Label><Combobox value={unitId} onChange={(v) => { setUnitId(v ?? ''); setVehicleId(''); }} options={units.data ?? []} placeholder="Choose the unit" /></div>
          {unitId ? <div className="space-y-1.5"><Label>Vehicle (optional)</Label><Combobox value={vehicleId} onChange={(v) => setVehicleId(v ?? '')} options={(vehicles.data?.items ?? []).map((v: any) => ({ value: v.id, label: v.number, description: [formatStatus(v.type), v.make, v.model].filter(Boolean).join(' ') }))} placeholder="Unparked vehicles of this unit" emptyText="No unparked vehicles" /></div> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={allocate.isPending} disabled={!unitId} onClick={() => allocate.mutate({ id: slot.id, unitId, vehicleId: vehicleId || null }, { onSuccess: () => { toast.success(`${slot.code} allocated`); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Link2 /> Allocate</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Parking map: slots by level with allocation actions. */
export default function ParkingPage() {
  const { can } = usePermissions();
  const stats = useParkingStats();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [type, setType] = React.useState('');
  const slots = useParkingSlots({ search: search || undefined, status: status || undefined, type: type || undefined });
  const release = useReleaseSlot();
  const remove = useDeleteSlot();
  const { confirm, ConfirmElement } = useConfirm();
  const [adding, setAdding] = React.useState(false);
  const [allocating, setAllocating] = React.useState<any | null>(null);
  useOperationsRealtime();
  const items: any[] = slots.data?.items ?? [];
  const groups = items.reduce<Record<string, any[]>>((acc, s) => { const k = s.level || s.zone || 'Unassigned level'; (acc[k] = acc[k] ?? []).push(s); return acc; }, {});
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <div>
      <PageHeader title="Parking" description="Slots per level, allocations to units and vehicles." actions={<PermissionGate permission="parking:create"><SubscriptionGate><Button onClick={() => setAdding(true)}><Plus /> Add slots</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Slots" value={stats.data?.total ?? 0} hint={(stats.data?.byType ?? []).map((t: any) => `${t.allocated}/${t.total} ${formatStatus(t.type).toLowerCase()}`).join(' · ')} icon={<ParkingSquare />} loading={stats.isLoading} />
        <StatCard label="Occupancy" value={`${stats.data?.occupancyPercent ?? 0}%`} hint={`${stats.data?.allocated ?? 0} allocated · ${stats.data?.available ?? 0} free`} icon={<Layers />} tone={(stats.data?.occupancyPercent ?? 0) >= 90 ? 'warning' : 'default'} loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={() => { setSearch(''); setStatus(''); setType(''); }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Slot, level, zone…" className="w-full sm:w-64" />
        <FilterSelect value={status} onChange={setStatus} options={['AVAILABLE', 'ALLOCATED', 'RESERVED', 'BLOCKED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={type} onChange={setType} options={SLOT_TYPES.map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="All types" />
      </FilterBar>
      {slots.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<ParkingSquare />} title="No parking slots" description="Create the slots for each basement or open area, then allocate them to units." /> : (
        <div className="space-y-6">
          {Object.entries(groups).map(([level, list]) => (
            <div key={level}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{level} <span className="font-normal">· {list.filter((s) => s.status === 'ALLOCATED').length}/{list.length} allocated</span></h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {list.map((s) => (
                  <div key={s.id} className={cn('group relative rounded-md border p-2 text-xs transition-colors', TONE[s.status])}>
                    <p className="font-mono font-semibold">{s.code}</p>
                    <p className="text-muted-foreground">{formatStatus(s.type)}</p>
                    {s.status === 'ALLOCATED' ? <p className="mt-1 truncate font-medium">{s.allocation?.unitId?.code ?? '—'}{s.allocation?.vehicleId?.number ? <span className="block truncate font-mono font-normal text-muted-foreground">{s.allocation.vehicleId.number}</span> : null}</p> : <p className="mt-1 text-muted-foreground">{formatStatus(s.status)}</p>}
                    {can('parking:allocate') || can('parking:delete') ? <div className="mt-1 flex gap-1">
                      {s.status === 'AVAILABLE' && can('parking:allocate') ? <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setAllocating(s)}><Link2 className="h-3 w-3" /> Allocate</Button> : null}
                      {s.status === 'ALLOCATED' && can('parking:allocate') ? <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={async () => { if (await confirm({ title: `Release ${s.code}?`, description: `Currently allocated to ${s.allocation?.unitId?.code ?? 'a unit'}.`, confirmLabel: 'Release' })) release.mutate(s.id, { onError: err }); }}><Unlink className="h-3 w-3" /> Release</Button> : null}
                      {s.status !== 'ALLOCATED' && can('parking:delete') ? <Button size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={async () => { if (await confirm({ title: `Delete ${s.code}?`, destructive: true, confirmLabel: 'Delete' })) remove.mutate(s.id, { onError: err }); }}><Trash2 className="h-3 w-3" /></Button> : null}
                    </div> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <BulkDialog open={adding} onOpenChange={setAdding} />
      <AllocateDialog slot={allocating} onClose={() => setAllocating(null)} />
      {ConfirmElement}
    </div>
  );
}
