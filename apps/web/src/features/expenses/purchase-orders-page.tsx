import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Send, CheckCheck, Ban, Truck, PackageCheck, FileText, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreatePurchaseOrder, usePurchaseOrder, usePurchaseOrderAction, usePurchaseOrders, useVendorOptions } from '@/hooks/use-expenses';
import { useCategories } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { WorkflowTrail } from '@/features/expenses/expense-detail-page';
import { formatCurrency, formatDate, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

type Item = { description: string; quantity: string; unit: string; rate: string; taxRate: string };
type Quote = { vendorName: string; amount: string; selected: boolean };
const blankItem = (): Item => ({ description: '', quantity: '1', unit: 'nos', rate: '', taxRate: '0' });

function PurchaseOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const vendors = useVendorOptions(open);
  const categories = useCategories('EXPENSE_CATEGORY');
  const create = useCreatePurchaseOrder();
  const { can } = usePermissions();
  const [form, setForm] = React.useState({ title: '', vendorId: '', vendorName: '', categoryKey: '', justification: '', expectedDate: '', notes: '', submit: true });
  const [items, setItems] = React.useState<Item[]>([blankItem()]);
  const [quotes, setQuotes] = React.useState<Quote[]>([]);
  const setItem = (i: number, patch: Partial<Item>) => setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
  const tax = items.reduce((s, it) => s + ((Number(it.quantity) || 0) * (Number(it.rate) || 0) * (Number(it.taxRate) || 0)) / 100, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>New purchase order</DialogTitle><DialogDescription>Describe what needs to be bought, attach quotes and send it for approval. Once approved it can be ordered, received and converted into an expense.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="po-title">Title *</Label><Input id="po-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="CCTV cameras for basement parking" /></div>
          <div className="space-y-1.5"><Label>Vendor</Label><Combobox value={form.vendorId} onChange={(v) => setForm({ ...form, vendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name }))} placeholder="Preferred vendor" /></div>
          <div className="space-y-1.5"><Label>Category</Label><Combobox value={form.categoryKey} onChange={(v) => setForm({ ...form, categoryKey: v ?? '' })} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} placeholder="Category" /></div>
          <div className="space-y-1.5"><Label htmlFor="po-expected">Expected by</Label><Input id="po-expected" type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="po-just">Justification</Label><Textarea id="po-just" rows={2} value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Items *</Label>
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_80px_80px_110px_80px_auto]">
                <Input placeholder="Description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} aria-label="Item description" />
                <Input type="number" min={0} step="0.01" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-label="Quantity" />
                <Input placeholder="Unit" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label="Unit" />
                <Input type="number" min={0} step="0.01" placeholder="Rate" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} aria-label="Rate" />
                <Input type="number" min={0} max={100} placeholder="Tax %" value={it.taxRate} onChange={(e) => setItem(i, { taxRate: e.target.value })} aria-label="Tax rate" />
                <Button type="button" variant="ghost" size="sm" disabled={items.length === 1} onClick={() => setItems(items.filter((_, idx) => idx !== i))}>Remove</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, blankItem()])}><Plus /> Add item</Button>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Quotes received</Label>
            {quotes.map((q, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_140px_auto_auto]"><Input placeholder="Vendor" value={q.vendorName} onChange={(e) => setQuotes(quotes.map((x, idx) => (idx === i ? { ...x, vendorName: e.target.value } : x)))} aria-label="Quote vendor" /><Input type="number" min={0} placeholder="Amount" value={q.amount} onChange={(e) => setQuotes(quotes.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)))} aria-label="Quote amount" /><label className="flex items-center gap-2 text-sm"><Switch checked={q.selected} onCheckedChange={(v) => setQuotes(quotes.map((x, idx) => ({ ...x, selected: idx === i ? v : v ? false : x.selected })))} /> Selected</label><Button type="button" variant="ghost" size="sm" onClick={() => setQuotes(quotes.filter((_, idx) => idx !== i))}>Remove</Button></div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setQuotes([...quotes, { vendorName: '', amount: '', selected: quotes.length === 0 }])}><Plus /> Add quote</Button>
          </div>
          <div className="sm:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span className="tabular">{formatCurrency(subtotal)}</span></div><div className="flex justify-between"><span>Tax</span><span className="tabular">{formatCurrency(tax)}</span></div><div className="flex justify-between font-semibold"><span>Total</span><span className="tabular">{formatCurrency(subtotal + tax)}</span></div></div>
          {can('expenses:submit') ? <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.submit} onCheckedChange={(v) => setForm({ ...form, submit: v })} /> Submit for approval now</label> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!form.title || !items.some((it) => it.description && Number(it.rate) > 0)} onClick={() => create.mutate({ title: form.title, vendorId: form.vendorId || null, categoryKey: form.categoryKey || undefined, justification: form.justification || undefined, expectedDate: form.expectedDate ? new Date(form.expectedDate).toISOString() : undefined, notes: form.notes || undefined, items: items.filter((it) => it.description).map((it) => ({ description: it.description, quantity: Number(it.quantity) || 1, unit: it.unit || 'nos', rate: Number(it.rate) || 0, taxRate: Number(it.taxRate) || 0 })), quotes: quotes.filter((q) => q.vendorName).map((q) => ({ vendorName: q.vendorName, amount: Number(q.amount) || 0, selected: q.selected })), submit: form.submit }, { onSuccess: (po) => { toast.success(`${po.poNumber} ${po.status === 'PENDING_APPROVAL' ? 'sent for approval' : formatStatus(po.status).toLowerCase()}`); onOpenChange(false); navigate(`/app/expenses/purchase-orders/${po.id}`); }, onError: (e) => toast.error(getErrorMessage(e)) })}>{form.submit ? 'Create & submit' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseOrderDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const po = usePurchaseOrder(id);
  const action = usePurchaseOrderAction();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [receiving, setReceiving] = React.useState(false);
  const [received, setReceived] = React.useState<Record<string, string>>({});
  const [converting, setConverting] = React.useState(false);
  const [convert, setConvert] = React.useState({ billNumber: '', billDate: toInputDate(new Date()), amount: '' });
  if (po.isLoading) return <PageSkeleton />;
  if (po.isError || !po.data) return <ErrorState error={po.error} onRetry={() => po.refetch()} />;
  const p = po.data;
  const run = (act: any, body: Record<string, unknown> = {}, msg = 'Done', after?: () => void) => action.mutate({ id, action: act, ...body }, { onSuccess: () => { toast.success(msg); after?.(); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2">{p.poNumber} <StatusBadge status={p.status} /></span>}
        description={`${p.title}${p.vendorName ? ` · ${p.vendorName}` : ''} · requested by ${p.requestedBy?.name ?? ''} on ${formatDate(p.createdAt)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/app/expenses/purchase-orders')}><ArrowLeft /> Purchase orders</Button>
            <SubscriptionGate>
              {['DRAFT', 'REJECTED'].includes(p.status) ? <PermissionGate permission={['expenses:submit', 'expenses:create']}><Button loading={action.isPending} onClick={() => run('submit', {}, 'Submitted for approval')}><Send /> Submit</Button></PermissionGate> : null}
              {p.status === 'PENDING_APPROVAL' ? <PermissionGate permission="expenses:approve"><Button loading={action.isPending} onClick={() => run('approve', {}, 'Approved')}><CheckCheck /> Approve</Button><Button variant="ghost" className="text-destructive" onClick={() => setRejecting(true)}><Ban /> Reject</Button></PermissionGate> : null}
              {p.status === 'APPROVED' ? <PermissionGate permission={['expenses:update', 'expenses:approve']}><Button variant="outline" loading={action.isPending} onClick={() => run('order', {}, 'Marked as ordered')}><Truck /> Mark ordered</Button></PermissionGate> : null}
              {['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status) ? <PermissionGate permission={['expenses:update', 'inventory:transact']}><Button variant="outline" onClick={() => { setReceived(Object.fromEntries(p.items.map((it: any) => [it.id ?? it._id, String(Math.max(0, it.quantity - (it.receivedQuantity ?? 0)))]))); setReceiving(true); }}><PackageCheck /> Receive goods</Button></PermissionGate> : null}
              {['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(p.status) && !p.expenseId ? <PermissionGate permission={['expenses:create', 'expenses:approve']}><Button onClick={() => { setConvert({ ...convert, amount: String(p.subtotal) }); setConverting(true); }}><FileText /> Create expense</Button></PermissionGate> : null}
              {!['CLOSED', 'CANCELLED'].includes(p.status) && !p.expenseId ? <PermissionGate permission={['expenses:update', 'expenses:approve']}><Button variant="ghost" className="text-destructive" onClick={() => { setReason(''); setRejecting(true); }}><XCircle /> Cancel PO</Button></PermissionGate> : null}
            </SubscriptionGate>
          </>
        }
      />
      {p.rejectionReason && p.status === 'REJECTED' ? <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Rejected: {p.rejectionReason}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
              <TableBody>
                {p.items.map((it: any) => <TableRow key={it.id ?? it._id}><TableCell>{it.description}{it.taxRate ? <span className="block text-xs text-muted-foreground">tax {it.taxRate}%</span> : null}</TableCell><TableCell className="text-right tabular">{it.quantity} {it.unit}</TableCell><TableCell className="text-right tabular">{formatCurrency(it.rate)}</TableCell><TableCell className="text-right tabular">{formatCurrency(it.amount)}</TableCell><TableCell className="text-right tabular">{it.receivedQuantity ?? 0}/{it.quantity}</TableCell></TableRow>)}
                <TableRow className="font-semibold"><TableCell colSpan={3}>Total (incl. tax {formatCurrency(p.taxTotal)})</TableCell><TableCell className="text-right tabular">{formatCurrency(p.total)}</TableCell><TableCell /></TableRow>
              </TableBody>
            </Table>
            <div className="p-4"><KeyValue columns={3} items={[{ label: 'Category', value: p.categoryKey ? formatStatus(p.categoryKey) : '—' }, { label: 'Expected by', value: formatDate(p.expectedDate) || '—' }, { label: 'Ordered', value: formatDate(p.orderedAt) || '—' }, { label: 'Received', value: formatDate(p.receivedAt) || '—' }, { label: 'Expense', value: p.expenseId ? <Link to={`/app/expenses/${p.expenseId}`} className="text-primary hover:underline">View expense</Link> : '—' }, { label: 'Approved', value: p.approvedAt ? `${formatDate(p.approvedAt)}${p.approvedBy?.name ? ` · ${p.approvedBy.name}` : ''}` : '—' }, ...(p.justification ? [{ label: 'Justification', value: p.justification, span: 3 }] : []), ...(p.quotes?.length ? [{ label: 'Quotes', value: <ul className="text-sm">{p.quotes.map((q: any, i: number) => <li key={i}>{q.vendorName}: {formatCurrency(q.amount)}{q.selected ? ' ✓' : ''}</li>)}</ul>, span: 3 }] : []), ...(p.notes ? [{ label: 'Notes', value: <span className="whitespace-pre-line">{p.notes}</span>, span: 3 }] : [])]} /></div>
          </CardContent>
        </Card>
        <WorkflowTrail workflow={p.workflow} />
      </div>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{p.status === 'PENDING_APPROVAL' ? `Reject ${p.poNumber}` : `Cancel ${p.poNumber}`}</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="po-reason">Reason *</Label><Textarea id="po-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejecting(false)}>Back</Button><Button variant="destructive" loading={action.isPending} disabled={reason.trim().length < 2} onClick={() => run(p.status === 'PENDING_APPROVAL' ? 'reject' : 'cancel', { reason }, p.status === 'PENDING_APPROVAL' ? 'Rejected' : 'Cancelled', () => setRejecting(false))}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={receiving} onOpenChange={setReceiving}>
        <DialogContent>
          <DialogHeader><DialogTitle>Goods received</DialogTitle><DialogDescription>Enter the quantities received now. Partial deliveries are fine.</DialogDescription></DialogHeader>
          <div className="space-y-2">{p.items.map((it: any) => { const key = it.id ?? it._id; return <div key={key} className="grid grid-cols-[1fr_120px] items-center gap-2 text-sm"><span>{it.description} <span className="text-xs text-muted-foreground">({it.receivedQuantity ?? 0}/{it.quantity} so far)</span></span><Input type="number" min={0} max={it.quantity - (it.receivedQuantity ?? 0)} value={received[key] ?? ''} onChange={(e) => setReceived({ ...received, [key]: e.target.value })} aria-label={`Received ${it.description}`} /></div>; })}</div>
          <DialogFooter><Button variant="outline" onClick={() => setReceiving(false)}>Cancel</Button><Button loading={action.isPending} onClick={() => run('receive', { items: Object.entries(received).filter(([, v]) => Number(v) > 0).map(([itemId, v]) => ({ itemId, receivedQuantity: Number(v) })) }, 'Receipt recorded', () => setReceiving(false))}>Record receipt</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={converting} onOpenChange={setConverting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Create expense from {p.poNumber}</DialogTitle><DialogDescription>The expense is approved automatically because the purchase order already went through approval.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label htmlFor="cv-bill">Vendor bill number</Label><Input id="cv-bill" value={convert.billNumber} onChange={(e) => setConvert({ ...convert, billNumber: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="cv-date">Bill date</Label><Input id="cv-date" type="date" value={convert.billDate} onChange={(e) => setConvert({ ...convert, billDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="cv-amount">Billed amount (before tax)</Label><Input id="cv-amount" type="number" min={0} step="0.01" value={convert.amount} onChange={(e) => setConvert({ ...convert, amount: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setConverting(false)}>Cancel</Button><Button loading={action.isPending} onClick={() => run('convert', { billNumber: convert.billNumber || undefined, billDate: convert.billDate ? new Date(convert.billDate).toISOString() : undefined, amount: convert.amount ? Number(convert.amount) : undefined }, 'Expense created', () => setConverting(false))}>Create expense</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: '-createdAt' });
  const pos = usePurchaseOrders(list.params);
  const [creating, setCreating] = React.useState(false);
  if (id) return <PurchaseOrderDetail id={id} />;
  return (
    <div>
      <PageHeader title="Purchase orders" description="Requisitions with quotes, approval, delivery tracking and conversion into expenses." actions={<SubscriptionGate><PermissionGate permission={['expenses:create', 'expenses:submit']}><Button onClick={() => setCreating(true)}><Plus /> New purchase order</Button></PermissionGate></SubscriptionGate>} />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="PO number, title, vendor…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
      </FilterBar>
      <DataTable
        rows={pos.data?.items}
        loading={pos.isFetching}
        error={pos.error}
        onRetry={() => pos.refetch()}
        rowKey={(p: any) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(p: any) => navigate(`/app/expenses/purchase-orders/${p.id}`)}
        emptyTitle="No purchase orders yet"
        columns={[
          { key: 'poNumber', header: 'PO', cell: (p: any) => <span><span className="font-medium">{p.poNumber}</span><span className="block text-xs text-muted-foreground">{p.title}</span></span> },
          { key: 'vendor', header: 'Vendor', hideBelow: 'md', cell: (p: any) => p.vendorName ?? '—' },
          { key: 'total', header: 'Total', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (p: any) => <span className="tabular font-medium">{formatCurrency(p.total)}</span> },
          { key: 'expectedDate', header: 'Expected', sortable: true, hideBelow: 'lg', cell: (p: any) => formatDate(p.expectedDate) || '—' },
          { key: 'requested', header: 'Requested by', hideBelow: 'lg', cell: (p: any) => `${p.requestedBy?.name ?? ''} · ${formatDate(p.createdAt)}` },
          { key: 'status', header: 'Status', sortable: true, cell: (p: any) => <StatusBadge status={p.status} /> },
        ]}
        pagination={pos.data ? { page: pos.data.page, pages: pos.data.pages, total: pos.data.total, limit: pos.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <PurchaseOrderDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
