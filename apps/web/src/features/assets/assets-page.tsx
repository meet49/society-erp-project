import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Boxes, Wrench, ShieldCheck, IndianRupee, Download, Pencil, Trash2, Hammer, PowerOff, Recycle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { KeyValue } from '@/components/common/key-value';
import { Combobox } from '@/components/common/combobox';
import { CardSkeleton } from '@/components/common/loading-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { FileUpload } from '@/components/common/file-upload';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAsset, useAssetCategories, useAssetStats, useAssetStatus, useAssets, useAssetsRealtime, useCreateAsset, useDeleteAsset, useExportAssets, useLogMaintenance, useUpdateAsset } from '@/hooks/use-assets';
import { useVendorOptions } from '@/hooks/use-expenses';
import { useBuildings } from '@/hooks/use-units';
import { uploadFile } from '@/hooks/use-documents';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatCurrency, formatDate, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const MAINTENANCE_TYPES = ['PREVENTIVE', 'BREAKDOWN', 'INSPECTION', 'AMC_VISIT', 'UPGRADE'];
const blank = { name: '', categoryKey: '', location: '', buildingId: '', make: '', model: '', serialNumber: '', purchaseDate: '', purchaseCost: '', vendorId: '', invoiceNumber: '', warrantyUntil: '', expectedLifeYears: '', salvageValue: '', maintenanceIntervalMonths: '', nextMaintenanceDue: '', custodian: '', description: '' };

