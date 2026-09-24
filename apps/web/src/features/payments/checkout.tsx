import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, CreditCard, ShieldCheck, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import type { CheckoutOrder } from '@/hooks/use-payments';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let razorpayLoader: Promise<void> | null = null;
/** Loads the Razorpay checkout script once (only when a Razorpay order is actually started). */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayLoader) {
    razorpayLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { razorpayLoader = null; reject(new Error('Could not load the payment gateway. Check your connection and try again.')); };
      document.body.appendChild(script);
    });
  }
  return razorpayLoader;
}

export interface GatewayResult {
  paymentId: string;
  signature: string;
}

/** Opens Razorpay checkout and resolves with the gateway callback (verified server-side afterwards). */
export function openRazorpay(order: CheckoutOrder, opts: { name: string; description: string; prefill?: { name?: string; email?: string; contact?: string }; themeColor?: string }): Promise<GatewayResult | null> {
  return loadRazorpay().then(
    () =>
      new Promise<GatewayResult | null>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          name: opts.name,
          description: opts.description,
          order_id: order.providerOrderId,
          prefill: opts.prefill,
          theme: { color: opts.themeColor ?? '#4f46e5' },
          modal: { ondismiss: () => resolve(null) },
          handler: (response: any) => resolve({ paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
        });
        rzp.on('payment.failed', (response: any) => reject(new Error(response?.error?.description ?? 'Payment failed')));
        rzp.open();
      }),
  );
}

type Step = 'creating' | 'gateway' | 'verifying' | 'success' | 'failed' | 'cancelled';

export interface CheckoutController {
  /** creates the order on the server */
  createOrder: () => Promise<CheckoutOrder>;
  /** demo gateway: asks the server to play the gateway */
  simulate: (orderId: string, outcome: 'success' | 'failure') => Promise<{ status: 'PAID' | 'FAILED'; paymentId?: string; signature?: string }>;
  /** verifies the gateway callback server-side (the only thing that records money) */
  verify: (orderId: string, result: GatewayResult) => Promise<unknown>;
  title: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess?: (result: unknown) => void;
}

/**
 * Checkout dialog shared by member bill payments and subscription renewals.
 * Flow: create order → gateway (Razorpay popup or the built-in demo gateway) → server verification.
 * Nothing is marked paid on the client; the server verifies the signature and the webhook reconciles.
 */
