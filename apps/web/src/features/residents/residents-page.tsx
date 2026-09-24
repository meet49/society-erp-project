import * as React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Download, Truck, Mail, Trash2, Pencil, UserPlus } from 'lucide-react';
import { ResidentTypes } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { KeyValue } from '@/components/common/key-value';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { UserAvatar } from '@/components/ui/avatar';
import { useCreateResident, useDeleteResident, useExportResidents, useInviteResidentLogin, useResident, useResidentStats, useResidents, useUpdateResident } from '@/hooks/use-residents';
import { useUnitOptions, useBuildings } from '@/hooks/use-units';
import { formatDate, formatPhone, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export const blankResident = { unitId: '', name: '', type: 'OWNER', phone: '', email: '', relationship: '', isPrimary: true, moveInDate: '', occupation: '', bloodGroup: '', notes: '', rent: '', deposit: '', createLogin: false };

export function ResidentForm({ value, onChange, units, showUnit = true, showLogin = true }: { value: any; onChange: (v: any) => void; units: { value: string; label: string; description?: string }[]; showUnit?: boolean; showLogin?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showUnit ? <div className="space-y-1.5 sm:col-span-2"><Label>Unit *</Label><Combobox value={value.unitId} onChange={(v) => onChange({ ...value, unitId: v ?? '' })} options={units} placeholder="Select unit" /></div> : null}
      <div className="space-y-1.5"><Label>Full name *</Label><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Type</Label><Select value={value.type} onValueChange={(v) => onChange({ ...value, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ResidentTypes.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} /></div>
      {value.type === 'FAMILY' || value.type === 'CAREGIVER' || value.type === 'OTHER' ? <div className="space-y-1.5"><Label>Relationship</Label><Input value={value.relationship} onChange={(e) => onChange({ ...value, relationship: e.target.value })} placeholder="Spouse, son, nurse…" /></div> : null}
      {value.type === 'TENANT' ? (<><div className="space-y-1.5"><Label>Monthly rent</Label><Input type="number" min={0} value={value.rent} onChange={(e) => onChange({ ...value, rent: e.target.value })} /></div><div className="space-y-1.5"><Label>Deposit</Label><Input type="number" min={0} value={value.deposit} onChange={(e) => onChange({ ...value, deposit: e.target.value })} /></div></>) : null}
      <div className="space-y-1.5"><Label>Move-in date</Label><Input type="date" value={value.moveInDate} onChange={(e) => onChange({ ...value, moveInDate: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Occupation</Label><Input value={value.occupation} onChange={(e) => onChange({ ...value, occupation: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Blood group</Label><Input value={value.bloodGroup} onChange={(e) => onChange({ ...value, bloodGroup: e.target.value })} maxLength={5} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></div>
      {value.type === 'OWNER' || value.type === 'TENANT' ? <label className="flex items-center gap-2 text-sm"><Switch checked={value.isPrimary} onCheckedChange={(v) => onChange({ ...value, isPrimary: v })} /> Primary contact for the unit</label> : null}
      {showLogin ? <label className="flex items-center gap-2 text-sm"><Switch checked={value.createLogin} onCheckedChange={(v) => onChange({ ...value, createLogin: v })} disabled={!value.email} /> Email a login invitation</label> : null}
    </div>
  );
}

export const residentPayload = (v: any) => ({
  unitId: v.unitId || undefined,
  name: v.name,
  type: v.type,
  phone: v.phone || undefined,
  email: v.email || undefined,
  relationship: v.relationship || undefined,
  isPrimary: Boolean(v.isPrimary),
  moveInDate: v.moveInDate || undefined,
  occupation: v.occupation || undefined,
  bloodGroup: v.bloodGroup || undefined,
  notes: v.notes || undefined,
  tenancy: v.type === 'TENANT' && (v.rent || v.deposit) ? { rent: v.rent ? Number(v.rent) : undefined, deposit: v.deposit ? Number(v.deposit) : undefined } : undefined,
  createLogin: Boolean(v.createLogin && v.email),
});

function ResidentDetail({ id, onClose, units }: { id: string; onClose: () => void; units: any[] }) {
  const resident = useResident(id);
  const update = useUpdateResident();
  const remove = useDeleteResident();
  const invite = useInviteResidentLogin();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>(null);
  const r = resident.data;
  if (!r) return null;
  return (
    <div className="space-y-5">
      {ConfirmElement}
      <div className="flex items-center gap-3">
        <UserAvatar name={r.name} src={r.photoUrl} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs text-muted-foreground">{formatStatus(r.type)}{r.relationship ? ` · ${r.relationship}` : ''} · <Link to={`/app/units/${r.unitId?.id ?? r.unitId?._id ?? r.unitId}`} className="text-primary hover:underline">{r.unitId?.code}</Link></p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <KeyValue columns={2} items={[{ label: 'Phone', value: formatPhone(r.phone) }, { label: 'Email', value: r.email ?? '—' }, { label: 'Move-in', value: formatDate(r.moveInDate) }, { label: 'Move-out', value: formatDate(r.moveOutDate) }, { label: 'Occupation', value: r.occupation ?? '—' }, { label: 'Blood group', value: r.bloodGroup ?? '—' }, ...(r.type === 'TENANT' ? [{ label: 'Rent / deposit', value: `${r.tenancy?.rent ?? '—'} / ${r.tenancy?.deposit ?? '—'}` }] : []), { label: 'Login', value: r.userId ? <Badge variant="success">Linked · {r.userId.email}</Badge> : <Badge variant="muted">No login</Badge> }, { label: 'Notes', value: r.notes ?? '—', span: 2 }]} />
      {r.emergencyContacts?.length ? <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Emergency contacts</p><ul className="text-sm">{r.emergencyContacts.map((c: any) => <li key={c.phone}>{c.name} · {formatPhone(c.phone)} {c.relation ? `(${c.relation})` : ''}</li>)}</ul></div> : null}
      {r.moves?.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Move history</p>
          <ul className="space-y-1 text-sm">{r.moves.map((m: any) => <li key={m._id ?? m.id} className="flex justify-between gap-2"><span>{formatStatus(m.type)} · {formatStatus(m.approvalStatus)}</span><span className="text-xs text-muted-foreground">{formatDate(m.date)}</span></li>)}</ul>
        </div>
      ) : null}
      <SubscriptionGate>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <PermissionGate permission="residents:update">
            <Button variant="outline" size="sm" onClick={() => { setForm({ ...blankResident, unitId: r.unitId?.id ?? r.unitId?._id ?? r.unitId, name: r.name, type: r.type, phone: r.phone ?? '', email: r.email ?? '', relationship: r.relationship ?? '', isPrimary: Boolean(r.isPrimary), moveInDate: toInputDate(r.moveInDate), occupation: r.occupation ?? '', bloodGroup: r.bloodGroup ?? '', notes: r.notes ?? '', rent: r.tenancy?.rent ?? '', deposit: r.tenancy?.deposit ?? '' }); setEditing(true); }}><Pencil /> Edit</Button>
            {!r.userId ? <Button variant="outline" size="sm" loading={invite.isPending} onClick={() => invite.mutate({ id }, { onSuccess: () => toast.success('Invitation sent'), onError: (e) => toast.error(getErrorMessage(e)) })}><Mail /> Invite to app</Button> : null}
          </PermissionGate>
          <PermissionGate permission="residents:delete">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => { if (await confirm({ title: `Remove ${r.name}?`, description: 'Use Move-out for tenants and owners leaving the society; removal is for records created by mistake.', destructive: true, confirmLabel: 'Remove' })) remove.mutate(id, { onSuccess: () => { toast.success('Resident removed'); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /> Remove</Button>
          </PermissionGate>
        </div>
      </SubscriptionGate>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Edit {r.name}</DialogTitle></DialogHeader>
          {form ? <ResidentForm value={form} onChange={setForm} units={units} showLogin={false} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button loading={update.isPending} onClick={() => update.mutate({ id, ...residentPayload(form), createLogin: undefined }, { onSuccess: () => { toast.success('Resident updated'); setEditing(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ResidentsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: 'name' });
  const residents = useResidents(list.params);
  const stats = useResidentStats();
  const buildings = useBuildings();
  const units = useUnitOptions();
  const create = useCreateResident();
  const exportRows = useExportResidents();
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState<any>(blankResident);
  return (
    <div>
      <PageHeader
        title="Residents"
        description="Owners, tenants, family members and caregivers."
        actions={
          <>
            <PermissionGate permission={['residents:move', 'residents:approve_move']}><Button asChild variant="outline"><Link to="/app/residents/moves"><Truck /> Move in / out</Link></Button></PermissionGate>
            <PermissionGate permission="residents:export"><Button variant="outline" onClick={() => exportRows.mutate()} loading={exportRows.isPending}><Download /> Export</Button></PermissionGate>
            <SubscriptionGate><PermissionGate permission="residents:create"><Button onClick={() => setAdding(true)}><Plus /> Add resident</Button></PermissionGate></SubscriptionGate>
          </>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Residents" value={stats.data?.total ?? 0} loading={stats.isLoading} />
        <StatCard label="Owners" value={stats.data?.byType?.OWNER ?? 0} tone="primary" loading={stats.isLoading} />
        <StatCard label="Tenants" value={stats.data?.byType?.TENANT ?? 0} tone="success" loading={stats.isLoading} />
        <StatCard label="With app login" value={stats.data?.withLogin ?? 0} hint={stats.data?.pendingMoves ? `${stats.data.pendingMoves} moves pending approval` : undefined} icon={<UserPlus />} loading={stats.isLoading} to="/app/residents/moves" />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, phone, email…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.buildingId ?? ''} onChange={(v) => list.setFilter('buildingId', v)} options={(buildings.data ?? []).map((b: any) => ({ value: b.id, label: b.name }))} allLabel="All buildings" />
        <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={ResidentTypes.map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="Any type" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'PENDING', 'MOVED_OUT', 'INACTIVE'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Active" />
        <FilterSelect value={list.filters.hasLogin ?? ''} onChange={(v) => list.setFilter('hasLogin', v)} options={[{ value: 'true', label: 'Has login' }, { value: 'false', label: 'No login' }]} allLabel="Login: any" />
      </FilterBar>
      <DataTable
        rows={residents.data?.items}
        loading={residents.isFetching}
        error={residents.error}
        onRetry={() => residents.refetch()}
        rowKey={(r: any) => r.id}
        onRowClick={(r: any) => navigate(`/app/residents/${r.id}`)}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No residents yet"
        emptyDescription="Add residents manually or import them from a spreadsheet."
        columns={[
          { key: 'name', header: 'Resident', sortable: true, cell: (r: any) => (<div className="flex items-center gap-3"><UserAvatar name={r.name} src={r.photoUrl} /><div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{formatStatus(r.type)}{r.isPrimary ? ' · primary' : ''}{r.relationship ? ` · ${r.relationship}` : ''}</p></div></div>) },
          { key: 'unit', header: 'Unit', cell: (r: any) => (<div><p>{r.unitId?.code ?? '—'}</p><p className="text-xs text-muted-foreground">{r.unitId?.buildingId?.name ?? ''}</p></div>) },
          { key: 'phone', header: 'Phone', hideBelow: 'md', cell: (r: any) => formatPhone(r.phone) },
          { key: 'email', header: 'Email', hideBelow: 'lg', cell: (r: any) => r.email ?? '—' },
          { key: 'login', header: 'Login', hideBelow: 'md', cell: (r: any) => (r.userId ? <Badge variant="success">Yes</Badge> : <Badge variant="muted">No</Badge>) },
          { key: 'status', header: 'Status', sortable: true, cell: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        pagination={residents.data ? { page: residents.data.page, pages: residents.data.pages, total: residents.data.total, limit: residents.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Add resident</DialogTitle><DialogDescription>Owners and tenants update the unit's occupancy automatically.</DialogDescription></DialogHeader>
          <ResidentForm value={form} onChange={setForm} units={units.data ?? []} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!form.name || !form.unitId} onClick={() => create.mutate(residentPayload(form), { onSuccess: () => { toast.success('Resident added'); setAdding(false); setForm(blankResident); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Add resident</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={Boolean(id)} onOpenChange={(o) => !o && navigate('/app/residents')}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader><SheetTitle>Resident</SheetTitle><SheetDescription>Profile, unit, login and move history.</SheetDescription></SheetHeader>
          <div className="mt-6">{id ? <ResidentDetail id={id} onClose={() => navigate('/app/residents')} units={units.data ?? []} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
