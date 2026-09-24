import * as React from 'react';
import { toast } from 'sonner';
import { PaymentMethods } from '@society-erp/shared';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/common/combobox';
import { useUnitOptions } from '@/hooks/use-units';
import { useInvoices, useUnitBalance } from '@/hooks/use-billing';
import { useRecordPayment } from '@/hooks/use-payments';
import { useSocietySetting } from '@/hooks/use-society';
import { formatCurrency, formatDate, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const OFFLINE_METHODS = PaymentMethods.filter((m) => m !== 'ONLINE');

/** Records an offline payment (cash, cheque, bank transfer, UPI…) against a unit; allocation is FIFO unless invoices are picked. */
export function RecordPaymentDialog({ open, onOpenChange, unitId: presetUnitId, invoiceId: presetInvoiceId, onRecorded }: { open: boolean; onOpenChange: (o: boolean) => void; unitId?: string; invoiceId?: string; onRecorded?: (payment: any) => void }) {
  const units = useUnitOptions(open);
  const paymentsCfg = useSocietySetting('payments.config');
  const record = useRecordPayment();
  const [form, setForm] = React.useState({ unitId: presetUnitId ?? '', amount: '', method: 'CASH', receivedAt: toInputDate(new Date()), reference: '', payerName: '', notes: '' });
  const [selected, setSelected] = React.useState<string[]>(presetInvoiceId ? [presetInvoiceId] : []);
  React.useEffect(() => { if (open) { setForm((f) => ({ ...f, unitId: presetUnitId ?? f.unitId })); setSelected(presetInvoiceId ? [presetInvoiceId] : []); } }, [open, presetUnitId, presetInvoiceId]);
  const openInvoices = useInvoices({ unitId: form.unitId, status: undefined, limit: 50, sort: 'dueDate' }, Boolean(form.unitId));
  const balance = useUnitBalance(form.unitId);
  const payable = (openInvoices.data?.items ?? []).filter((i: any) => ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status));
  const selectedTotal = payable.filter((i: any) => selected.includes(i.id)).reduce((s: number, i: any) => s + i.balanceDue, 0);
  const methods = (paymentsCfg.data?.offlineMethods as string[] | undefined)?.length ? OFFLINE_METHODS.filter((m) => paymentsCfg.data.offlineMethods.includes(m)) : OFFLINE_METHODS;
  const submit = () => {
    record.mutate(
      { unitId: form.unitId, amount: Number(form.amount), method: form.method, receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : undefined, reference: form.reference || undefined, payerName: form.payerName || undefined, notes: form.notes || undefined, invoiceIds: selected.length ? selected : undefined },
      {
        onSuccess: (p) => { toast.success(`Receipt ${p.receiptNumber} recorded`); onRecorded?.(p); onOpenChange(false); setForm({ unitId: presetUnitId ?? '', amount: '', method: 'CASH', receivedAt: toInputDate(new Date()), reference: '', payerName: '', notes: '' }); setSelected([]); },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Offline collections are allocated to the oldest open invoices first, unless you pick specific invoices. Any excess is kept as an advance.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Unit *</Label><Combobox value={form.unitId} onChange={(v) => { setForm({ ...form, unitId: v ?? '' }); setSelected([]); }} options={units.data ?? []} placeholder="Select unit" disabled={Boolean(presetUnitId)} /></div>
          {form.unitId ? (
            <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between"><span className="font-medium">Open invoices</span><span className="text-xs text-muted-foreground">Balance {formatCurrency(balance.data?.balance ?? 0)}</span></div>
              {payable.length ? (
                <ul className="space-y-1">
                  {payable.map((i: any) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <Checkbox id={`inv-${i.id}`} checked={selected.includes(i.id)} onCheckedChange={(c) => setSelected(c ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
                      <label htmlFor={`inv-${i.id}`} className="flex flex-1 cursor-pointer items-center justify-between gap-2"><span>{i.invoiceNumber} <span className="text-xs text-muted-foreground">{i.period?.label} · due {formatDate(i.dueDate)}</span></span><span className="tabular">{formatCurrency(i.balanceDue)}</span></label>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground">No open invoices — the payment will be kept as an advance.</p>}
              {selected.length ? <Button variant="link" size="sm" className="mt-1 h-auto p-0" onClick={() => setForm({ ...form, amount: String(selectedTotal) })}>Use selected total {formatCurrency(selectedTotal)}</Button> : null}
            </div>
          ) : null}
          <div className="space-y-1.5"><Label htmlFor="pay-amount">Amount *</Label><Input id="pay-amount" type="number" min={1} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Method *</Label><Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="pay-date">Received on</Label><Input id="pay-date" type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pay-ref">Reference</Label><Input id="pay-ref" placeholder="Cheque no., UTR, transaction id" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pay-payer">Payer name</Label><Input id="pay-payer" value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} placeholder="Defaults to the primary resident" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pay-notes">Notes</Label><Textarea id="pay-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={record.isPending} disabled={!form.unitId || !form.amount} onClick={submit}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