export function CheckoutDialog({ open, onOpenChange, controller }: { open: boolean; onOpenChange: (open: boolean) => void; controller: CheckoutController }) {
  const [step, setStep] = React.useState<Step>('creating');
  const [order, setOrder] = React.useState<CheckoutOrder | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const started = React.useRef(false);

  const verify = React.useCallback(
    async (o: CheckoutOrder, gateway: GatewayResult) => {
      setStep('verifying');
      try {
        const res = await controller.verify(o.orderId, gateway);
        setResult(res);
        setStep('success');
        controller.onSuccess?.(res);
      } catch (err) {
        setError(getErrorMessage(err));
        setStep('failed');
      }
    },
    [controller],
  );

  const runRazorpay = React.useCallback(
    async (o: CheckoutOrder) => {
      try {
        const gateway = await openRazorpay(o, { name: controller.title, description: controller.description, prefill: controller.prefill });
        if (!gateway) {
          setStep('cancelled');
          return;
        }
        await verify(o, gateway);
      } catch (err) {
        setError(getErrorMessage(err));
        setStep('failed');
      }
    },
    [controller, verify],
  );

  React.useEffect(() => {
    if (!open) {
      started.current = false;
      setStep('creating');
      setOrder(null);
      setError(null);
      setResult(null);
      return;
    }
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const o = await controller.createOrder();
        if (o.free) {
          setResult(o);
          setStep('success');
          controller.onSuccess?.(o);
          return;
        }
        setOrder(o);
        setStep('gateway');
        if (o.provider === 'razorpay') await runRazorpay(o);
      } catch (err) {
        setError(getErrorMessage(err));
        setStep('failed');
      }
    })();
  }, [open, controller, runRazorpay]);

  const simulate = async (outcome: 'success' | 'failure') => {
    if (!order) return;
    try {
      const res = await controller.simulate(order.orderId, outcome);
      if (res.status === 'PAID' && res.paymentId && res.signature) await verify(order, { paymentId: res.paymentId, signature: res.signature });
      else {
        setError('The demo gateway reported a failed payment. Nothing was charged.');
        setStep('failed');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setStep('failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (step === 'verifying') return; onOpenChange(o); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> {controller.title}</DialogTitle>
          <DialogDescription>{controller.description}</DialogDescription>
        </DialogHeader>
        {step === 'creating' ? <p className="py-6 text-center text-sm text-muted-foreground">Preparing a secure payment order…</p> : null}
        {step === 'gateway' && order ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Amount</span><span className="text-2xl font-semibold tabular">{formatCurrency(order.amount, order.currency)}</span></div>
              {order.convenienceFee ? <p className="mt-1 text-xs text-muted-foreground">Includes {formatCurrency(order.convenienceFee, order.currency)} convenience fee</p> : null}
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Verified server-side · {order.displayName ?? (order.provider === 'razorpay' ? 'Razorpay' : 'Demo gateway')}{order.testMode ? <Badge variant="warning" className="ml-1">Test mode</Badge> : null}</p>
            </div>
            {order.provider === 'razorpay' ? (
              <div className="space-y-2 text-center text-sm text-muted-foreground">
                <p>Complete the payment in the gateway window.</p>
                <Button variant="outline" size="sm" onClick={() => runRazorpay(order)}>Reopen payment window</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">This society uses the built-in demo gateway. Choose how the bank should respond:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => simulate('success')}><CheckCircle2 /> Pay {formatCurrency(order.amount, order.currency)}</Button>
                  <Button variant="outline" onClick={() => simulate('failure')}><XCircle /> Simulate failure</Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {step === 'verifying' ? <p className="py-6 text-center text-sm text-muted-foreground">Verifying your payment with the gateway…</p> : null}
        {step === 'success' ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <p className="mt-2 font-semibold">Payment successful</p>
            {result?.payment?.receiptNumber ? <p className="text-sm text-muted-foreground">Receipt {result.payment.receiptNumber}</p> : null}
            {result?.alreadyProcessed ? <p className="text-xs text-muted-foreground">This payment was already recorded.</p> : null}
          </div>
        ) : null}
        {step === 'failed' ? (
          <div className="py-4 text-center">
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <p className="mt-2 font-semibold">Payment not completed</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : null}
        {step === 'cancelled' ? <p className="py-6 text-center text-sm text-muted-foreground">Payment window closed. No money was charged.</p> : null}
        <DialogFooter>
          {step === 'success' || step === 'failed' || step === 'cancelled' ? <Button onClick={() => onOpenChange(false)}>{step === 'success' ? 'Done' : 'Close'}</Button> : <Button variant="ghost" disabled={step === 'verifying'} onClick={() => onOpenChange(false)}>Cancel</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience hook: state + element for a checkout started from a button. */
export function useCheckout(controller: CheckoutController) {
  const [open, setOpen] = React.useState(false);
  const stable = React.useRef(controller);
  stable.current = controller;
  const memo = React.useMemo<CheckoutController>(() => ({
    title: controller.title,
    description: controller.description,
    prefill: controller.prefill,
    createOrder: () => stable.current.createOrder(),
    simulate: (id, outcome) => stable.current.simulate(id, outcome),
    verify: (id, r) => stable.current.verify(id, r),
    onSuccess: (r) => { stable.current.onSuccess?.(r); toast.success('Payment recorded'); },
  }), [controller.title, controller.description, controller.prefill]);
  return { open, start: () => setOpen(true), element: <CheckoutDialog open={open} onOpenChange={setOpen} controller={memo} /> };
}
