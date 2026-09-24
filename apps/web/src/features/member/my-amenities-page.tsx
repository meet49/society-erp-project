import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { CalendarDays, Clock, Wallet, ShieldCheck, CreditCard, XCircle, Dumbbell, FileText } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { SubscriptionGate, PermissionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAmenities, useAmenityRealtime, useAmenitySettings, useBookings, useCancelBooking } from '@/hooks/use-amenities';
import { useCreateOrder, useGatewayPublic, useSimulateGateway, useVerifyOrder } from '@/hooks/use-payments';
import { useHousehold } from '@/hooks/use-residents';
import { useAuth } from '@/hooks/use-auth';
import { useAccessibleModules, usePermissions } from '@/hooks/use-access';
import { useCheckout } from '@/features/payments/checkout';
import { BookingDialog, BookingHistory, HOLDING, PaymentChip, hoursLabel, pricingLabel, whenLabel } from '@/features/amenities/booking-shared';
import { formatCurrency, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Resident view: browse amenities, book a slot, pay, cancel, track approvals. */
export default function MyAmenitiesPage() {
  const [params, setParams] = useSearchParams();
  const { context } = useAuth();
  const { can } = usePermissions();
  const { hasModule } = useAccessibleModules();
  const amenities = useAmenities();
  const settings = useAmenitySettings(can('amenities:view'));
  const bookings = useBookings({ limit: 50, sort: '-startAt' });
  const household = useHousehold();
  const gateway = useGatewayPublic(hasModule('payments'));
  const cancel = useCancelBooking();
  const { confirm, ConfirmElement } = useConfirm();
  const [bookingFor, setBookingFor] = React.useState<any | null>(null);
  const [payFor, setPayFor] = React.useState<any | null>(null);
  const createOrder = useCreateOrder();
  const simulate = useSimulateGateway();
  const verify = useVerifyOrder();
  useAmenityRealtime();
  const checkout = useCheckout({
    title: payFor ? `Pay for ${payFor.amenityId?.name ?? 'booking'}` : 'Pay booking',
    description: payFor ? `Booking ${payFor.bookingNumber} · ${whenLabel(payFor)} · ${formatCurrency(payFor.total)}` : '',
    prefill: { name: context?.user.name, email: context?.user.email ?? undefined },
    createOrder: () => createOrder.mutateAsync({ unitId: payFor?.unitId?.id ?? payFor?.unitId, invoiceIds: [payFor?.invoiceId?.id ?? payFor?.invoiceId] }),
    simulate: (orderId, outcome) => simulate.mutateAsync({ orderId, outcome }),
    verify: (orderId, r) => verify.mutateAsync({ orderId, ...r }),
    onSuccess: () => bookings.refetch(),
  });
  const items: any[] = bookings.data?.items ?? [];
  const now = dayjs();
  const upcoming = items.filter((b) => HOLDING.includes(b.status) && dayjs(b.endAt).isAfter(now)).sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf());
  const past = items.filter((b) => !upcoming.includes(b));
  const selectedId = params.get('booking');
  const selected = selectedId ? items.find((b) => b.id === selectedId) : null;
  const unitOptions = (household.data?.units ?? []).map((u: any) => ({ value: u.id, label: u.code }));
  const onlinePay = hasModule('payments') && gateway.data?.enabled && can('payments:pay_own');
  const startPay = (b: any) => { setPayFor(b); setTimeout(() => checkout.start(), 0); };
  const cancelBooking = async (b: any) => {
    const paid = b.paymentStatus === 'PAID';
    const hours = b.amenityId?.cancellationHours ?? settings.data?.cancellationHours ?? 24;
    const inTime = dayjs(b.startAt).diff(now, 'hour', true) >= hours;
    if (!(await confirm({ title: `Cancel ${b.amenityId?.name} on ${dayjs(b.startAt).format('DD MMM')}?`, description: paid ? (inTime ? 'You cancel within the free window: the fee and deposit come back to you.' : `Cancelling less than ${hours} hours before the slot refunds ${settings.data?.lateCancellationRefundPercent ?? 0}% of the fee (the deposit is always returned).`) : 'The slot is released for other residents.', confirmLabel: 'Cancel booking', destructive: true }))) return;
    cancel.mutate({ id: b.id }, { onSuccess: () => toast.success('Booking cancelled'), onError: (e) => toast.error(getErrorMessage(e)) });
  };
  const closeDetail = () => { params.delete('booking'); setParams(params, { replace: true }); };
  const Actions = ({ b, size = 'sm' as const }: { b: any; size?: 'sm' | 'default' }) => (
    <div className="flex flex-wrap gap-2">
      {b.status === 'PENDING_PAYMENT' ? (onlinePay ? <Button size={size} onClick={() => startPay(b)}><CreditCard /> Pay {formatCurrency(b.total)}</Button> : b.invoiceId ? <Button asChild size={size} variant="outline"><Link to={`/app/my/bills/${b.invoiceId.id ?? b.invoiceId}`}><FileText /> View invoice</Link></Button> : null) : null}
      {HOLDING.includes(b.status) && dayjs(b.startAt).isAfter(now) ? <Button size={size} variant="outline" loading={cancel.isPending} onClick={() => cancelBooking(b)}><XCircle /> Cancel</Button> : null}
    </div>
  );
  return (
    <div>
      <PageHeader title="Amenities" description="Book the clubhouse, gym, courts and more. Paid bookings are confirmed once the invoice is settled." />
      {checkout.element}
      {upcoming.length ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">My bookings</h2>
          <div className="space-y-2">
            {upcoming.map((b) => (
              <Card key={b.id} className={b.status === 'PENDING_PAYMENT' ? 'border-warning/60' : ''}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{b.amenityId?.name} <StatusBadge status={b.status} /> <PaymentChip booking={b} /></p>
                    <p className="text-sm text-muted-foreground">{whenLabel(b)}{b.guests ? ` · ${b.guests} guests` : ''}{b.purpose ? ` · ${b.purpose}` : ''}</p>
                    {b.status === 'PENDING_APPROVAL' ? <p className="text-xs text-muted-foreground">Waiting for the committee to approve.</p> : null}
                    {b.status === 'PENDING_PAYMENT' && b.paymentDueAt ? <p className="text-xs text-warning-foreground dark:text-warning">Pay before {formatDateTime(b.paymentDueAt)} to keep this slot.</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Actions b={b} />
                    <Button size="sm" variant="ghost" onClick={() => { params.set('booking', b.id); setParams(params, { replace: true }); }}>Details</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Book an amenity</h2>
        {amenities.isLoading ? <CardSkeleton count={3} /> : !(amenities.data ?? []).length ? <EmptyState icon={<Dumbbell />} title="No amenities to book yet" description="The society office hasn't set up bookable facilities." /> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(amenities.data ?? []).map((a: any) => (
              <Card key={a.id} className={a.status !== 'ACTIVE' ? 'opacity-70' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-base"><span className="truncate">{a.name}</span>{a.status === 'MAINTENANCE' ? <StatusBadge status="UNDER_MAINTENANCE" /> : null}</CardTitle>
                  <p className="text-xs text-muted-foreground">{formatStatus(a.typeKey)}{a.location ? ` · ${a.location}` : ''}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {a.description ? <p className="text-muted-foreground">{a.description}</p> : null}
                  <p className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {hoursLabel(a)}</p>
                  <p className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> {pricingLabel(a)}</p>
                  <p className="flex flex-wrap gap-1.5">{a.maxGuests ? <Badge variant="outline">Up to {a.maxGuests} guests</Badge> : null}{a.requiresApproval ? <Badge variant="info"><ShieldCheck className="mr-1 h-3 w-3" />Approval needed</Badge> : null}</p>
                  <PermissionGate permission="amenities:book"><SubscriptionGate><Button size="sm" disabled={a.status !== 'ACTIVE'} onClick={() => setBookingFor(a)}><CalendarDays /> Book</Button></SubscriptionGate></PermissionGate>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      {past.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Past bookings</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {past.slice(0, 15).map((b) => (
              <li key={b.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2 hover:bg-muted/50" onClick={() => { params.set('booking', b.id); setParams(params, { replace: true }); }}>
                <span className="min-w-0"><span className="font-medium">{b.amenityId?.name}</span><span className="block truncate text-xs text-muted-foreground">{whenLabel(b)}</span></span>
                <span className="flex shrink-0 items-center gap-1"><PaymentChip booking={b} /><StatusBadge status={b.status} /></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <BookingDialog open={Boolean(bookingFor)} onOpenChange={(o) => { if (!o) setBookingFor(null); }} amenity={bookingFor} unitOptions={unitOptions.length > 1 ? unitOptions : undefined} unitId={context?.resident?.primaryUnitId ?? unitOptions[0]?.value} settings={settings.data} onBooked={(b) => { if (b.status === 'PENDING_PAYMENT' && onlinePay) startPay(b); }} />
      <Sheet open={Boolean(selected)} onOpenChange={(o) => { if (!o) closeDetail(); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2">{selected.amenityId?.name} <StatusBadge status={selected.status} /></SheetTitle><SheetDescription>{selected.bookingNumber} · {whenLabel(selected)}</SheetDescription></SheetHeader>
              <div className="mt-4 space-y-4">
                <KeyValue columns={2} items={[
                  { label: 'Unit', value: selected.unitId?.code ?? '—' },
                  { label: 'Guests', value: selected.guests || '—' },
                  { label: 'Purpose', value: selected.purpose || '—', span: 2 },
                  { label: 'Fee', value: formatCurrency(selected.amount) },
                  { label: 'Deposit', value: formatCurrency(selected.deposit) },
                  { label: 'Payment', value: <PaymentChip booking={selected} />, span: 2 },
                  ...(selected.invoiceId ? [{ label: 'Invoice', value: <Link className="text-primary hover:underline" to={`/app/my/bills/${selected.invoiceId.id ?? selected.invoiceId}`}>{selected.invoiceId.invoiceNumber ?? 'View invoice'}</Link> }] : []),
                  ...(selected.paymentId ? [{ label: 'Receipt', value: <Link className="text-primary hover:underline" to={`/app/my/payments/${selected.paymentId.id ?? selected.paymentId}`}>{selected.paymentId.receiptNumber ?? 'View receipt'}</Link> }] : []),
                  ...(selected.decisionNote ? [{ label: 'Committee note', value: selected.decisionNote, span: 2 }] : []),
                  ...(selected.cancellationReason ? [{ label: 'Cancellation', value: selected.cancellationReason, span: 2 }] : []),
                ]} />
                <Actions b={selected} size="default" />
                <div><h3 className="mb-2 text-sm font-semibold">Timeline</h3><BookingHistory booking={selected} /></div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
      {ConfirmElement}
    </div>
  );
}
