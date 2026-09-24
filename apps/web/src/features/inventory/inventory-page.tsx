import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Warehouse, AlertTriangle, IndianRupee, ArrowDownToLine, ArrowUpFromLine, Download, Pencil, Trash2, ClipboardList } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssetsRealtime, useCreateItem, useDeleteItem, useExportInventory, useInventoryCategories, useInventoryItem, useInventoryItems, useInventorySettings, useInventoryStats, useSaveInventorySettings, useStockTransact, useStockTransactions, useUpdateItem } from '@/hooks/use-assets';
import { useVendorOptions } from '@/hooks/use-expenses';
import { useRoles } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatCurrency, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const blank = { sku: '', name: '', categoryKey: '', unit: 'nos', minimumLevel: '', reorderQuantity: '', location: '', unitCost: '', vendorId: '', openingStock: '' };

function ItemDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: any | null }) {
  const categories = useInventoryCategories();
  const vendors = useVendorOptions(open);
  const create = useCreateItem();
  const update = useUpdateItem();
  const [form, setForm] = React.useState(blank);
  React.useEffect(() => { if (open) setForm(item ? { sku: item.sku, name: item.name, categoryKey: item.categoryKey, unit: item.unit ?? 'nos', minimumLevel: String(item.minimumLevel ?? ''), reorderQuantity: String(item.reorderQuantity ?? ''), location: item.location ?? '', unitCost: String(item.unitCost ?? ''), vendorId: item.vendorId?.id ?? '', openingStock: '' } : blank); }, [open, item]);
  const submit = () => {
    const num = (v: string) => (v === '' ? undefined : Number(v));
    const payload: any = { sku: form.sku || undefined, name: form.name, categoryKey: form.categoryKey, unit: form.unit || 'nos', minimumLevel: num(form.minimumLevel), reorderQuantity: num(form.reorderQuantity), location: form.location || undefined, unitCost: num(form.unitCost), vendorId: form.vendorId || null };
    const done = { onSuccess: () => { toast.success(item ? 'Item updated' : 'Item added'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (item) update.mutate({ id: item.id, ...payload }, done); else create.mutate({ ...payload, openingStock: num(form.openingStock) }, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{item ? `Edit ${item.sku}` : 'New stock item'}</DialogTitle><DialogDescription>Low-stock alerts fire when stock reaches the minimum level.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="it-name">Name *</Label><Input id="it-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="it-sku">SKU</Label><Input id="it-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="Auto" /></div>
          <div className="space-y-1.5"><Label htmlFor="it-cat">Category *</Label><Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}><SelectTrigger id="it-cat"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(categories.data ?? []).map((c: any) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="it-unit">Unit</Label><Input id="it-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="nos, kg, ltr" /></div>
          <div className="space-y-1.5"><Label htmlFor="it-loc">Store location</Label><Input id="it-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="it-min">Minimum level</Label><Input id="it-min" type="number" min={0} value={form.minimumLevel} onChange={(e) => setForm({ ...form, minimumLevel: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="it-reorder">Reorder quantity</Label><Input id="it-reorder" type="number" min={0} value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="it-cost">Unit cost (₹)</Label><Input id="it-cost" type="number" min={0} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Preferred vendor</Label><Combobox value={form.vendorId} onChange={(v) => setForm({ ...form, vendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name }))} placeholder="Optional" /></div>
          {!item ? <div className="space-y-1.5"><Label htmlFor="it-open">Opening stock</Label><Input id="it-open" type="number" min={0} value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: e.target.value })} /></div> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={form.name.trim().length < 2 || !form.categoryKey} onClick={submit}>{item ? 'Save' : 'Add item'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (i: any) => void }) {
  const item = useInventoryItem(id ?? '');
  const { can } = usePermissions();
  const transact = useStockTransact();
  const remove = useDeleteItem();
  const { confirm, ConfirmElement } = useConfirm();
  const [type, setType] = React.useState<'IN' | 'OUT' | 'ADJUST' | null>(null);
  const [form, setForm] = React.useState({ quantity: '', unitCost: '', issuedTo: '', note: '' });
  React.useEffect(() => { setType(null); setForm({ quantity: '', unitCost: '', issuedTo: '', note: '' }); }, [id]);
  const i = item.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const submit = () => transact.mutate({ id: i.id, type, quantity: Number(form.quantity), unitCost: form.unitCost ? Number(form.unitCost) : undefined, issuedTo: form.issuedTo || undefined, note: form.note || undefined }, { onSuccess: (r) => { toast.success(`Stock now ${r.balanceAfter} ${i.unit}`); setType(null); setForm({ quantity: '', unitCost: '', issuedTo: '', note: '' }); }, onError: err });
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {!i ? <CardSkeleton count={2} /> : <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{i.sku}</span>{i.isLow ? <Badge variant="warning">Low stock</Badge> : null}<StatusBadge status={i.status} /></SheetTitle><SheetDescription className="text-base font-medium text-foreground">{i.name}</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-5">
            <div className="rounded-md border bg-muted/30 p-4 text-center"><p className="text-xs uppercase text-muted-foreground">On hand</p><p className={cn('text-4xl font-bold', i.isLow && 'text-warning-foreground dark:text-warning')}>{i.currentStock} <span className="text-base font-normal text-muted-foreground">{i.unit}</span></p><p className="text-xs text-muted-foreground">min {i.minimumLevel} · reorder {i.reorderQuantity} · worth {formatCurrency(i.stockValue)} at {formatCurrency(i.unitCost)} each</p></div>
            <KeyValue columns={2} items={[{ label: 'Category', value: formatStatus(i.categoryKey) }, { label: 'Location', value: i.location ?? '—' }, { label: 'Vendor', value: i.vendorId?.name ?? '—' }, { label: 'Used in 30 days', value: `${i.consumed30d ?? 0} ${i.unit}` }]} />
            {can('inventory:transact') && !type ? <div className="grid grid-cols-3 gap-2"><Button onClick={() => setType('IN')}><ArrowDownToLine /> Stock in</Button><Button variant="outline" onClick={() => setType('OUT')}><ArrowUpFromLine /> Issue</Button><Button variant="ghost" onClick={() => { setType('ADJUST'); setForm({ ...form, quantity: String(i.currentStock) }); }}><ClipboardList /> Count</Button></div> : null}
            {type ? <div className="space-y-2 rounded-md border p-3"><p className="text-sm font-medium">{type === 'IN' ? 'Stock in' : type === 'OUT' ? 'Issue stock' : 'Physical count'}</p><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="tx-qty">{type === 'ADJUST' ? 'Counted quantity' : 'Quantity'} ({i.unit}) *</Label><Input id="tx-qty" type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>{type !== 'OUT' ? <div className="space-y-1"><Label htmlFor="tx-cost">Unit cost (₹)</Label><Input id="tx-cost" type="number" min={0} step="any" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder={String(i.unitCost)} /></div> : <div className="space-y-1"><Label htmlFor="tx-to">Issued to</Label><Input id="tx-to" value={form.issuedTo} onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} placeholder="Housekeeping, electrician…" /></div>}<div className="space-y-1 sm:col-span-2"><Label htmlFor="tx-note">Note</Label><Input id="tx-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div></div><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setType(null)}>Cancel</Button><Button size="sm" loading={transact.isPending} disabled={form.quantity === '' || Number(form.quantity) < 0 || (type !== 'ADJUST' && !(Number(form.quantity) > 0))} onClick={submit}>Save</Button></div></div> : null}
            <div className="flex flex-wrap gap-2">{can('inventory:update') ? <Button size="sm" variant="ghost" onClick={() => onEdit(i)}><Pencil /> Edit</Button> : null}{can('inventory:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Remove ${i.name}?`, description: 'Its history is kept.', destructive: true, confirmLabel: 'Remove' })) remove.mutate(i.id, { onSuccess: () => { toast.success('Removed'); onClose(); }, onError: err }); }}><Trash2 /></Button> : null}</div>
            <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Recent movements</h3><ul className="divide-y rounded-md border text-sm">{(i.recentTransactions ?? []).map((t: any) => <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-1.5"><span><span className={cn('font-medium', t.quantity < 0 ? 'text-destructive' : 'text-success')}>{t.quantity > 0 ? '+' : ''}{t.quantity}</span> <span className="text-muted-foreground">→ {t.balanceAfter}</span><span className="block text-xs text-muted-foreground">{formatStatus(t.type)}{t.reference?.label ? ` · ${t.reference.label}` : ''}{t.issuedTo ? ` · to ${t.issuedTo}` : ''}{t.note ? ` · ${t.note}` : ''}</span></span><span className="text-right text-xs text-muted-foreground">{formatDateTime(t.at)}<span className="block">{t.byUserId?.name ?? 'System'}</span></span></li>)}{!i.recentTransactions?.length ? <li className="p-3 text-muted-foreground">No movements yet.</li> : null}</ul></div>
          </div>
        </>}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}

function MovementsTab() {
  const list = useListState({ limit: 25, sort: '-at' });
  const tx = useStockTransactions(list.params);
  return (
    <div>
      <FilterBar onReset={list.reset}><FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={['IN', 'OUT', 'ADJUST'].map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="All movements" /></FilterBar>
      <DataTable rows={tx.data?.items} loading={tx.isFetching} error={tx.error} onRetry={() => tx.refetch()} rowKey={(t: any) => t.id} emptyTitle="No stock movements yet" columns={[
        { key: 'at', header: 'When', cell: (t: any) => formatDateTime(t.at) },
        { key: 'item', header: 'Item', cell: (t: any) => <span>{t.itemId?.name ?? '—'}<span className="block text-xs text-muted-foreground">{t.itemId?.sku}</span></span> },
        { key: 'qty', header: 'Qty', cell: (t: any) => <span className={cn('font-medium', t.quantity < 0 ? 'text-destructive' : 'text-success')}>{t.quantity > 0 ? '+' : ''}{t.quantity} {t.itemId?.unit ?? ''}<span className="block text-xs font-normal text-muted-foreground">balance {t.balanceAfter}</span></span> },
        { key: 'ref', header: 'Reference', hideBelow: 'md', cell: (t: any) => <span>{formatStatus(t.type)}{t.reference?.label ? ` · ${t.reference.label}` : ''}{t.issuedTo ? ` · ${t.issuedTo}` : ''}<span className="block text-xs text-muted-foreground">{t.note ?? ''}</span></span> },
        { key: 'by', header: 'By', hideBelow: 'lg', cell: (t: any) => t.byUserId?.name ?? 'System' },
      ]} pagination={tx.data ? { page: tx.data.page, pages: tx.data.pages, total: tx.data.total, limit: tx.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined} />
    </div>
  );
}

function RulesPanel() {
  const settings = useInventorySettings();
  const roles = useRoles();
  const save = useSaveInventorySettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);
  if (!form) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3 text-sm">
      <div className="space-y-1"><Label>Alert these roles on low stock</Label><div className="flex flex-wrap gap-1.5">{(roles.data ?? []).map((r: any) => <button key={r.key} type="button" onClick={() => setForm({ ...form, lowStockAlertRoleKeys: form.lowStockAlertRoleKeys.includes(r.key) ? form.lowStockAlertRoleKeys.filter((k: string) => k !== r.key) : [...form.lowStockAlertRoleKeys, r.key] })} className={`rounded-full border px-3 py-1 text-xs ${form.lowStockAlertRoleKeys.includes(r.key) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>{r.name}</button>)}</div></div>
      <div className="space-y-1"><Label htmlFor="iv-re">Re-alert after (days)</Label><Input id="iv-re" type="number" min={1} className="w-28" value={form.realertAfterDays} onChange={(e) => setForm({ ...form, realertAfterDays: Number(e.target.value) })} /></div>
      <label className="flex items-center gap-2 pb-2"><Switch checked={Boolean(form.allowNegativeStock)} onCheckedChange={(v) => setForm({ ...form, allowNegativeStock: v })} /> Allow issuing more than in stock</label>
      <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ lowStockAlertRoleKeys: form.lowStockAlertRoleKeys, realertAfterDays: form.realertAfterDays, allowNegativeStock: form.allowNegativeStock }, { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save rules</Button>
    </div>
  );
}

/** Society store: items, stock levels, movements. */
export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const stats = useInventoryStats();
  const categories = useInventoryCategories();
  const list = useListState({ limit: 25, sort: 'name', filters: { lowStockOnly: params.get('lowStockOnly') ?? '', categoryKey: params.get('categoryKey') ?? '' } });
  const items = useInventoryItems(list.params);
  const exportRows = useExportInventory();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [showRules, setShowRules] = React.useState(false);
  useAssetsRealtime();
  const selected = params.get('item');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Inventory" description="Consumables and spares in the store, with every issue and receipt on record." actions={<span className="flex gap-2">{can('inventory:update') ? <Button variant="outline" onClick={() => setShowRules((v) => !v)}>Rules</Button> : null}<PermissionGate permission="inventory:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> New item</Button></SubscriptionGate></PermissionGate></span>} />
      <StatGrid className="mb-6">
        <StatCard label="Items" value={stats.data?.items ?? 0} icon={<Warehouse />} loading={stats.isLoading} />
        <StatCard label="Below minimum" value={stats.data?.lowStock ?? 0} icon={<AlertTriangle />} tone={(stats.data?.lowStock ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Stock value" value={formatCurrency(stats.data?.stockValue ?? 0, 'INR', { compact: true })} icon={<IndianRupee />} loading={stats.isLoading} />
        <StatCard label="This month" value={`${stats.data?.monthIn?.count ?? 0} in · ${stats.data?.monthOut?.count ?? 0} out`} hint={`received ${formatCurrency(stats.data?.monthIn?.value ?? 0, 'INR', { compact: true })} · issued ${formatCurrency(stats.data?.monthOut?.value ?? 0, 'INR', { compact: true })}`} icon={<ArrowDownToLine />} loading={stats.isLoading} />
      </StatGrid>
      {showRules ? <div className="mb-4"><RulesPanel /></div> : null}
      <Tabs defaultValue="items">
        <TabsList className="mb-4"><TabsTrigger value="items">Items</TabsTrigger><TabsTrigger value="movements">Movements</TabsTrigger></TabsList>
        <TabsContent value="items">
          <FilterBar onReset={list.reset}>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, SKU, location…" className="w-full sm:w-64" />
            <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.lowStockOnly === 'true'} onCheckedChange={(v) => list.setFilter('lowStockOnly', v ? 'true' : '')} /> Below minimum</label>
            <span className="flex-1" />
            <Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button>
          </FilterBar>
          <DataTable
            rows={items.data?.items}
            loading={items.isFetching}
            error={items.error}
            onRetry={() => items.refetch()}
            rowKey={(i: any) => i.id}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={(i: any) => setParam('item', i.id)}
            emptyTitle="Nothing in the store yet"
            emptyDescription="Add cleaning supplies, spares and stationery, then record every issue."
            columns={[
              { key: 'name', header: 'Item', sortable: true, cell: (i: any) => <span><span className="font-medium">{i.name}</span><span className="block text-xs text-muted-foreground">{i.sku} · {formatStatus(i.categoryKey)}{i.location ? ` · ${i.location}` : ''}</span></span> },
              { key: 'currentStock', header: 'In stock', sortable: true, cell: (i: any) => <span className={cn('font-semibold', i.isLow && 'text-warning-foreground dark:text-warning')}>{i.currentStock} {i.unit}{i.isLow ? <Badge variant="warning" className="ml-1">Low</Badge> : null}<span className="block text-xs font-normal text-muted-foreground">min {i.minimumLevel}</span></span> },
              { key: 'unitCost', header: 'Unit cost', sortable: true, hideBelow: 'md', cell: (i: any) => <span>{formatCurrency(i.unitCost)}<span className="block text-xs text-muted-foreground">worth {formatCurrency(i.stockValue)}</span></span> },
              { key: 'vendor', header: 'Vendor', hideBelow: 'lg', cell: (i: any) => i.vendorId?.name ?? <span className="text-muted-foreground">—</span> },
              { key: 'status', header: 'Status', hideBelow: 'lg', cell: (i: any) => <StatusBadge status={i.status} /> },
            ]}
            pagination={items.data ? { page: items.data.page, pages: items.data.pages, total: items.data.total, limit: items.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
          />
        </TabsContent>
        <TabsContent value="movements"><MovementsTab /></TabsContent>
      </Tabs>
      <ItemDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} item={editing === 'new' ? null : editing} />
      <ItemSheet id={selected} onClose={() => setParam('item', null)} onEdit={(i) => setEditing(i)} />
    </div>
  );
}
