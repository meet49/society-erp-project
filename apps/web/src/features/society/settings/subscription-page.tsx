import * as React from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useCancelSubscriptionSelf, useChangePlanSelf, useSocietySubscription } from '@/hooks/use-society';
import { useCreateSubscriptionOrder, useSimulateSubscriptionGateway, useSubscriptionPaymentHistory, useVerifySubscriptionOrder } from '@/hooks/use-payments';
import { useCheckout } from '@/features/payments/checkout';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge as PaymentStatusBadge } from '@/components/common/status-badge';
import { cn, formatCurrency, formatDate, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Pay / renew the subscription online through the platform gateway (server-verified). */
function PayNowCard({ sub, plan, cycle }: { sub: any; plan: any; cycle: 'MONTHLY' | 'ANNUAL' }) {
  const { context } = useAuth();
  const history = useSubscriptionPaymentHistory();
  const createOrder = useCreateSubscriptionOrder();
  const simulate = useSimulateSubscriptionGateway();
  const verify = useVerifySubscriptionOrder();
  const amount = cycle === 'ANNUAL' ? plan?.annualPrice : plan?.monthlyPrice;
  const checkout = useCheckout({
    title: `Pay for ${plan?.name ?? 'your plan'}`,
    description: `${formatStatus(cycle)} billing · ${formatCurrency(amount ?? 0, plan?.currency)}`,
    prefill: { name: context?.user.name, email: context?.user.email ?? undefined },
    createOrder: () => createOrder.mutateAsync({ billingCycle: cycle }),
    simulate: (orderId, outcome) => simulate.mutateAsync({ orderId, outcome }),
    verify: (orderId, r) => verify.mutateAsync({ orderId, ...r }),
  });
  const needsPayment = ['TRIALING', 'PAST_DUE', 'EXPIRED', 'SUSPENDED'].includes(sub.status) || (sub.status === 'ACTIVE' && (new Date(sub.renewalDate).getTime() - Date.now()) / 86_400_000 <= 15);
  return (
    <Card className={cn('mt-4', needsPayment && 'border-primary/40')}>
      {checkout.element}
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div><CardTitle className="text-sm">Payments</CardTitle><CardDescription>{needsPayment ? `Pay ${formatCurrency(amount ?? 0, plan?.currency)} to ${sub.status === 'TRIALING' ? 'activate' : 'renew'} the ${plan?.name} plan (${formatStatus(cycle).toLowerCase()}). Your renewal date moves forward by one cycle.` : `Next renewal ${formatDate(sub.renewalDate)}. You can pay ahead anytime.`}</CardDescription></div>
        <PermissionGate permission="society:manage_subscription">{sub.status !== 'CANCELLED' && (amount ?? 0) > 0 ? <Button onClick={checkout.start}>{needsPayment ? 'Pay now' : 'Pay in advance'}</Button> : null}</PermissionGate>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {(history.data?.items ?? []).map((p: any) => (
            <li key={p.id ?? p._id} className="flex items-center justify-between gap-3 py-2"><span>{formatDate(p.paidAt ?? p.createdAt)} · {p.planId?.name ?? ''} · {formatStatus(p.billingCycle)}{p.receiptNumber ? ` · ${p.receiptNumber}` : ''}</span><span className="flex items-center gap-2"><span className="tabular font-medium">{formatCurrency(p.amount, p.currency)}</span><PaymentStatusBadge status={p.status} /></span></li>
          ))}
          {!history.isLoading && !(history.data?.items ?? []).length ? <li className="py-2 text-muted-foreground">No payments yet.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionPage() {
  const data = useSocietySubscription();
  const changePlan = useChangePlanSelf();
  const cancel = useCancelSubscriptionSelf();
  const { confirm, ConfirmElement } = useConfirm();
  const [cycle, setCycle] = React.useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  React.useEffect(() => { if (data.data) setCycle(data.data.subscription.billingCycle); }, [data.data]);
  if (data.isLoading) return <PageSkeleton />;
  if (data.isError || !data.data) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const { subscription: sub, plan, availablePlans, limits, access, selfService } = data.data;
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Subscription" description="Your plan, renewal, usage against limits and available upgrades." />
      <SettingsNav />
      {access.blocked ? <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Your subscription is {formatStatus(access.status)}. Pay below, choose a plan or contact support to restore access.</div> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Current plan</CardTitle></CardHeader>
          <CardContent>
            <KeyValue columns={3} items={[{ label: 'Plan', value: plan?.name ?? '—' }, { label: 'Status', value: <StatusBadge status={sub.status} /> }, { label: 'Billing cycle', value: formatStatus(sub.billingCycle) }, { label: 'Amount', value: formatCurrency(sub.amount, sub.currency) }, { label: sub.status === 'TRIALING' ? 'Trial ends' : 'Renews on', value: formatDate(sub.status === 'TRIALING' ? sub.trialEndDate : sub.renewalDate) }, { label: 'Days remaining', value: access.daysRemaining ?? '—' }]} />
            {sub.status === 'PAST_DUE' ? <p className="mt-3 text-sm text-warning-foreground dark:text-warning">Payment is overdue. Grace period ends {formatDate(sub.gracePeriodEndsAt)}.</p> : null}
            <PermissionGate permission="society:manage_subscription">
              {selfService.cancel && sub.status !== 'CANCELLED' ? <Button variant="ghost" size="sm" className="mt-4 text-destructive" onClick={async () => { if (await confirm({ title: 'Cancel subscription?', description: 'Access is blocked at the end of the current period. Your data is kept and you can reactivate later.', destructive: true, confirmLabel: 'Cancel subscription' })) cancel.mutate({ reason: 'Cancelled by society admin' }, { onSuccess: () => toast.success('Subscription cancelled'), onError: (e) => toast.error(getErrorMessage(e)) }); }}>Cancel subscription</Button> : null}
            </PermissionGate>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Usage & limits</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {limits.map((l: any) => (
              <div key={l.key}>
                <div className="mb-1 flex justify-between text-xs"><span>{l.label}</span><span className="tabular text-muted-foreground">{l.used} / {l.limit == null ? '∞' : l.limit}</span></div>
                <Progress value={l.used} max={l.limit ?? Math.max(l.used, 1)} tone={l.limit != null && l.used >= l.limit ? 'destructive' : l.limit != null && l.used / l.limit > 0.8 ? 'warning' : 'primary'} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <PayNowCard sub={sub} plan={plan} cycle={cycle} />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Plans</CardTitle>
          <CardDescription>{selfService.changePlan ? 'Switch plans anytime. Modules outside the new plan become unavailable but no data is deleted.' : 'Plan changes are handled by the platform team - contact support.'}</CardDescription>
          <div className="flex gap-2 pt-2 text-xs">
            {(['MONTHLY', 'ANNUAL'] as const).map((c) => <button key={c} type="button" onClick={() => setCycle(c)} className={cn('rounded-full border px-3 py-1', cycle === c && 'border-primary bg-primary text-primary-foreground')}>{formatStatus(c)}</button>)}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {availablePlans.map((p: any) => {
            const current = String(p._id ?? p.id) === String(plan?._id ?? plan?.id);
            return (
              <div key={p._id ?? p.id} className={cn('flex flex-col rounded-lg border p-4', current && 'border-primary ring-1 ring-primary')}>
                <div className="flex items-center justify-between"><p className="font-semibold">{p.name}</p>{current ? <Badge>Current</Badge> : p.badge ? <Badge variant="secondary">{p.badge}</Badge> : null}</div>
                <p className="mt-1 text-2xl font-semibold">{formatCurrency(cycle === 'ANNUAL' ? p.annualPrice : p.monthlyPrice, p.currency)}<span className="text-xs font-normal text-muted-foreground"> / {cycle === 'ANNUAL' ? 'year' : 'month'}</span></p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
                <ul className="mt-3 flex-1 space-y-1 text-xs">{(p.features ?? []).filter((f: any) => f.included).slice(0, 6).map((f: any) => <li key={f.key} className="flex gap-1"><Check className="mt-0.5 h-3 w-3 text-success" />{f.label}</li>)}</ul>
                <PermissionGate permission="society:manage_subscription">
                  {selfService.changePlan ? (
                    <Button className="mt-4" variant={current ? 'outline' : 'default'} disabled={current && cycle === sub.billingCycle} loading={changePlan.isPending} onClick={async () => { if (await confirm({ title: `Switch to ${p.name} (${formatStatus(cycle)})?`, description: 'Changes take effect immediately.', confirmLabel: 'Switch plan' })) changePlan.mutate({ planId: p._id ?? p.id, billingCycle: cycle }, { onSuccess: () => toast.success(`Plan changed to ${p.name}`), onError: (e) => toast.error(getErrorMessage(e)) }); }}>{current ? (cycle === sub.billingCycle ? 'Current plan' : `Switch to ${formatStatus(cycle).toLowerCase()} billing`) : 'Choose plan'}</Button>
                  ) : null}
                </PermissionGate>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
