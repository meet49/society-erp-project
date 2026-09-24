import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Plus, Wallet, Undo2, CheckSquare, Printer, Landmark, Percent } from 'lucide-react';
import { PaymentMethods, PaymentStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { KeyValue } from '@/components/common/key-value';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { HorizontalBars } from '@/components/common/charts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePayment, usePaymentStats, usePayments, useReconcilePayment, useRefundPayment, useExportPayments } from '@/hooks/use-payments';
import { RecordPaymentDialog } from '@/features/payments/record-payment-dialog';
import { formatCurrency, formatDate, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

function PaymentDetail({ id }: { id: string }) {
  const payment = usePayment(id);
  const refund = useRefundPayment();
  const reconcile = useReconcilePayment();
  const [refunding, setRefunding] = React.useState(false);
  const [refundForm, setRefundForm] = React.useState({ amount: '', reason: '' });
  const p = payment.data;
  if (!p) return null;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-2xl font-semibold tabular">{formatCurrency(p.amount)}</p>
        <p className="text-sm text-muted-foreground">{p.receiptNumber} · {formatStatus(p.method)} · {formatDateTime(p.receivedAt)}</p>
        <div className="mt-1 flex flex-wrap gap-1"><StatusBadge status={p.status} />{p.signatureVerified ? <Badge variant="success">Gateway verified</Badge> : null}{p.reconciled ? <Badge variant="info">Reconciled</Badge> : null}{p.provider !== 'manual' ? <Badge variant="outline">{formatStatus(p.provider)}</Badge> : null}</div>
      </div>
      <KeyValue columns={2} items={[{ label: 'Unit', value: <Link to={`/app/units/${p.unitId?.id ?? p.unitId?._id}`} className="text-primary hover:underline">{p.unitId?.code}</Link> }, { label: 'Payer', value: p.payerName ?? p.residentId?.name ?? '—' }, { label: 'Reference', value: p.reference ?? p.providerPaymentId ?? '—' }, { label: 'Recorded by', value: p.recordedBy?.name ?? 'Online' }, { label: 'Allocated', value: formatCurrency(p.amount - (p.unallocatedAmount ?? 0)) }, { label: 'Advance (unallocated)', value: formatCurrency(p.unallocatedAmount ?? 0) }, ...(p.refund?.at ? [{ label: 'Refund', value: `${formatCurrency(p.refund.amount)} · ${formatDate(p.refund.at)} · ${p.refund.reason}`, span: 2 }] : []), ...(p.notes ? [{ label: 'Notes', value: p.notes, span: 2 }] : [])]} />
      {p.allocations?.length ? <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Applied to</p><ul className="space-y-1 text-sm">{p.allocations.map((a: any) => <li key={a.invoiceId} className="flex justify-between"><Link to={`/app/billing/invoices/${a.invoiceId}`} className="text-primary hover:underline">{a.invoiceNumber}</Link><span className="tabular">{formatCurrency(a.amount)}</span></li>)}</ul></div> : null}
      <SubscriptionGate>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button asChild variant="outline" size="sm"><Link to={`/app/payments/${id}/receipt`}><Printer /> Receipt</Link></Button>
          <PermissionGate permission="payments:reconcile"><Button variant="outline" size="sm" loading={reconcile.isPending} onClick={() => reconcile.mutate({ id, reconciled: !p.reconciled }, { onSuccess: () => toast.success(p.reconciled ? 'Marked as not reconciled' : 'Marked as reconciled'), onError: (e) => toast.error(getErrorMessage(e)) })}><CheckSquare /> {p.reconciled ? 'Unreconcile' : 'Mark reconciled'}</Button></PermissionGate>
          {p.status === 'SUCCESS' && !p.refund?.at ? <PermissionGate permission="payments:refund"><Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setRefundForm({ amount: String(p.amount), reason: '' }); setRefunding(true); }}><Undo2 /> Refund</Button></PermissionGate> : null}
        </div>
      </SubscriptionGate>
      <Dialog open={refunding} onOpenChange={setRefunding}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Refund {p.receiptNumber}</DialogTitle><DialogDescription>{p.provider !== 'manual' ? 'The refund is requested from the payment gateway and ' : 'Record the refund you paid out; it '}reverses the invoice allocations (newest first) and posts to the unit ledger.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="rf-amount">Amount (max {formatCurrency(p.amount)})</Label><Input id="rf-amount" type="number" min={1} max={p.amount} step="0.01" value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="rf-reason">Reason *</Label><Textarea id="rf-reason" rows={2} value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRefunding(false)}>Cancel</Button><Button variant="destructive" loading={refund.isPending} disabled={refundForm.reason.trim().length < 2 || !Number(refundForm.amount)} onClick={() => refund.mutate({ id, amount: Number(refundForm.amount), reason: refundForm.reason }, { onSuccess: () => { toast.success('Refund processed'); setRefunding(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Refund {formatCurrency(Number(refundForm.amount) || 0)}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PaymentsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: '-receivedAt' });
  const payments = usePayments(list.params);
  const stats = usePaymentStats();
  const exportRows = useExportPayments();
  const [recording, setRecording] = React.useState(false);
  const [unreconciledOnly, setUnreconciledOnly] = React.useState(false);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Every rupee received: online through the gateway or recorded at the office, with receipts and reconciliation."
        actions={
          <SubscriptionGate>
            <PermissionGate permission="payments:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
            <PermissionGate permission="payments:configure"><Button asChild variant="outline"><Link to="/app/settings/payments"><Landmark /> Gateway</Link></Button></PermissionGate>
            <PermissionGate permission="payments:create"><Button onClick={() => setRecording(true)}><Plus /> Record payment</Button></PermissionGate>
          </SubscriptionGate>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Collected this month" value={formatCurrency(stats.data?.collectedThisMonth ?? 0)} hint={`${stats.data?.paymentsThisMonth ?? 0} payments`} icon={<Wallet />} tone="success" loading={stats.isLoading} />
        <StatCard label="Online share (90 days)" value={`${stats.data?.onlineShare ?? 0}%`} icon={<Percent />} loading={stats.isLoading} />
        <StatCard label="Awaiting reconciliation" value={stats.data?.unreconciled ?? 0} hint="cheques, transfers & online" icon={<CheckSquare />} tone={(stats.data?.unreconciled ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Refunds this month" value={formatCurrency(stats.data?.refundsThisMonth ?? 0)} icon={<Undo2 />} loading={stats.isLoading} />
      </StatGrid>
      {stats.data?.byMethod?.length ? (
        <Card className="mb-6"><CardHeader><CardTitle className="text-sm">By method (last 90 days)</CardTitle></CardHeader><CardContent><HorizontalBars data={stats.data.byMethod.map((m: any) => ({ label: formatStatus(m.method), value: m.amount }))} labelKey="label" valueKey="value" valueFormatter={(v) => formatCurrency(v)} /></CardContent></Card>
      ) : null}
      <FilterBar onReset={() => { list.reset(); setUnreconciledOnly(false); }}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Receipt, reference, payer…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.method ?? ''} onChange={(v) => list.setFilter('method', v)} options={PaymentMethods.map((m) => ({ value: m, label: formatStatus(m) }))} allLabel="Any method" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(PaymentStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={unreconciledOnly} onCheckedChange={(v) => { setUnreconciledOnly(v); list.setFilter('reconciled', v ? 'false' : ''); }} /> Unreconciled only</label>
      </FilterBar>
      <DataTable
        rows={payments.data?.items}
        loading={payments.isFetching}
        error={payments.error}
        onRetry={() => payments.refetch()}
        rowKey={(p: any) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(p: any) => navigate(`/app/payments/${p.id}`)}
        emptyTitle="No payments yet"
        emptyDescription="Record offline collections here, or enable the online gateway so residents can pay from the app."
        columns={[
          { key: 'receivedAt', header: 'Date', sortable: true, cell: (p: any) => formatDate(p.receivedAt) },
          { key: 'receiptNumber', header: 'Receipt', cell: (p: any) => <span className="font-medium">{p.receiptNumber}</span> },
          { key: 'unit', header: 'Unit', cell: (p: any) => <span>{p.unitId?.code}<span className="block text-xs text-muted-foreground">{p.payerName}</span></span> },
          { key: 'method', header: 'Method', sortable: true, hideBelow: 'md', cell: (p: any) => `${formatStatus(p.method)}${p.reference ? ` · ${p.reference}` : ''}` },
          { key: 'amount', header: 'Amount', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (p: any) => <span className="tabular font-medium">{formatCurrency(p.amount)}</span> },
          { key: 'status', header: 'Status', sortable: true, cell: (p: any) => <span className="flex items-center gap-1"><StatusBadge status={p.status} />{p.reconciled ? <Badge variant="info">Rec.</Badge> : null}</span> },
        ]}
        pagination={payments.data ? { page: payments.data.page, pages: payments.data.pages, total: payments.data.total, limit: payments.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <RecordPaymentDialog open={recording} onOpenChange={setRecording} />
      <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) navigate('/app/payments'); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Payment</SheetTitle><SheetDescription>Receipt details, allocations and actions.</SheetDescription></SheetHeader>
          <div className="mt-4">{id ? <PaymentDetail id={id} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
