import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useActivateSubscription, useCancelSubscriptionPlatform, useChangeSubscriptionPlan, useExtendSubscription, usePlans, useReactivateSubscription, useRemindSubscription, useSuspendSubscription } from '@/hooks/use-platform';
import { formatCurrency } from '@/lib/utils';

type Action = 'extend' | 'change-plan' | 'activate' | 'suspend' | 'cancel' | 'reactivate';

const LABELS: Record<Action, string> = { extend: 'Extend subscription', 'change-plan': 'Change plan', activate: 'Record payment & activate', suspend: 'Suspend subscription', cancel: 'Cancel subscription', reactivate: 'Reactivate subscription' };

/** Dropdown + dialog implementing every platform subscription operation. Used by the list, radar and society detail. */
export function SubscriptionActions({ subscription, compact }: { subscription: { id: string; status: string; planId?: any; billingCycle?: string; amount?: number; currency?: string }; compact?: boolean }) {
  const [action, setAction] = React.useState<Action | null>(null);
  const [days, setDays] = React.useState('30');
  const [note, setNote] = React.useState('');
  const [planId, setPlanId] = React.useState('');
  const [cycle, setCycle] = React.useState(subscription.billingCycle ?? 'MONTHLY');
  const [amount, setAmount] = React.useState(String(subscription.amount ?? ''));
  const [reference, setReference] = React.useState('');
  const plans = usePlans();
  const extend = useExtendSubscription();
  const change = useChangeSubscriptionPlan();
  const activate = useActivateSubscription();
  const suspend = useSuspendSubscription();
  const cancel = useCancelSubscriptionPlatform();
  const reactivate = useReactivateSubscription();
  const remind = useRemindSubscription();
  const pending = extend.isPending || change.isPending || activate.isPending || suspend.isPending || cancel.isPending || reactivate.isPending;
  const s = subscription.status;

  const run = () => {
    const id = subscription.id;
    const done = (msg: string) => () => {
      toast.success(msg);
      setAction(null);
      setNote('');
    };
    if (action === 'extend') extend.mutate({ id, days: Number(days), note: note || undefined }, { onSuccess: done(`Extended by ${days} days`) });
    if (action === 'change-plan') change.mutate({ id, planId, billingCycle: cycle, note: note || undefined }, { onSuccess: done('Plan changed') });
    if (action === 'activate') activate.mutate({ id, note: note || undefined, amount: amount ? Number(amount) : undefined, reference: reference || undefined, method: 'BANK_TRANSFER' }, { onSuccess: done('Subscription activated') });
    if (action === 'suspend') suspend.mutate({ id, reason: note || undefined }, { onSuccess: done('Subscription suspended') });
    if (action === 'cancel') cancel.mutate({ id, reason: note || undefined }, { onSuccess: done('Subscription cancelled') });
    if (action === 'reactivate') reactivate.mutate({ id, days: days ? Number(days) : undefined, note: note || undefined }, { onSuccess: done('Subscription reactivated') });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={compact ? 'sm' : 'default'}>
            Actions <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setAction('extend')}>Extend</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setPlanId(String(subscription.planId?._id ?? subscription.planId?.id ?? subscription.planId ?? '')); setAction('change-plan'); }}>Change plan</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction('activate')}>Record payment & activate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => remind.mutate({ id: subscription.id }, { onSuccess: (d: any) => toast.success(`Reminder sent (${d.daysRemaining} days remaining)`) })}>Send renewal reminder</DropdownMenuItem>
          <DropdownMenuSeparator />
          {['SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(s) ? <DropdownMenuItem onClick={() => setAction('reactivate')}>Reactivate</DropdownMenuItem> : null}
          {s !== 'SUSPENDED' && s !== 'CANCELLED' ? <DropdownMenuItem destructive onClick={() => setAction('suspend')}>Suspend</DropdownMenuItem> : null}
          {s !== 'CANCELLED' ? <DropdownMenuItem destructive onClick={() => setAction('cancel')}>Cancel</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={Boolean(action)} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{action ? LABELS[action] : ''}</DialogTitle>
            <DialogDescription>Current status: {s.replace('_', ' ')}. This action is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {action === 'extend' || action === 'reactivate' ? (
              <div className="space-y-1.5">
                <Label htmlFor="days">Days{action === 'reactivate' ? ' (optional)' : ''}</Label>
                <Input id="days" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
            ) : null}
            {action === 'change-plan' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {(plans.data ?? []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {formatCurrency(p.monthlyPrice, p.currency)}/mo
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Billing cycle</Label>
                  <Select value={cycle} onValueChange={setCycle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="ANNUAL">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            {action === 'activate' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount received ({subscription.currency ?? 'INR'})</Label>
                  <Input id="amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref">Payment reference</Label>
                  <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="note">{action === 'suspend' || action === 'cancel' ? 'Reason' : 'Note'}</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>
              Close
            </Button>
            <Button variant={action === 'suspend' || action === 'cancel' ? 'destructive' : 'default'} onClick={run} loading={pending} disabled={action === 'change-plan' && !planId}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
