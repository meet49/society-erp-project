import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FilePlus2, Play, Receipt, AlertTriangle, Wallet, TrendingUp } from 'lucide-react';
import { InvoiceStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBillingStats, useChargeHeads, useCreateInvoice, useExportInvoices, useInvoices } from '@/hooks/use-billing';
import { useBuildings, useUnitOptions } from '@/hooks/use-units';
import { formatCurrency, formatDate, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

type Line = { chargeHeadId: string; description: string; amount: string; taxRate: string };

/** Ad-hoc invoice (move-in charges, NOC fees, damages…) for one unit. */
export function AdhocInvoiceDialog({ open, onOpenChange, unitId: presetUnitId }: { open: boolean; onOpenChange: (o: boolean) => void; unitId?: string }) {
  const navigate = useNavigate();
  const units = useUnitOptions(open);
  const heads = useChargeHeads();
  const create = useCreateInvoice();
  const [form, setForm] = React.useState({ unitId: presetUnitId ?? '', label: '', dueDate: '', notes: '', discount: '', discountReason: '', issueImmediately: true });
  const [lines, setLines] = React.useState<Line[]>([{ chargeHeadId: '', description: '', amount: '', taxRate: '0' }]);
  React.useEffect(() => { if (open && presetUnitId) setForm((f) => ({ ...f, unitId: presetUnitId })); }, [open, presetUnitId]);
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickHead = (i: number, id: string | null) => {
    const h = (heads.data ?? []).find((x: any) => x.id === id);
    setLine(i, { chargeHeadId: id ?? '', description: h ? h.name : lines[i].description, amount: h && ['FIXED', 'PER_UNIT'].includes(h.type) ? String(h.amount) : lines[i].amount, taxRate: h ? String(h.taxRate ?? 0) : lines[i].taxRate });
  };
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const tax = lines.reduce((s, l) => s + ((Number(l.amount) || 0) * (Number(l.taxRate) || 0)) / 100, 0);
  const total = subtotal + tax - (Number(form.discount) || 0);
  const submit = () => {
    create.mutate(
      { unitId: form.unitId, label: form.label || undefined, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined, notes: form.notes || undefined, discount: form.discount ? { amount: Number(form.discount), reason: form.discountReason || undefined } : undefined, issueImmediately: form.issueImmediately, lineItems: lines.filter((l) => l.description && l.amount).map((l) => ({ chargeHeadId: l.chargeHeadId || undefined, description: l.description, amount: Number(l.amount), taxRate: Number(l.taxRate) || 0 })) },
      { onSuccess: (inv) => { toast.success(`Invoice ${inv.invoiceNumber} ${form.issueImmediately ? 'issued' : 'saved as draft'}`); onOpenChange(false); navigate(`/app/billing/invoices/${inv.id}`); }, onError: (e) => toast.error(getErrorMessage(e)) },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>New invoice</DialogTitle><DialogDescription>One-off charges for a unit. Recurring maintenance is generated through billing runs.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Unit *</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} placeholder="Select unit" disabled={Boolean(presetUnitId)} /></div>
          <div className="space-y-1.5"><Label htmlFor="inv-label">Label</Label><Input id="inv-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Move-in charges" /></div>
          <div className="space-y-1.5"><Label htmlFor="inv-due">Due date</Label><Input id="inv-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Line items *</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_110px_80px_auto]">
                <Combobox value={l.chargeHeadId} onChange={(v) => pickHead(i, v)} options={(heads.data ?? []).map((h: any) => ({ value: h.id, label: h.name, description: h.code }))} placeholder="Charge head (optional)" />
                <Input placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label="Line description" />
                <Input type="number" min={0} step="0.01" placeholder="Amount" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} aria-label="Line amount" />
                <Input type="number" min={0} max={100} placeholder="Tax %" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value })} aria-label="Tax rate" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setLines(lines.length > 1 ? lines.filter((_, idx) => idx !== i) : lines)} disabled={lines.length === 1}>Remove</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { chargeHeadId: '', description: '', amount: '', taxRate: '0' }])}>Add line</Button>
          </div>
          <div className="space-y-1.5"><Label htmlFor="inv-discount">Discount</Label><Input id="inv-discount" type="number" min={0} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="inv-discount-reason">Discount reason</Label><Input id="inv-discount-reason" value={form.discountReason} onChange={(e) => setForm({ ...form, discountReason: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="inv-notes">Notes (printed on the invoice)</Label><Textarea id="inv-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.issueImmediately} onCheckedChange={(v) => setForm({ ...form, issueImmediately: v })} /> Issue immediately (otherwise saved as a draft you can edit)</label>
          <div className="sm:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span className="tabular">{formatCurrency(subtotal)}</span></div><div className="flex justify-between"><span>Tax</span><span className="tabular">{formatCurrency(tax)}</span></div><div className="flex justify-between font-semibold"><span>Total</span><span className="tabular">{formatCurrency(total)}</span></div></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!form.unitId || !lines.some((l) => l.description && l.amount)} onClick={submit}>{form.issueImmediately ? 'Create & issue' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BillingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const list = useListState({ sort: '-createdAt' });
  React.useEffect(() => {
    for (const key of ['status', 'unitId', 'buildingId', 'billingRunId']) {
      const v = params.get(key);
      if (v) list.setFilter(key, v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const invoices = useInvoices(list.params);
  const stats = useBillingStats();
  const buildings = useBuildings();
  const exportRows = useExportInvoices();
  const [adding, setAdding] = React.useState(false);
  return (
    <div>
      <PageHeader
        title="Billing"
        description="Invoices for every unit: maintenance runs, metered utilities, penalties and one-off charges."
        actions={
          <SubscriptionGate>
            <PermissionGate permission="billing:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
            <PermissionGate permission="billing:create"><Button variant="outline" onClick={() => setAdding(true)}><FilePlus2 /> New invoice</Button></PermissionGate>
            <PermissionGate permission="billing:generate"><Button asChild><Link to="/app/billing/runs?new=1"><Play /> Run billing cycle</Link></Button></PermissionGate>
          </SubscriptionGate>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Outstanding" value={formatCurrency(stats.data?.outstanding ?? 0)} hint={`${stats.data?.openInvoices ?? 0} open invoices`} icon={<Receipt />} tone="primary" loading={stats.isLoading} />
        <StatCard label="Overdue" value={formatCurrency(stats.data?.overdueAmount ?? 0)} hint={`${stats.data?.overdueCount ?? 0} invoices`} icon={<AlertTriangle />} tone={(stats.data?.overdueCount ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Issued this month" value={formatCurrency(stats.data?.issuedThisMonth ?? 0)} icon={<TrendingUp />} loading={stats.isLoading} />
        <StatCard label="Collected this month" value={formatCurrency(stats.data?.collectedThisMonth ?? 0)} hint={stats.data?.collectionRate != null ? `${stats.data.collectionRate}% of issued` : undefined} icon={<Wallet />} tone="success" loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Invoice no. or name…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(InvoiceStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.buildingId ?? ''} onChange={(v) => list.setFilter('buildingId', v)} options={(buildings.data ?? []).map((b: any) => ({ value: b.id, label: b.name }))} allLabel="All buildings" />
        {list.filters.unitId ? <Button variant="ghost" size="sm" onClick={() => list.setFilter('unitId', '')}>Clear unit filter</Button> : null}
        <div className="ml-auto"><PermissionGate permission="billing:generate"><Button asChild variant="link" size="sm"><Link to="/app/billing/runs">Billing runs</Link></Button></PermissionGate></div>
      </FilterBar>
      <DataTable
        rows={invoices.data?.items}
        loading={invoices.isFetching}
        error={invoices.error}
        onRetry={() => invoices.refetch()}
        rowKey={(i: any) => i.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(i: any) => navigate(`/app/billing/invoices/${i.id}`)}
        emptyTitle="No invoices yet"
        emptyDescription="Set up charge heads under Billing Setup, then run your first billing cycle."
        columns={[
          { key: 'invoiceNumber', header: 'Invoice', sortable: true, cell: (i: any) => <span className="font-medium">{i.invoiceNumber}</span> },
          { key: 'unit', header: 'Unit', cell: (i: any) => <span>{i.unitId?.code ?? '—'}<span className="block text-xs text-muted-foreground">{i.unitId?.buildingId?.name}</span></span> },
          { key: 'period', header: 'Period', hideBelow: 'md', cell: (i: any) => i.period?.label ?? '—' },
          { key: 'dueDate', header: 'Due', sortable: true, hideBelow: 'sm', cell: (i: any) => formatDate(i.dueDate) },
          { key: 'total', header: 'Total', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (i: any) => <span className="tabular">{formatCurrency(i.total)}</span> },
          { key: 'balanceDue', header: 'Balance', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (i: any) => <span className={`tabular ${i.balanceDue > 0 ? 'font-medium' : 'text-muted-foreground'}`}>{formatCurrency(i.balanceDue)}</span> },
          { key: 'status', header: 'Status', cell: (i: any) => <StatusBadge status={i.status} /> },
        ]}
        pagination={invoices.data ? { page: invoices.data.page, pages: invoices.data.pages, total: invoices.data.total, limit: invoices.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <AdhocInvoiceDialog open={adding} onOpenChange={setAdding} unitId={list.filters.unitId || undefined} />
    </div>
  );
}

