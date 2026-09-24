import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Car, Sticker, ParkingSquare, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateVehicle, useDeleteVehicle, useOperationsRealtime, useUpdateVehicle, useVehicleStats, useVehicles } from '@/hooks/use-operations';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export const VEHICLE_TYPES = ['CAR', 'BIKE', 'SCOOTER', 'EV', 'BICYCLE', 'OTHER'];
const blank = { unitId: '', number: '', type: 'CAR', make: '', model: '', color: '', stickerNumber: '', notes: '' };

/** Register / edit a vehicle. Residents book against their own unit; the office picks any unit and issues stickers. */
export function VehicleDialog({ open, onOpenChange, vehicle, unitOptions, member }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle?: any | null; unitOptions?: { value: string; label: string }[]; member?: boolean }) {
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const [form, setForm] = React.useState(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(vehicle ? { unitId: vehicle.unitId?.id ?? '', number: vehicle.number, type: vehicle.type, make: vehicle.make ?? '', model: vehicle.model ?? '', color: vehicle.color ?? '', stickerNumber: vehicle.stickerNumber ?? '', notes: vehicle.notes ?? '' } : { ...blank, unitId: unitOptions?.length === 1 ? unitOptions[0].value : '' });
  }, [open, vehicle, unitOptions]);
  const submit = () => {
    const payload: any = { number: form.number, type: form.type, make: form.make || undefined, model: form.model || undefined, color: form.color || undefined, notes: form.notes || undefined };
    if (!member) payload.stickerNumber = form.stickerNumber || undefined;
    const done = { onSuccess: () => { toast.success(vehicle ? 'Vehicle updated' : 'Vehicle registered'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (vehicle) update.mutate({ id: vehicle.id, ...payload }, done); else create.mutate({ ...payload, unitId: form.unitId || undefined }, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{vehicle ? `Edit ${vehicle.number}` : 'Register vehicle'}</DialogTitle><DialogDescription>Number plates are stored without spaces; guards look vehicles up by plate or sticker.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!vehicle && unitOptions && unitOptions.length > 1 ? <div className="space-y-1.5 sm:col-span-2"><Label>Unit</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={unitOptions} placeholder="Which flat" /></div> : null}
          <div className="space-y-1.5"><Label htmlFor="vh-number">Number plate *</Label><Input id="vh-number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.toUpperCase() })} placeholder="KA 01 AB 1234" /></div>
          <div className="space-y-1.5"><Label htmlFor="vh-type">Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger id="vh-type"><SelectValue /></SelectTrigger><SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="vh-make">Make</Label><Input id="vh-make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vh-model">Model</Label><Input id="vh-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vh-color">Colour</Label><Input id="vh-color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
          {!member ? <div className="space-y-1.5"><Label htmlFor="vh-sticker">Sticker number</Label><Input id="vh-sticker" value={form.stickerNumber} onChange={(e) => setForm({ ...form, stickerNumber: e.target.value })} /></div> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="vh-notes">Notes</Label><Input id="vh-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={form.number.trim().length < 4} onClick={submit}>{vehicle ? 'Save' : 'Register'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Office view of the vehicle registry. */
export default function VehiclesPage() {
  const { can } = usePermissions();
  const stats = useVehicleStats();
  const list = useListState({ limit: 25, sort: 'number' });
  const vehicles = useVehicles(list.params);
  const units = useUnitOptions(can('vehicles:create'));
  const remove = useDeleteVehicle();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useOperationsRealtime();
  return (
    <div>
      <PageHeader title="Vehicles" description="Resident vehicle registry with stickers and parking allocations." actions={<PermissionGate permission="vehicles:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Register vehicle</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Registered vehicles" value={stats.data?.total ?? 0} hint={(stats.data?.byType ?? []).map((t: any) => `${t.count} ${formatStatus(t.type).toLowerCase()}`).join(' · ')} icon={<Car />} loading={stats.isLoading} />
        <StatCard label="With sticker" value={stats.data?.withSticker ?? 0} icon={<Sticker />} loading={stats.isLoading} />
        <StatCard label="Cars without a slot" value={stats.data?.unparkedCars ?? 0} icon={<ParkingSquare />} tone={(stats.data?.unparkedCars ?? 0) > 0 ? 'warning' : 'default'} to="/app/parking" loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Plate, sticker, make…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={VEHICLE_TYPES.map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="All types" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.unparkedOnly === 'true'} onCheckedChange={(v) => list.setFilter('unparkedOnly', v ? 'true' : '')} /> Without a slot</label>
      </FilterBar>
      <DataTable
        rows={vehicles.data?.items}
        loading={vehicles.isFetching}
        error={vehicles.error}
        onRetry={() => vehicles.refetch()}
        rowKey={(v: any) => v.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No vehicles yet"
        emptyDescription="Residents register their own vehicles from My Vehicles; the office can add them here."
        columns={[
          { key: 'number', header: 'Vehicle', sortable: true, cell: (v: any) => <span><span className="font-mono font-medium">{v.number}</span><span className="block text-xs text-muted-foreground">{[formatStatus(v.type), v.make, v.model, v.color].filter(Boolean).join(' · ')}</span></span> },
          { key: 'unit', header: 'Unit', cell: (v: any) => <span>{v.unitId?.code ?? '—'}{v.residentId?.name ? <span className="block text-xs text-muted-foreground">{v.residentId.name}</span> : null}</span> },
          { key: 'stickerNumber', header: 'Sticker', sortable: true, hideBelow: 'md', cell: (v: any) => v.stickerNumber ? <Badge variant="outline">{v.stickerNumber}</Badge> : <span className="text-muted-foreground">—</span> },
          { key: 'slot', header: 'Parking', hideBelow: 'md', cell: (v: any) => v.parkingSlotId?.code ?? <span className="text-muted-foreground">—</span> },
          { key: 'status', header: 'Status', hideBelow: 'lg', cell: (v: any) => <StatusBadge status={v.status} /> },
          { key: 'actions', header: '', cell: (v: any) => <span className="flex justify-end gap-1">{can('vehicles:update') ? <Button size="sm" variant="ghost" onClick={() => setEditing(v)}><Pencil /></Button> : null}{can('vehicles:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Remove ${v.number}?`, destructive: true, confirmLabel: 'Remove' })) remove.mutate(v.id, { onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /></Button> : null}</span> },
        ]}
        pagination={vehicles.data ? { page: vehicles.data.page, pages: vehicles.data.pages, total: vehicles.data.total, limit: vehicles.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <VehicleDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} vehicle={editing === 'new' ? null : editing} unitOptions={units.data ?? []} />
      {ConfirmElement}
    </div>
  );
}
