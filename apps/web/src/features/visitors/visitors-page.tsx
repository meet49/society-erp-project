import * as React from 'react';
import { toast } from 'sonner';
import { Download, SlidersHorizontal, DoorOpen, Users, Clock, LogIn, Plus } from 'lucide-react';
import { VisitorStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { ChartCard, SimpleBarChart, HorizontalBars } from '@/components/common/charts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { KeyValue } from '@/components/common/key-value';
import { useCreateGate, useExportVisitors, useGates, useSaveVisitorSettings, useUpdateGate, useVisitor, useVisitorRealtime, useVisitorSettings, useVisitorStats, useVisitors } from '@/hooks/use-visitors';
import { useCategories } from '@/hooks/use-society';
import { formatDateTime, formatStatus, formatTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const settings = useVisitorSettings();
  const save = useSaveVisitorSettings();
  const gates = useGates();
  const createGate = useCreateGate();
  const updateGate = useUpdateGate();
  const [form, setForm] = React.useState<any>(null);
  const [gate, setGate] = React.useState({ name: '', code: '' });
  React.useEffect(() => { if (open && settings.data) setForm({ ...settings.data }); }, [open, settings.data]);
  if (!form) return null;
  const num = (k: string, label: string, min = 0, max = 720) => <div className="space-y-1.5"><Label htmlFor={`vs-${k}`}>{label}</Label><Input id={`vs-${k}`} type="number" min={min} max={max} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>;
  const bool = (k: string, label: string) => <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form[k])} onCheckedChange={(v) => setForm({ ...form, [k]: v })} /> {label}</label>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Visitor & gate settings</DialogTitle><DialogDescription>Pass validity, what guards must capture, approval timeouts and the gates of the society.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {num('passValidityHours', 'Pass validity (hours)', 1)}
          {num('passcodeLength', 'Passcode length', 4, 8)}
          {num('dailyGuestCap', 'Daily guest cap per unit (0 = none)', 0, 500)}
          {num('walkInApprovalTimeoutMinutes', 'Walk-in approval timeout (minutes)', 1, 120)}
          {num('autoCheckoutHours', 'Auto check-out after (hours)', 1, 72)}
          <div className="space-y-2 sm:col-span-2">{bool('requirePhoto', 'Guards must take a photo at check-in')}{bool('requireVehicleNumber', 'Vehicle number is mandatory for walk-ins')}{bool('notifyOnCheckin', 'Notify residents when their visitor checks in')}{bool('notifyOnCheckout', 'Notify residents on check-out')}</div>
          <div className="sm:col-span-2">
            <Label className="mb-2 block">Gates</Label>
            <ul className="space-y-1 text-sm">{(gates.data ?? []).map((g: any) => <li key={g.id} className="flex items-center justify-between rounded border px-2 py-1"><span>{g.name} <span className="text-xs text-muted-foreground">{g.code}</span>{g.isDefault ? <Badge variant="secondary" className="ml-2">Default</Badge> : null}{!g.isActive ? <Badge variant="muted" className="ml-2">Inactive</Badge> : null}</span><span className="flex gap-1">{!g.isDefault ? <Button variant="ghost" size="sm" onClick={() => updateGate.mutate({ id: g.id, isDefault: true })}>Make default</Button> : null}<Button variant="ghost" size="sm" onClick={() => updateGate.mutate({ id: g.id, isActive: !g.isActive })}>{g.isActive ? 'Disable' : 'Enable'}</Button></span></li>)}</ul>
            <div className="mt-2 flex gap-2"><Input placeholder="Gate name" value={gate.name} onChange={(e) => setGate({ ...gate, name: e.target.value })} aria-label="New gate name" /><Input placeholder="Code" className="w-28" value={gate.code} onChange={(e) => setGate({ ...gate, code: e.target.value.toUpperCase() })} aria-label="New gate code" /><Button variant="outline" disabled={!gate.name || !gate.code} loading={createGate.isPending} onClick={() => createGate.mutate(gate, { onSuccess: () => { toast.success('Gate added'); setGate({ name: '', code: '' }); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Plus /> Add</Button></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button loading={save.isPending} onClick={() => save.mutate(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v])), { onSuccess: () => { toast.success('Settings saved'); onOpenChange(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisitorDetail({ id }: { id: string }) {
  const visitor = useVisitor(id);
  const v = visitor.data;
  if (!v) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">{v.photoUrl ? <img src={v.photoUrl} alt="" className="h-16 w-16 rounded-md object-cover" /> : null}<div><p className="text-lg font-semibold">{v.name}</p><p className="text-sm text-muted-foreground">{formatStatus(v.categoryKey)}{v.companyName ? ` · ${v.companyName}` : ''} · {formatStatus(v.entryType)}</p><StatusBadge status={v.status} className="mt-1" /></div></div>
      <KeyValue columns={2} items={[{ label: 'Unit', value: v.unitId?.code }, { label: 'Host', value: v.hostUserId?.name ?? '—' }, { label: 'Phone', value: v.phone ?? '—' }, { label: 'Vehicle', value: v.vehicleNumber ?? '—' }, { label: 'Guests', value: v.guestCount }, { label: 'Purpose', value: v.purpose ?? '—' }, { label: 'Valid', value: `${formatDateTime(v.validFrom)} → ${formatDateTime(v.validUntil)}`, span: 2 }, { label: 'Checked in', value: v.checkInAt ? `${formatDateTime(v.checkInAt)} · ${v.checkInGateId?.name ?? ''} · ${v.checkedInBy?.name ?? ''}` : '—', span: 2 }, { label: 'Checked out', value: v.checkOutAt ? `${formatDateTime(v.checkOutAt)} · ${v.checkedOutBy?.name ?? ''}` : '—', span: 2 }, ...(v.deniedReason ? [{ label: 'Denied', value: v.deniedReason, span: 2 }] : [])]} />
      <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Timeline</p><ol className="space-y-1 text-sm">{(v.timeline ?? []).map((t: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{formatStatus(t.action)}{t.userId?.name ? ` · ${t.userId.name}` : ''}{t.note && !t.note.startsWith('ref:') ? ` · ${t.note}` : ''}</span><span className="text-xs text-muted-foreground">{formatDateTime(t.at)}</span></li>)}</ol></div>
    </div>
  );
}

export default function VisitorsPage() {
  const list = useListState({ sort: '-createdAt' });
  const visitors = useVisitors(list.params);
  const stats = useVisitorStats();
  const categories = useCategories('VISITOR_CATEGORY');
  const gates = useGates();
  const exportRows = useExportVisitors();
  const [settings, setSettings] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  useVisitorRealtime();
  return (
    <div>
      <PageHeader title="Visitors" description="Every entry through the gates: pre-approved passes, walk-ins and their approvals." actions={<SubscriptionGate><PermissionGate permission="visitors:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate><PermissionGate permission="visitors:configure"><Button variant="outline" onClick={() => setSettings(true)}><SlidersHorizontal /> Settings & gates</Button></PermissionGate></SubscriptionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Inside now" value={stats.data?.inside ?? 0} icon={<Users />} tone="primary" loading={stats.isLoading} />
        <StatCard label="Checked in today" value={stats.data?.today ?? 0} icon={<LogIn />} loading={stats.isLoading} />
        <StatCard label="Awaiting approval" value={stats.data?.pending ?? 0} icon={<Clock />} tone={(stats.data?.pending ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Gates" value={gates.data?.filter((g: any) => g.isActive).length ?? 0} icon={<DoorOpen />} loading={gates.isLoading} />
      </StatGrid>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Check-ins (last 7 days)" loading={stats.isLoading} columns={[{ key: 'day', label: 'Day' }, { key: 'count', label: 'Check-ins' }]} rows={stats.data?.week ?? []}><SimpleBarChart data={stats.data?.week ?? []} xKey="day" series={[{ key: 'count', label: 'Check-ins' }]} height={200} xFormatter={(d) => String(d).slice(5)} /></ChartCard>
        <Card><CardHeader><CardTitle className="text-sm">By category (30 days)</CardTitle></CardHeader><CardContent>{(stats.data?.byCategory ?? []).length ? <HorizontalBars data={(stats.data?.byCategory ?? []).map((c: any) => ({ label: formatStatus(c.category), value: c.count }))} labelKey="label" valueKey="value" /> : <p className="text-sm text-muted-foreground">No visits yet.</p>}</CardContent></Card>
      </div>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, phone, vehicle…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(VisitorStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.entryType ?? ''} onChange={(v) => list.setFilter('entryType', v)} options={[{ value: 'PRE_APPROVED', label: 'Pre-approved' }, { value: 'WALK_IN', label: 'Walk-in' }]} allLabel="Any type" />
        <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
      </FilterBar>
      <DataTable
        rows={visitors.data?.items}
        loading={visitors.isFetching}
        error={visitors.error}
        onRetry={() => visitors.refetch()}
        rowKey={(v: any) => v.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(v: any) => setSelected(v.id)}
        emptyTitle="No visitors yet"
        columns={[
          { key: 'name', header: 'Visitor', sortable: true, cell: (v: any) => <span><span className="font-medium">{v.name}</span><span className="block text-xs text-muted-foreground">{formatStatus(v.categoryKey)}{v.companyName ? ` · ${v.companyName}` : ''}{v.vehicleNumber ? ` · ${v.vehicleNumber}` : ''}</span></span> },
          { key: 'unit', header: 'Unit / host', cell: (v: any) => <span>{v.unitId?.code}<span className="block text-xs text-muted-foreground">{v.hostUserId?.name ?? ''}</span></span> },
          { key: 'entryType', header: 'Type', hideBelow: 'md', cell: (v: any) => formatStatus(v.entryType) },
          { key: 'checkInAt', header: 'In / out', sortable: true, hideBelow: 'sm', cell: (v: any) => (v.checkInAt ? `${formatTime(v.checkInAt)}${v.checkOutAt ? ` → ${formatTime(v.checkOutAt)}` : ''}` : v.expectedAt ? `exp. ${formatDateTime(v.expectedAt)}` : '—') },
          { key: 'gate', header: 'Gate', hideBelow: 'lg', cell: (v: any) => v.checkInGateId?.name ?? '—' },
          { key: 'status', header: 'Status', sortable: true, cell: (v: any) => <StatusBadge status={v.status} /> },
        ]}
        pagination={visitors.data ? { page: visitors.data.page, pages: visitors.data.pages, total: visitors.data.total, limit: visitors.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <SettingsDialog open={settings} onOpenChange={setSettings} />
      <Sheet open={Boolean(selected)} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Visitor</SheetTitle><SheetDescription>Pass details and gate timeline.</SheetDescription></SheetHeader><div className="mt-4">{selected ? <VisitorDetail id={selected} /> : null}</div></SheetContent>
      </Sheet>
    </div>
  );
}
