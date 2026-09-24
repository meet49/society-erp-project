import * as React from 'react';
import { toast } from 'sonner';
import { Save, KeyRound, Webhook, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGatewayConfig, useSaveGatewayConfig } from '@/hooks/use-payments';
import { useSocietySetting, useSaveSocietySetting } from '@/hooks/use-society';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/errors';

const METHODS = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];
const OFFLINE = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'OTHER'];

export default function GatewaySettingsPage() {
  const { context } = useAuth();
  const gateway = useGatewayConfig();
  const save = useSaveGatewayConfig();
  const paymentsCfg = useSocietySetting('payments.config');
  const saveSetting = useSaveSocietySetting();
  const [form, setForm] = React.useState<any>(null);
  const [offline, setOffline] = React.useState<{ allowPartialPayments: boolean; offlineMethods: string[] } | null>(null);
  React.useEffect(() => { if (gateway.data && !form) setForm({ provider: gateway.data.provider, enabled: gateway.data.enabled, displayName: gateway.data.displayName ?? '', keyId: gateway.data.keyId ?? '', keySecret: '', webhookSecret: '', testMode: gateway.data.testMode ?? true, allowedMethods: gateway.data.allowedMethods ?? METHODS, convenienceFeePercent: String(gateway.data.convenienceFeePercent ?? 0) }); }, [gateway.data, form]);
  React.useEffect(() => { if (paymentsCfg.data && !offline) setOffline({ allowPartialPayments: paymentsCfg.data.allowPartialPayments !== false, offlineMethods: paymentsCfg.data.offlineMethods ?? OFFLINE }); }, [paymentsCfg.data, offline]);
  if (gateway.isLoading || !form || !offline) return <div><PageHeader title="Payment gateway" /><SettingsNav /><PageSkeleton /></div>;
  if (gateway.isError) return <ErrorState error={gateway.error} onRetry={() => gateway.refetch()} />;
  const webhookUrl = `${window.location.origin}/api/v1/webhooks/payments/${form.provider}/${context?.society?.id}`;
  return (
    <div>
      <PageHeader title="Payment gateway" description="Let residents pay dues online. Credentials are encrypted at rest and never shown again once saved." />
      <SettingsNav />
      <SubscriptionGate>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4" /> Gateway credentials {gateway.data?.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="muted">Disabled</Badge>}</CardTitle><CardDescription>Choose Razorpay for live collections. The demo gateway simulates payments end-to-end without moving money — ideal while you evaluate.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Provider</Label><Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="razorpay">Razorpay</SelectItem><SelectItem value="mock">Demo gateway (no real money)</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="gw-name">Name shown to residents</Label><Input id="gw-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Pay online" /></div>
              {form.provider === 'razorpay' ? (
                <>
                  <div className="space-y-1.5"><Label htmlFor="gw-key">Key ID *</Label><Input id="gw-key" value={form.keyId} onChange={(e) => setForm({ ...form, keyId: e.target.value })} placeholder="rzp_live_…" autoComplete="off" /></div>
                  <div className="space-y-1.5"><Label htmlFor="gw-secret">Key secret {gateway.data?.hasKeySecret ? <span className="text-xs text-muted-foreground">(saved · leave blank to keep)</span> : '*'}</Label><Input id="gw-secret" type="password" value={form.keySecret} onChange={(e) => setForm({ ...form, keySecret: e.target.value })} autoComplete="new-password" /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="gw-webhook">Webhook secret {gateway.data?.hasWebhookSecret ? <span className="text-xs text-muted-foreground">(saved · leave blank to keep)</span> : ''}</Label><Input id="gw-webhook" type="password" value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} autoComplete="new-password" /><p className="text-xs text-muted-foreground">Set the same secret in the Razorpay dashboard for the webhook below (events: payment.captured, payment.failed, refund.processed).</p></div>
                </>
              ) : null}
              <div className="space-y-1.5"><Label htmlFor="gw-fee">Convenience fee (% added to the payer)</Label><Input id="gw-fee" type="number" min={0} max={10} step="0.1" value={form.convenienceFeePercent} onChange={(e) => setForm({ ...form, convenienceFeePercent: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Allowed methods</Label><div className="flex flex-wrap gap-3 pt-1">{METHODS.map((m) => <label key={m} className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.allowedMethods.includes(m)} onCheckedChange={(c) => setForm({ ...form, allowedMethods: c ? [...form.allowedMethods, m] : form.allowedMethods.filter((x: string) => x !== m) })} />{m}</label>)}</div></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.testMode} onCheckedChange={(v) => setForm({ ...form, testMode: v })} /> Test mode (shown to payers)</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /> Online payments enabled</label>
              <div className="sm:col-span-2"><Button loading={save.isPending} onClick={() => save.mutate({ ...form, convenienceFeePercent: Number(form.convenienceFeePercent) || 0, keySecret: form.keySecret || undefined, webhookSecret: form.webhookSecret || undefined }, { onSuccess: () => { toast.success('Gateway settings saved'); setForm({ ...form, keySecret: '', webhookSecret: '' }); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Save /> Save gateway</Button></div>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Webhook className="h-4 w-4" /> Webhook endpoint</CardTitle><CardDescription>Payments are confirmed even if the payer closes the browser.</CardDescription></CardHeader>
              <CardContent><code className="block break-all rounded bg-muted p-2 text-xs">{webhookUrl}</code><p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Every callback is signature-checked and processed once; unsigned or replayed events are ignored.</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Offline collections</CardTitle><CardDescription>Rules for payments recorded by the office.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 text-sm"><Switch checked={offline.allowPartialPayments} onCheckedChange={(v) => setOffline({ ...offline, allowPartialPayments: v })} /> Allow partial payments against an invoice</label>
                <div className="space-y-1.5"><Label>Accepted offline methods</Label><div className="flex flex-wrap gap-3 pt-1">{OFFLINE.map((m) => <label key={m} className="flex items-center gap-1.5 text-sm"><Checkbox checked={offline.offlineMethods.includes(m)} onCheckedChange={(c) => setOffline({ ...offline, offlineMethods: c ? [...offline.offlineMethods, m] : offline.offlineMethods.filter((x) => x !== m) })} />{m.replace('_', ' ')}</label>)}</div></div>
                <Button variant="outline" size="sm" loading={saveSetting.isPending} onClick={() => saveSetting.mutate({ key: 'payments.config', value: offline }, { onSuccess: () => toast.success('Offline rules saved'), onError: (e) => toast.error(getErrorMessage(e)) })}><Save /> Save rules</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </SubscriptionGate>
    </div>
  );
}