function AssetDialog({ open, onOpenChange, asset }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: any | null }) {
  const categories = useAssetCategories();
  const vendors = useVendorOptions(open);
  const buildings = useBuildings();
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const [form, setForm] = React.useState(blank);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setFiles([]);
    setForm(asset ? { name: asset.name, categoryKey: asset.categoryKey, location: asset.location ?? '', buildingId: asset.buildingId?.id ?? '', make: asset.make ?? '', model: asset.model ?? '', serialNumber: asset.serialNumber ?? '', purchaseDate: toInputDate(asset.purchaseDate), purchaseCost: asset.purchaseCost ? String(asset.purchaseCost) : '', vendorId: asset.vendorId?.id ?? '', invoiceNumber: asset.invoiceNumber ?? '', warrantyUntil: toInputDate(asset.warrantyUntil), expectedLifeYears: asset.expectedLifeYears ? String(asset.expectedLifeYears) : '', salvageValue: asset.salvageValue ? String(asset.salvageValue) : '', maintenanceIntervalMonths: asset.maintenanceIntervalMonths ? String(asset.maintenanceIntervalMonths) : '', nextMaintenanceDue: toInputDate(asset.nextMaintenanceDue), custodian: asset.custodian ?? '', description: asset.description ?? '' } : blank);
  }, [open, asset]);
  const submit = async () => {
    setBusy(true);
    try {
      const documents = [];
      for (const f of files) { const stored = await uploadFile(f, 'assets'); documents.push({ storageKey: stored.storageKey, name: stored.name, mimeType: stored.mimeType, size: stored.size }); }
      const num = (v: string) => (v === '' ? undefined : Number(v));
      const payload: any = { name: form.name, categoryKey: form.categoryKey, location: form.location || undefined, buildingId: form.buildingId || null, make: form.make || undefined, model: form.model || undefined, serialNumber: form.serialNumber || undefined, purchaseDate: form.purchaseDate || null, purchaseCost: num(form.purchaseCost), vendorId: form.vendorId || null, invoiceNumber: form.invoiceNumber || undefined, warrantyUntil: form.warrantyUntil || null, expectedLifeYears: num(form.expectedLifeYears), salvageValue: num(form.salvageValue), maintenanceIntervalMonths: num(form.maintenanceIntervalMonths), nextMaintenanceDue: form.nextMaintenanceDue || null, custodian: form.custodian || undefined, description: form.description || undefined };
      if (documents.length) payload.documents = [...(asset?.documents ?? []).map((d: any) => ({ storageKey: d.storageKey, name: d.name, mimeType: d.mimeType, size: d.size })), ...documents];
      if (asset) await update.mutateAsync({ id: asset.id, ...payload }); else await create.mutateAsync(payload);
      toast.success(asset ? 'Asset updated' : 'Asset registered');
      onOpenChange(false);
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{asset ? `Edit ${asset.assetCode}` : 'Register asset'}</DialogTitle><DialogDescription>Book value is straight-line over the expected life; maintenance reminders follow the interval.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="as-name">Name *</Label><Input id="as-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-cat">Category *</Label><Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}><SelectTrigger id="as-cat"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(categories.data ?? []).map((c: any) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="as-loc">Location</Label><Input id="as-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Tower A lobby" /></div>
          <div className="space-y-1.5"><Label htmlFor="as-bld">Building</Label><Select value={form.buildingId || 'none'} onValueChange={(v) => setForm({ ...form, buildingId: v === 'none' ? '' : v })}><SelectTrigger id="as-bld"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Common / none</SelectItem>{(buildings.data ?? []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="as-cust">Custodian</Label><Input id="as-cust" value={form.custodian} onChange={(e) => setForm({ ...form, custodian: e.target.value })} placeholder="Facility manager" /></div>
          <div className="space-y-1.5"><Label htmlFor="as-make">Make</Label><Input id="as-make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-model">Model</Label><Input id="as-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-serial">Serial number</Label><Input id="as-serial" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-pdate">Purchased on</Label><Input id="as-pdate" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-cost">Purchase cost (₹)</Label><Input id="as-cost" type="number" min={0} value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Vendor</Label><Combobox value={form.vendorId} onChange={(v) => setForm({ ...form, vendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name, description: v.categoryKey }))} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label htmlFor="as-inv">Invoice number</Label><Input id="as-inv" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-warr">Warranty until</Label><Input id="as-warr" type="date" value={form.warrantyUntil} onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-life">Expected life (years)</Label><Input id="as-life" type="number" min={0} value={form.expectedLifeYears} onChange={(e) => setForm({ ...form, expectedLifeYears: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-salv">Salvage value (₹)</Label><Input id="as-salv" type="number" min={0} value={form.salvageValue} onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-int">Maintenance every (months)</Label><Input id="as-int" type="number" min={0} value={form.maintenanceIntervalMonths} onChange={(e) => setForm({ ...form, maintenanceIntervalMonths: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-next">Next maintenance due</Label><Input id="as-next" type="date" value={form.nextMaintenanceDue} onChange={(e) => setForm({ ...form, nextMaintenanceDue: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="as-desc">Notes</Label><Textarea id="as-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="sm:col-span-2 lg:col-span-3"><FileUpload value={files} onChange={setFiles} multiple accept=".pdf,.png,.jpg,.jpeg" label="Invoice, warranty card, manuals" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} disabled={form.name.trim().length < 2 || !form.categoryKey} onClick={submit}>{asset ? 'Save' : 'Register'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (a: any) => void }) {
  const asset = useAsset(id ?? '');
  const { can } = usePermissions();
  const vendors = useVendorOptions(Boolean(id));
  const status = useAssetStatus();
  const maintain = useLogMaintenance();
  const remove = useDeleteAsset();
  const { confirm, ConfirmElement } = useConfirm();
  const [mode, setMode] = React.useState<'maintenance' | 'dispose' | null>(null);
  const [form, setForm] = React.useState<any>({});
  React.useEffect(() => { setMode(null); setForm({}); }, [id]);
  const a = asset.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        {!a ? <CardSkeleton count={2} /> : <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{a.assetCode}</span><StatusBadge status={a.status} /><Badge variant="outline">{formatStatus(a.categoryKey)}</Badge>{a.warrantyActive ? <Badge variant="success">In warranty</Badge> : null}{a.maintenanceOverdue ? <Badge variant="destructive">Maintenance overdue</Badge> : null}</SheetTitle><SheetDescription className="text-base font-medium text-foreground">{a.name}</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-5">
            <KeyValue columns={2} items={[
              { label: 'Where', value: [a.location, a.buildingId?.name].filter(Boolean).join(' · ') || '—' },
              { label: 'Make / model', value: [a.make, a.model, a.serialNumber ? `S/N ${a.serialNumber}` : null].filter(Boolean).join(' · ') || '—' },
              { label: 'Purchased', value: a.purchaseDate ? `${formatDate(a.purchaseDate)} · ${formatCurrency(a.purchaseCost)}${a.vendorName ? ` from ${a.vendorName}` : ''}` : formatCurrency(a.purchaseCost) },
              { label: 'Book value', value: `${formatCurrency(a.currentValue)} (${a.expectedLifeYears} yr life)` },
              { label: 'Warranty', value: a.warrantyUntil ? `${a.warrantyActive ? 'Until' : 'Expired'} ${formatDate(a.warrantyUntil)}` : '—' },
              { label: 'AMC', value: a.contractId ? <Link className="underline" to={`/app/contracts?contract=${a.contractId.id}`}>{a.contractId.title} · until {formatDate(a.contractId.endDate)}</Link> : 'None' },
              { label: 'Maintenance', value: `${a.maintenanceIntervalMonths ? `every ${a.maintenanceIntervalMonths} months · ` : ''}${a.nextMaintenanceDue ? `next ${formatDate(a.nextMaintenanceDue)}` : 'no schedule'}${a.lastMaintenanceAt ? ` · last ${formatDate(a.lastMaintenanceAt)}` : ''}` },
              { label: 'Spend to date', value: formatCurrency(a.maintenanceCost ?? 0) },
              ...(a.custodian ? [{ label: 'Custodian', value: a.custodian }] : []),
              ...(a.disposal?.at ? [{ label: 'Disposed', value: `${formatDate(a.disposal.at)} · ${a.disposal.reason ?? ''}${a.disposal.amount ? ` · realised ${formatCurrency(a.disposal.amount)}` : ''}`, span: 2 }] : []),
              ...(a.description ? [{ label: 'Notes', value: a.description, span: 2 }] : []),
            ]} />
            {a.documents?.length ? <ul className="flex flex-wrap gap-2">{a.documents.map((d: any) => <li key={d.id || d.storageKey}><Button asChild size="sm" variant="outline"><a href={d.url ?? '#'} target="_blank" rel="noreferrer">{d.name}</a></Button></li>)}</ul> : null}
            {a.status !== 'DISPOSED' && !mode ? (
              <div className="flex flex-wrap gap-2">
                {can('assets:maintain') ? <Button size="sm" onClick={() => { setForm({ type: a.status === 'UNDER_MAINTENANCE' ? 'BREAKDOWN' : 'PREVENTIVE', description: '', cost: '', vendorId: a.vendorId?.id ?? '', createExpense: false, backInService: true }); setMode('maintenance'); }}><Hammer /> Log maintenance</Button> : null}
                {can('assets:maintain') && a.status === 'ACTIVE' ? <Button size="sm" variant="outline" onClick={() => status.mutate({ id: a.id, status: 'UNDER_MAINTENANCE', note: 'Taken out of service' }, { onSuccess: () => toast.success('Marked under maintenance'), onError: err })}><PowerOff /> Out of service</Button> : null}
                {can('assets:update') ? <Button size="sm" variant="ghost" onClick={() => onEdit(a)}><Pencil /> Edit</Button> : null}
                {can('assets:maintain') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setForm({ reason: '', amount: '' }); setMode('dispose'); }}><Recycle /> Dispose</Button> : null}
                {can('assets:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete ${a.assetCode}?`, description: 'Use dispose for assets that were actually written off.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(a.id, { onSuccess: () => { toast.success('Deleted'); onClose(); }, onError: err }); }}><Trash2 /></Button> : null}
              </div>
            ) : null}
            {mode === 'maintenance' ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="mt-type">Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger id="mt-type"><SelectValue /></SelectTrigger><SelectContent>{MAINTENANCE_TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label htmlFor="mt-cost">Cost (₹)</Label><Input id="mt-cost" type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label htmlFor="mt-desc">What was done *</Label><Textarea id="mt-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Vendor</Label><Combobox value={form.vendorId} onChange={(v) => setForm({ ...form, vendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name }))} placeholder="Optional" /></div>
                  <div className="space-y-1 pt-5"><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.createExpense} onCheckedChange={(v) => setForm({ ...form, createExpense: Boolean(v) })} disabled={!(Number(form.cost) > 0)} /> Book the cost as an expense</label>{a.status === 'UNDER_MAINTENANCE' ? <label className="mt-1 flex items-center gap-2 text-sm"><Checkbox checked={form.backInService} onCheckedChange={(v) => setForm({ ...form, backInService: Boolean(v) })} /> Back in service</label> : null}</div>
                </div>
                <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" loading={maintain.isPending} disabled={(form.description ?? '').trim().length < 2} onClick={() => maintain.mutate({ id: a.id, type: form.type, description: form.description, cost: form.cost ? Number(form.cost) : 0, vendorId: form.vendorId || null, createExpense: form.createExpense, backInService: form.backInService }, { onSuccess: () => { toast.success('Maintenance logged'); setMode(null); }, onError: err })}>Save</Button></div>
              </div>
            ) : null}
            {mode === 'dispose' ? <div className="space-y-2 rounded-md border border-destructive/40 p-3"><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="dp-reason">Reason *</Label><Input id="dp-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="dp-amount">Amount realised (₹)</Label><Input id="dp-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div></div><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" variant="destructive" loading={status.isPending} disabled={(form.reason ?? '').trim().length < 2} onClick={() => status.mutate({ id: a.id, status: 'DISPOSED', disposal: { reason: form.reason, amount: form.amount ? Number(form.amount) : 0 } }, { onSuccess: () => { toast.success('Disposed'); setMode(null); }, onError: err })}>Dispose</Button></div></div> : null}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Maintenance log</h3>
              {a.maintenanceLog?.length ? <ol className="space-y-2 border-l pl-3 text-sm">{a.maintenanceLog.map((m: any) => <li key={m.id}><span className="font-medium">{formatStatus(m.type)}</span>{m.cost ? <span className="ml-1 text-muted-foreground">· {formatCurrency(m.cost)}</span> : null}{m.expenseId?.expenseNumber ? <Link className="ml-1 text-xs underline" to={`/app/expenses/${m.expenseId.id ?? m.expenseId._id}`}>{m.expenseId.expenseNumber}</Link> : null}<span className="block text-xs text-muted-foreground">{formatDateTime(m.at)}{m.byUserId?.name ? ` · ${m.byUserId.name}` : ''}{m.vendorName ? ` · ${m.vendorName}` : ''}{m.downtimeHours ? ` · ${m.downtimeHours} h downtime` : ''}</span><p className="text-muted-foreground">{m.description}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">Nothing logged yet.</p>}
            </div>
          </div>
        </>}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}

/** Fixed asset register. */
export default function AssetsPage() {
  const [params, setParams] = useSearchParams();
  const stats = useAssetStats();
  const categories = useAssetCategories();
  const list = useListState({ limit: 25, sort: 'name', filters: { maintenanceDue: params.get('maintenanceDue') ?? '', categoryKey: params.get('categoryKey') ?? '' } });
  const assets = useAssets(list.params);
  const exportRows = useExportAssets();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useAssetsRealtime();
  const selected = params.get('asset');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Assets" description="Everything the society owns, with warranties, AMCs, maintenance history and book value." actions={<PermissionGate permission="assets:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Register asset</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Assets" value={stats.data?.total ?? 0} hint={`${stats.data?.underMaintenance ?? 0} under maintenance`} icon={<Boxes />} loading={stats.isLoading} />
        <StatCard label="Book value" value={formatCurrency(stats.data?.currentValue ?? 0, 'INR', { compact: true })} hint={`cost ${formatCurrency(stats.data?.purchaseCost ?? 0, 'INR', { compact: true })}`} icon={<IndianRupee />} loading={stats.isLoading} />
        <StatCard label="Maintenance due (30d)" value={stats.data?.maintenanceDue ?? 0} hint={`${formatCurrency(stats.data?.maintenanceSpend12m ?? 0, 'INR', { compact: true })} spent in 12 months`} icon={<Wrench />} tone={(stats.data?.maintenanceDue ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Warranty ending (90d)" value={stats.data?.warrantyExpiring ?? 0} icon={<ShieldCheck />} loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, code, serial, location…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'UNDER_MAINTENANCE', 'PURCHASED', 'DISPOSED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="In service" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.maintenanceDue === 'true'} onCheckedChange={(v) => list.setFilter('maintenanceDue', v ? 'true' : '')} /> Maintenance due</label>
        <span className="flex-1" />
        <Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button>
      </FilterBar>
      <DataTable
        rows={assets.data?.items}
        loading={assets.isFetching}
        error={assets.error}
        onRetry={() => assets.refetch()}
        rowKey={(a: any) => a.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(a: any) => setParam('asset', a.id)}
        emptyTitle="No assets registered"
        emptyDescription="Start with the big ones: lifts, generators, pumps, CCTV."
        columns={[
          { key: 'name', header: 'Asset', sortable: true, cell: (a: any) => <span><span className="font-medium">{a.name}</span><span className="block text-xs text-muted-foreground">{a.assetCode} · {formatStatus(a.categoryKey)}{a.location ? ` · ${a.location}` : ''}</span></span> },
          { key: 'purchaseCost', header: 'Cost / value', sortable: true, hideBelow: 'md', cell: (a: any) => <span>{formatCurrency(a.purchaseCost)}<span className="block text-xs text-muted-foreground">now {formatCurrency(a.currentValue)}</span></span> },
          { key: 'nextMaintenanceDue', header: 'Maintenance', sortable: true, cell: (a: any) => a.nextMaintenanceDue ? <span className={cn(a.maintenanceOverdue && 'text-destructive')}>{formatDate(a.nextMaintenanceDue)}</span> : <span className="text-muted-foreground">—</span> },
          { key: 'warrantyUntil', header: 'Warranty', sortable: true, hideBelow: 'lg', cell: (a: any) => a.warrantyUntil ? <span className={cn(!a.warrantyActive && 'text-muted-foreground')}>{formatDate(a.warrantyUntil)}</span> : <span className="text-muted-foreground">—</span> },
          { key: 'amc', header: 'AMC', hideBelow: 'lg', cell: (a: any) => a.contractId ? <Badge variant="outline">{a.contractId.contractNumber}</Badge> : <span className="text-muted-foreground">—</span> },
          { key: 'status', header: 'Status', sortable: true, cell: (a: any) => <StatusBadge status={a.status} /> },
        ]}
        pagination={assets.data ? { page: assets.data.page, pages: assets.data.pages, total: assets.data.total, limit: assets.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <AssetDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} asset={editing === 'new' ? null : editing} />
      <AssetSheet id={selected} onClose={() => setParam('asset', null)} onEdit={(a) => setEditing(a)} />
    </div>
  );
}
