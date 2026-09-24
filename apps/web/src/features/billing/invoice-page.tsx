import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Printer, Send, Ban, CheckCheck, Wallet, CreditCard, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCancelInvoice, useInvoice, useIssueInvoice, useRemindInvoice } from '@/hooks/use-billing';
import { useCreateOrder, useGatewayPublic, useSimulateGateway, useVerifyOrder } from '@/hooks/use-payments';
import { useSocietyProfile } from '@/hooks/use-society';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-access';
import { RecordPaymentDialog } from '@/features/payments/record-payment-dialog';
import { useCheckout } from '@/features/payments/checkout';
import { formatCurrency, formatDate, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const PAYABLE = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

/** Printable invoice document (society letterhead, line items, totals, payments). */
export function InvoiceDocument({ invoice, society }: { invoice: any; society: any }) {
  const unit = invoice.unitId ?? {};
  const address = society?.address ?? {};
  return (
    <div className="mx-auto max-w-3xl rounded-lg border bg-card p-6 print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          {society?.logoUrl ? <img src={society.logoUrl} alt="" className="h-12 w-12 rounded object-cover" /> : null}
          <div>
            <p className="text-lg font-semibold">{society?.name}</p>
            <p className="text-xs text-muted-foreground">{[address.line1, address.city, address.state, address.pincode].filter(Boolean).join(', ')}</p>
            {society?.registrationNumber ? <p className="text-xs text-muted-foreground">Regn. no. {society.registrationNumber}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</p>
          <p className="text-lg font-semibold">{invoice.invoiceNumber}</p>
          <StatusBadge status={invoice.status} className="print:hidden" />
        </div>
      </div>
      <div className="grid gap-4 py-4 sm:grid-cols-3">
        <div><p className="text-xs uppercase text-muted-foreground">Bill to</p><p className="font-medium">{invoice.billTo?.name ?? invoice.residentId?.name ?? '—'}</p><p className="text-sm">Unit {unit.code}{unit.floor != null ? ` · Floor ${unit.floor}` : ''}</p>{invoice.billTo?.email ? <p className="text-xs text-muted-foreground">{invoice.billTo.email}</p> : null}</div>
        <div><p className="text-xs uppercase text-muted-foreground">Period</p><p className="font-medium">{invoice.period?.label ?? '—'}</p>{invoice.period?.from ? <p className="text-xs text-muted-foreground">{formatDate(invoice.period.from)} – {formatDate(invoice.period.to)}</p> : null}</div>
        <div className="sm:text-right"><p className="text-xs uppercase text-muted-foreground">Dates</p><p className="text-sm">Issued {formatDate(invoice.issueDate) || '—'}</p><p className="text-sm">Due <span className="font-medium">{formatDate(invoice.dueDate)}</span></p></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
        <TableBody>
          {invoice.lineItems.map((li: any) => (
            <TableRow key={li._id ?? li.id ?? li.code + li.description}>
              <TableCell>{li.description}{li.taxRate ? <span className="block text-xs text-muted-foreground">incl. {li.taxRate}% tax {formatCurrency(li.taxAmount)}</span> : null}</TableCell>
              <TableCell className="text-right tabular">{li.quantity !== 1 ? li.quantity : ''}</TableCell>
              <TableCell className="text-right tabular">{li.quantity !== 1 ? formatCurrency(li.rate) : ''}</TableCell>
              <TableCell className="text-right tabular">{formatCurrency(li.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{formatCurrency(invoice.subtotal)}</span></div>
        {invoice.taxTotal ? <div className="flex justify-between"><span>Tax</span><span className="tabular">{formatCurrency(invoice.taxTotal)}</span></div> : null}
        {invoice.discount?.amount ? <div className="flex justify-between"><span>Discount{invoice.discount.reason ? ` (${invoice.discount.reason})` : ''}</span><span className="tabular">−{formatCurrency(invoice.discount.amount)}</span></div> : null}
        {invoice.penalty ? <div className="flex justify-between text-destructive"><span>Late payment penalty</span><span className="tabular">{formatCurrency(invoice.penalty)}</span></div> : null}
        <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span className="tabular">{formatCurrency(invoice.total)}</span></div>
        {invoice.amountPaid ? <div className="flex justify-between text-success"><span>Paid</span><span className="tabular">−{formatCurrency(invoice.amountPaid)}</span></div> : null}
        <div className="flex justify-between font-semibold"><span>Balance due</span><span className="tabular">{formatCurrency(invoice.balanceDue)}</span></div>
        {invoice.previousBalance ? <p className="pt-1 text-xs text-muted-foreground">Previous balance carried on the unit ledger: {formatCurrency(invoice.previousBalance)} (not included above).</p> : null}
      </div>
      {invoice.payments?.length ? (
        <div className="mt-4 border-t pt-3 text-sm">
          <p className="mb-1 text-xs uppercase text-muted-foreground">Payments</p>
          <ul className="space-y-0.5">{invoice.payments.map((p: any) => <li key={p.id} className="flex justify-between"><span>{p.receiptNumber} · {formatStatus(p.method)} · {formatDate(p.receivedAt)}</span><span className="tabular">{formatCurrency(p.allocated)}</span></li>)}</ul>
        </div>
      ) : null}
      {invoice.notes ? <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">{invoice.notes}</p> : null}
      {invoice.status === 'CANCELLED' ? <p className="mt-3 rounded bg-destructive/10 p-2 text-xs text-destructive">Cancelled {formatDate(invoice.cancelledAt)}: {invoice.cancelReason}</p> : null}
    </div>
  );
}

export default function InvoicePage({ mode = 'admin' }: { mode?: 'admin' | 'member' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const invoice = useInvoice(id);
  const society = useSocietyProfile();
  const { context } = useAuth();
  const { can } = usePermissions();
  const issue = useIssueInvoice();
  const cancel = useCancelInvoice();
  const remind = useRemindInvoice();
  const { confirm, ConfirmElement } = useConfirm();
  const [recording, setRecording] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const gateway = useGatewayPublic(mode === 'member' || can('payments:pay_own'));
  const createOrder = useCreateOrder();
  const simulate = useSimulateGateway();
  const verify = useVerifyOrder();
  const inv = invoice.data;
  const checkout = useCheckout({
    title: `Pay ${inv?.invoiceNumber ?? 'invoice'}`,
    description: `Balance due ${formatCurrency(inv?.balanceDue ?? 0)} for unit ${inv?.unitId?.code ?? ''}`,
    prefill: { name: context?.user.name, email: context?.user.email ?? undefined, contact: context?.user.phone ?? undefined },
    createOrder: () => createOrder.mutateAsync({ unitId: inv?.unitId?.id ?? inv?.unitId?._id, invoiceIds: [id] }),
    simulate: (orderId, outcome) => simulate.mutateAsync({ orderId, outcome }),
    verify: (orderId, r) => verify.mutateAsync({ orderId, ...r }),
  });
  if (invoice.isLoading) return <PageSkeleton />;
  if (invoice.isError || !inv) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />;
  const back = mode === 'member' ? '/app/my/bills' : '/app/billing';
  const payable = PAYABLE.includes(inv.status) && inv.balanceDue > 0;
  return (
    <div>
      {ConfirmElement}
      {checkout.element}
      <PageHeader
        title={<span className="flex items-center gap-2">{inv.invoiceNumber} <StatusBadge status={inv.status} /></span>}
        description={`Unit ${inv.unitId?.code ?? ''} · ${inv.period?.label ?? 'Ad-hoc'} · due ${formatDate(inv.dueDate)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(back)}><ArrowLeft /> Back</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer /> Print / PDF</Button>
            {payable && gateway.data?.enabled ? <PermissionGate permission={['payments:pay_own', 'payments:create']}><SubscriptionGate><Button onClick={checkout.start}><CreditCard /> Pay {formatCurrency(inv.balanceDue)}</Button></SubscriptionGate></PermissionGate> : null}
            {mode === 'admin' ? (
              <SubscriptionGate>
                {inv.status === 'DRAFT' ? <PermissionGate permission="billing:issue"><Button loading={issue.isPending} onClick={() => issue.mutate(id, { onSuccess: () => toast.success('Invoice issued'), onError: (e) => toast.error(getErrorMessage(e)) })}><CheckCheck /> Issue</Button></PermissionGate> : null}
                {payable ? <PermissionGate permission="payments:create"><Button variant="outline" onClick={() => setRecording(true)}><Wallet /> Record payment</Button></PermissionGate> : null}
                {payable ? <PermissionGate permission={['billing:issue', 'billing:update']}><Button variant="outline" loading={remind.isPending} onClick={() => remind.mutate(id, { onSuccess: () => toast.success('Reminder sent to the residents of the unit'), onError: (e) => toast.error(getErrorMessage(e)) })}><Send /> Remind</Button></PermissionGate> : null}
                {inv.status !== 'CANCELLED' && inv.amountPaid === 0 ? <PermissionGate permission="billing:cancel"><Button variant="ghost" className="text-destructive" onClick={() => setCancelling(true)}><Ban /> Cancel</Button></PermissionGate> : null}
              </SubscriptionGate>
            ) : null}
          </>
        }
      />
      {inv.status === 'DRAFT' && mode === 'admin' ? <Card className="mb-4 border-dashed"><CardContent className="p-4 text-sm text-muted-foreground">This invoice is a draft: it is not on the unit ledger yet and residents cannot see it. Issue it to make it payable. Drafts from a billing run are issued together from <Link className="text-primary hover:underline" to="/app/billing/runs">Billing runs</Link>.</CardContent></Card> : null}
      <InvoiceDocument invoice={inv} society={society.data} />
      <RecordPaymentDialog open={recording} onOpenChange={setRecording} unitId={inv.unitId?.id ?? inv.unitId?._id} invoiceId={id} />
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cancel {inv.invoiceNumber}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The invoice is voided and removed from the unit ledger. Meter readings on it become billable again.</p>
          <div className="space-y-1.5"><Label htmlFor="cancel-reason">Reason *</Label><Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(false)}>Keep</Button>
            <Button variant="destructive" loading={cancel.isPending} disabled={reason.trim().length < 2} onClick={async () => { if (await confirm({ title: 'Confirm cancellation', description: 'This cannot be undone.', destructive: true, confirmLabel: 'Cancel invoice' })) cancel.mutate({ id, reason }, { onSuccess: () => { toast.success('Invoice cancelled'); setCancelling(false); }, onError: (e) => toast.error(getErrorMessage(e)) }); }}>Cancel invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MemberInvoicePage() {
  return <InvoicePage mode="member" />;
}
