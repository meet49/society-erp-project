import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Download, Layers, Building } from 'lucide-react';
import { UnitOccupancyStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBuildings, useBulkCreateUnits, useCreateUnit, useExportUnits, useUnitStats, useUnits } from '@/hooks/use-units';
import { useCategories } from '@/hooks/use-society';
import { formatNumber, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export function UnitForm({ value, onChange, buildings, unitTypes }: { value: any; onChange: (v: any) => void; buildings: any[]; unitTypes: any[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Building</Label><Select value={value.buildingId || 'none'} onValueChange={(v) => onChange({ ...value, buildingId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No building</SelectItem>{buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Unit type</Label><Select value={value.type} onValueChange={(v) => onChange({ ...value, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{unitTypes.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Floor</Label><Input type="number" value={value.floor} onChange={(e) => onChange({ ...value, floor: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Number *</Label><Input value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} placeholder="1204" /></div>
      <div className="space-y-1.5"><Label>Code (optional)</Label><Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value.toUpperCase() })} placeholder="Auto: BUILDING-NUMBER" /></div>
      <div className="space-y-1.5"><Label>Area (sq ft)</Label><Input type="number" min={0} value={value.areaSqft} onChange={(e) => onChange({ ...value, areaSqft: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Bedrooms</Label><Input type="number" min={0} value={value.bedrooms} onChange={(e) => onChange({ ...value, bedrooms: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Opening balance</Label><Input type="number" value={value.openingBalance} onChange={(e) => onChange({ ...value, openingBalance: e.target.value })} /></div>
    </div>
  );
}

export const blankUnit = { buildingId: '', type: 'FLAT', floor: '0', number: '', code: '', areaSqft: '', bedrooms: '', openingBalance: '0' };
export const unitPayload = (v: any) => ({ buildingId: v.buildingId || null, type: v.type, floor: Number(v.floor) || 0, number: v.number, code: v.code || undefined, areaSqft: Number(v.areaSqft) || 0, bedrooms: v.bedrooms ? Number(v.bedrooms) : undefined, openingBalance: Number(v.openingBalance) || 0 });

export default function UnitsPage() {
  const navigate = useNavigate();
  const list = useListState({ sort: 'code' });
  const units = useUnits(list.params);
  const stats = useUnitStats();
  const buildings = useBuildings();
  const unitTypes = useCategories('UNIT_TYPE');
  const create = useCreateUnit();
  const bulk = useBulkCreateUnits();
  const exportUnits = useExportUnits();
  const [adding, setAdding] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(blankUnit);
  const [bulkForm, setBulkForm] = React.useState({ buildingId: '', floorFrom: '1', floorTo: '1', unitsPerFloor: '4', numberPattern: '{floor}{seq2}', type: 'FLAT' });
  return (
    <div>
      <PageHeader
        title="Units"
        description="Flats, villas, shops and offices with owner / tenant mapping."
        actions={
          <>
            <PermissionGate permission="units:manage_structure"><Button asChild variant="outline"><Link to="/app/buildings"><Building /> Buildings</Link></Button></PermissionGate>
            <PermissionGate permission="units:export"><Button variant="outline" onClick={() => exportUnits.mutate()} loading={exportUnits.isPending}><Download /> Export</Button></PermissionGate>
            <SubscriptionGate><PermissionGate permission="units:create"><Button variant="outline" onClick={() => setBulkOpen(true)}><Layers /> Generate</Button><Button onClick={() => setAdding(true)}><Plus /> Add unit</Button></PermissionGate></SubscriptionGate>
          </>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Total units" value={stats.data?.total ?? 0} loading={stats.isLoading} />
        <StatCard label="Owner occupied" value={stats.data?.byOccupancy?.OWNER_OCCUPIED ?? 0} tone="success" loading={stats.isLoading} />
        <StatCard label="Tenant occupied" value={stats.data?.byOccupancy?.TENANT_OCCUPIED ?? 0} tone="primary" loading={stats.isLoading} />
        <StatCard label="Vacant" value={stats.data?.byOccupancy?.VACANT ?? 0} tone="warning" loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search code or number…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.buildingId ?? ''} onChange={(v) => list.setFilter('buildingId', v)} options={(buildings.data ?? []).map((b: any) => ({ value: b.id, label: b.name }))} allLabel="All buildings" />
        <FilterSelect value={list.filters.occupancyStatus ?? ''} onChange={(v) => list.setFilter('occupancyStatus', v)} options={UnitOccupancyStatus.map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any occupancy" />
        <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={(unitTypes.data ?? []).map((t: any) => ({ value: t.key, label: t.name }))} allLabel="Any type" />
      </FilterBar>
      <DataTable
        rows={units.data?.items}
        loading={units.isFetching}
        error={units.error}
        onRetry={() => units.refetch()}
        rowKey={(u: any) => u.id}
        onRowClick={(u: any) => navigate(`/app/units/${u.id}`)}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No units yet"
        emptyDescription="Add units one by one, generate them per floor, or import from a spreadsheet."
        columns={[
          { key: 'code', header: 'Unit', sortable: true, cell: (u: any) => (<div><p className="font-medium">{u.code}</p><p className="text-xs text-muted-foreground">{u.buildingId?.name ?? 'No building'} · floor {u.floor}</p></div>) },
          { key: 'type', header: 'Type', cell: (u: any) => formatStatus(u.type) },
          { key: 'areaSqft', header: 'Area', sortable: true, hideBelow: 'md', cell: (u: any) => (u.areaSqft ? `${formatNumber(u.areaSqft)} sq ft` : '—') },
          { key: 'owner', header: 'Owner', hideBelow: 'md', cell: (u: any) => u.ownerResidentId?.name ?? '—' },
          { key: 'tenant', header: 'Tenant', hideBelow: 'lg', cell: (u: any) => u.tenantResidentId?.name ?? '—' },
          { key: 'occupancyStatus', header: 'Occupancy', sortable: true, cell: (u: any) => <StatusBadge status={u.occupancyStatus} /> },
        ]}
        pagination={units.data ? { page: units.data.page, pages: units.data.pages, total: units.data.total, limit: units.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Add unit</DialogTitle><DialogDescription>The unit code is generated from the building code and number unless you set one.</DialogDescription></DialogHeader>
          <UnitForm value={form} onChange={setForm} buildings={buildings.data ?? []} unitTypes={unitTypes.data ?? []} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!form.number} onClick={() => create.mutate(unitPayload(form), { onSuccess: () => { toast.success('Unit added'); setAdding(false); setForm(blankUnit); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Add unit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Generate units per floor</DialogTitle><DialogDescription>Tokens: {'{floor}'} {'{seq}'} {'{seq2}'} {'{building}'}. Existing codes are skipped.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3"><Label>Building</Label><Select value={bulkForm.buildingId} onValueChange={(v) => setBulkForm({ ...bulkForm, buildingId: v })}><SelectTrigger><SelectValue placeholder="Select building" /></SelectTrigger><SelectContent>{(buildings.data ?? []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Floor from</Label><Input type="number" value={bulkForm.floorFrom} onChange={(e) => setBulkForm({ ...bulkForm, floorFrom: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Floor to</Label><Input type="number" value={bulkForm.floorTo} onChange={(e) => setBulkForm({ ...bulkForm, floorTo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Units per floor</Label><Input type="number" value={bulkForm.unitsPerFloor} onChange={(e) => setBulkForm({ ...bulkForm, unitsPerFloor: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Pattern</Label><Input value={bulkForm.numberPattern} onChange={(e) => setBulkForm({ ...bulkForm, numberPattern: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Type</Label><Select value={bulkForm.type} onValueChange={(v) => setBulkForm({ ...bulkForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(unitTypes.data ?? []).map((t: any) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button loading={bulk.isPending} disabled={!bulkForm.buildingId} onClick={() => bulk.mutate({ ...bulkForm, floorFrom: Number(bulkForm.floorFrom), floorTo: Number(bulkForm.floorTo), unitsPerFloor: Number(bulkForm.unitsPerFloor) }, { onSuccess: (r) => { toast.success(`${r.created} units created${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`); setBulkOpen(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
