import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCheck, Ban, XCircle, Undo2, Receipt, FileText } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAmenityRealtime, useBooking, useCancelBooking, useDecideBooking, useRefundBooking } from '@/hooks/use-amenities';
import { usePermissions } from '@/hooks/use-access';
import { WorkflowTrail } from '@/features/expenses/expense-detail-page';
import { formatCurrency, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { BookingHistory, HOLDING, PaymentChip, whenLabel } from './booking-shared';

/** Staff view of one booking: decide, cancel, process refunds, see the money trail. */
export default function BookingDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const booking = useBooking(id);
  const { can } = usePermissions();
  const decide = useDecideBooking();
  const cancel = useCancelBooking();
  const refund = useRefundBooking();
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [refunding, setRefunding] = React.useState(false);
  const [refundAmount, setRefundAmount] = React.useState('');
  const [refundReason, setRefundReason] = React.useState('');
  useAmenityRealtime();
  if (booking.isLoading) return <PageSkeleton />;
  if (booking.isError || !booking.data) return <ErrorState error={booking.error} onRetry={() => booking.refetch()} />;
  const b = booking.data;
  const holding = HOLDING.includes(b.status);
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">Booking {b.bookingNumber} <StatusBadge status={b.status} /></span>}
        description={`${b.amenityId?.name ?? 'Amenity'} · ${whenLabel(b)} · unit ${b.unitId?.code ?? '—'}`}
        actions={<>
          <Button variant="ghost" onClick={() => navigate('/app/amenities')}><ArrowLeft /> All bookings</Button>
          {b.status === 'PENDING_APPROVAL' && can('amenities:approve') ? <>
            <Button loading={decide.isPending} onClick={() => decide.mutate({ id, decision: 'APPROVED' }, { onSuccess: (r) => toast.success(r.status === 'PENDING_PAYMENT' ? 'Approved · resident asked to pay' : r.status === 'CONFIRMED' ? 'Approved and confirmed' : 'Approved · waiting for the next step'), onError: err })}><CheckCheck /> Approve</Button>
            <Button variant="outline" className="text-destructive" onClick={() => { setNote(''); setRejecting(true); }}><Ban /> Reject</Button>
          </> : null}
          {holding && can('amenities:cancel') ? <Button variant="outline" onClick={() => { setReason(''); setCancelling(true); }}><XCircle /> Cancel booking</Button> : null}
          {b.paymentStatus === 'REFUND_DUE' && can('payments:refund') ? <Button onClick={() => { setRefundAmount(String(b.refund?.amount ?? b.total)); setRefundReason(b.refund?.reason ?? ''); setRefunding(true); }}><Undo2 /> Process refund</Button> : null}
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
            <CardContent>
              <KeyValue columns={2} items={[
                { label: 'Amenity', value: <span>{b.amenityId?.name}{b.amenityId?.location ? <span className="text-muted-foreground"> · {b.amenityId.location}</span> : null}</span> },
                { label: 'Unit', value: b.unitId?.code ?? '—' },
                { label: 'Booked by', value: <span>{b.bookedBy?.name ?? '—'}{b.onBehalf ? <span className="text-muted-foreground"> (on behalf)</span> : null}</span> },
                { label: 'When', value: whenLabel(b) },
                { label: 'Guests', value: b.guests || '—' },
                { label: 'Purpose', value: b.purpose || '—' },
                { label: 'Booked on', value: formatDateTime(b.createdAt) },
                { label: 'Status', value: <StatusBadge status={b.status} /> },
                ...(b.decidedBy || b.decisionNote ? [{ label: 'Decision', value: <span>{b.decidedBy?.name ?? 'Workflow'}{b.decidedAt ? ` · ${formatDateTime(b.decidedAt)}` : ''}{b.decisionNote ? <span className="block text-muted-foreground">{b.decisionNote}</span> : null}</span> }] : []),
                ...(b.cancelledAt ? [{ label: 'Cancelled', value: <span>{b.cancelledBy?.name ?? 'System'} · {formatDateTime(b.cancelledAt)}{b.cancellationReason ? <span className="block text-muted-foreground">{b.cancellationReason}</span> : null}</span> }] : []),
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Money</CardTitle></CardHeader>
            <CardContent>
              <KeyValue columns={3} items={[
                { label: 'Fee', value: formatCurrency(b.amount) },
                { label: 'Deposit', value: formatCurrency(b.deposit) },
                { label: 'Total', value: <span className="font-semibold">{formatCurrency(b.total)}</span> },
                { label: 'Payment', value: <PaymentChip booking={b} />, span: 3 },
                ...(b.invoiceId ? [{ label: 'Invoice', value: <Link className="inline-flex items-center gap-1 text-primary hover:underline" to={`/app/billing/invoices/${b.invoiceId.id ?? b.invoiceId}`}><FileText className="h-3.5 w-3.5" /> {b.invoiceId.invoiceNumber ?? 'View'} · {formatStatus(b.invoiceId.status)}</Link> }] : []),
                ...(b.paymentId ? [{ label: 'Receipt', value: <Link className="inline-flex items-center gap-1 text-primary hover:underline" to={`/app/payments/${b.paymentId.id ?? b.paymentId}`}><Receipt className="h-3.5 w-3.5" /> {b.paymentId.receiptNumber ?? 'View'} · {formatStatus(b.paymentId.method)}</Link> }] : []),
                ...(b.refund?.at ? [{ label: 'Refund', value: `${formatCurrency(b.refund.amount)} · ${formatDateTime(b.refund.at)} · ${b.refund.reason ?? ''}` }] : b.refund?.amount ? [{ label: 'Refund due', value: `${formatCurrency(b.refund.amount)} · ${b.refund.reason ?? ''}` }] : []),
              ]} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <WorkflowTrail workflow={b.workflow} />
          <Card><CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader><CardContent><BookingHistory booking={b} /></CardContent></Card>
        </div>
      </div>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reject booking</DialogTitle><DialogDescription>The resident is notified with your reason.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="bd-note">Reason *</Label><Textarea id="bd-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejecting(false)}>Back</Button><Button variant="destructive" loading={decide.isPending} disabled={note.trim().length < 2} onClick={() => decide.mutate({ id, decision: 'REJECTED', note }, { onSuccess: () => { toast.success('Booking rejected'); setRejecting(false); }, onError: err })}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cancel booking {b.bookingNumber}</DialogTitle><DialogDescription>{b.paymentStatus === 'PAID' ? 'Committee cancellations refund the full fee and deposit; finance processes the refund afterwards.' : b.paymentStatus === 'PENDING' ? 'The unpaid invoice is cancelled and the slot released.' : 'The slot is released immediately.'}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="bd-reason">Reason</Label><Textarea id="bd-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Maintenance, double booking…" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setCancelling(false)}>Back</Button><Button variant="destructive" loading={cancel.isPending} onClick={() => cancel.mutate({ id, reason: reason || undefined }, { onSuccess: () => { toast.success('Booking cancelled'); setCancelling(false); }, onError: err })}>Cancel booking</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={refunding} onOpenChange={setRefunding}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Process refund</DialogTitle><DialogDescription>Refunded against the original payment{b.paymentId?.receiptNumber ? ` (receipt ${b.paymentId.receiptNumber})` : ''}. Online payments are refunded through the gateway.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label htmlFor="bd-ramount">Amount (₹)</Label><Input id="bd-ramount" type="number" min={1} max={b.total} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="bd-rreason">Reason *</Label><Input id="bd-rreason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRefunding(false)}>Back</Button><Button loading={refund.isPending} disabled={refundReason.trim().length < 3 || !Number(refundAmount)} onClick={() => refund.mutate({ id, amount: Number(refundAmount), reason: refundReason }, { onSuccess: () => { toast.success('Refund recorded'); setRefunding(false); }, onError: err })}>Refund {refundAmount ? formatCurrency(Number(refundAmount)) : ''}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
