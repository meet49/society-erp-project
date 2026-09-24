import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Archive, FlaskConical, Save } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBillingConfig, useChargeHeads, useCreateChargeHead, useDeactivateChargeHead, useFormulaTest, useMeterTypes, useSaveBillingConfig, useUpdateChargeHead } from '@/hooks/use-billing';
import { useBuildings } from '@/hooks/use-units';
import { useCategories } from '@/hooks/use-society';
import { formatCurrency, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const TYPES: { value: string; label: string; help: string }[] = [
  { value: 'FIXED', label: 'Fixed amount', help: 'Same amount for every applicable unit (e.g. sinking fund ₹500).' },
  { value: 'PER_UNIT', label: 'Per unit', help: 'Fixed amount per unit — identical to Fixed, kept for clarity in reports.' },
  { value: 'AREA_BASED', label: 'Per sq ft', help: 'Rate × unit area (sq ft). Units without an area are skipped.' },
  { value: 'METER_BASED', label: 'Metered', help: 'Fixed charge + rate × consumption from the latest unbilled meter reading.' },
  { value: 'FORMULA', label: 'Formula', help: 'Arithmetic over area, floor, bedrooms, consumption, amount, rate, units — e.g. max(500, area * 2.5).' },
  { value: 'PERCENTAGE', label: 'Percentage', help: 'Rate % of the sum of the other line items (e.g. non-occupancy charge for rented shops).' },
];

const blankHead = { name: '', code: '', description: '', type: 'FIXED', amount: '', rate: '', formula: '', meterType: '', taxRate: '0', ledgerAccountCode: '4100', fundKey: '', applicableUnitTypes: [] as string[], applicableBuildingIds: [] as string[], frequency: 'RECURRING', isActive: true, sortOrder: '0' };

function ChargeHeadDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: any | null }) {
  const create = useCreateChargeHead();
  const update = useUpdateChargeHead();
  const formulaTest = useFormulaTest();
  const buildings = useBuildings();
  const unitTypes = useCategories('UNIT_TYPE');
  const meterTypes = useMeterTypes();
  const [form, setForm] = React.useState<any>(blankHead);
  const [testResult, setTestResult] = React.useState<any>(null);
  React.useEffect(() => {
    if (!open) return;
    setTestResult(null);
    setForm(editing ? { ...blankHead, ...editing, amount: String(editing.amount ?? ''), rate: String(editing.rate ?? ''), taxRate: String(editing.taxRate ?? 0), sortOrder: String(editing.sortOrder ?? 0), formula: editing.formula ?? '', meterType: editing.meterType ?? '', fundKey: editing.fundKey ?? '', ledgerAccountCode: editing.ledgerAccountCode ?? '4100', applicableUnitTypes: editing.applicableUnitTypes ?? [], applicableBuildingIds: (editing.applicableBuildingIds ?? []).map(String) } : blankHead);
  }, [open, editing]);
  const type = TYPES.find((t) => t.value === form.type);
  const payload = { name: form.name, code: form.code, description: form.description || undefined, type: form.type, amount: Number(form.amount) || 0, rate: Number(form.rate) || 0, formula: form.formula || undefined, meterType: form.meterType || undefined, taxRate: Number(form.taxRate) || 0, ledgerAccountCode: form.ledgerAccountCode || undefined, fundKey: form.fundKey || undefined, applicableUnitTypes: form.applicableUnitTypes, applicableBuildingIds: form.applicableBuildingIds, frequency: form.frequency, isActive: form.isActive, sortOrder: Number(form.sortOrder) || 0 };
  const toggle = (key: 'applicableUnitTypes' | 'applicableBuildingIds', value: string) => setForm({ ...form, [key]: form[key].includes(value) ? form[key].filter((v: string) => v !== value) : [...form[key], value] });
  const submit = () => {
    const opts = { onSuccess: () => { toast.success(editing ? 'Charge head updated' : 'Charge head created'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (editing) update.mutate({ id: editing.id, ...payload }, opts);
    else create.mutate(payload, opts);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : 'New charge head'}</DialogTitle><DialogDescription>{type?.help}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ch-name">Name *</Label><Input id="ch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Maintenance charges" /></div>
          <div className="space-y-1.5"><Label htmlFor="ch-code">Code *</Label><Input id="ch-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MAINT" maxLength={20} /></div>
          <div className="space-y-1.5"><Label>Type *</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Frequency</Label><Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RECURRING">Recurring (every billing run)</SelectItem><SelectItem value="ONE_TIME">One-time (only when selected)</SelectItem></SelectContent></Select></div>
          {['FIXED', 'PER_UNIT', 'METER_BASED', 'FORMULA'].includes(form.type) ? <div className="space-y-1.5"><Label htmlFor="ch-amount">{form.type === 'METER_BASED' ? 'Fixed charge' : 'Amount'}{form.type === 'FORMULA' ? ' (variable “amount”)' : ''}</Label><Input id="ch-amount" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div> : null}
          {['AREA_BASED', 'METER_BASED', 'FORMULA', 'PERCENTAGE'].includes(form.type) ? <div className="space-y-1.5"><Label htmlFor="ch-rate">{form.type === 'AREA_BASED' ? 'Rate per sq ft' : form.type === 'METER_BASED' ? 'Rate per unit consumed' : form.type === 'PERCENTAGE' ? 'Percentage (%)' : 'Rate (variable “rate”)'}</Label><Input id="ch-rate" type="number" min={0} step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div> : null}
          {['METER_BASED', 'FORMULA'].includes(form.type) ? (
            <div className="space-y-1.5"><Label htmlFor="ch-meter">Meter type{form.type === 'METER_BASED' ? ' *' : ''}</Label><Input id="ch-meter" list="meter-types" value={form.meterType} onChange={(e) => setForm({ ...form, meterType: e.target.value.toUpperCase() })} placeholder="WATER, ELECTRICITY, GAS…" /><datalist id="meter-types">{(meterTypes.data ?? []).map((m) => <option key={m} value={m} />)}</datalist></div>
          ) : null}
          {form.type === 'FORMULA' ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-formula">Formula *</Label>
              <div className="flex gap-2"><Input id="ch-formula" value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} placeholder="max(500, area * 2.5) + floor * 10" /><Button type="button" variant="outline" loading={formulaTest.isPending} onClick={() => formulaTest.mutate({ formula: form.formula }, { onSuccess: setTestResult, onError: (e) => toast.error(getErrorMessage(e)) })}><FlaskConical /> Test</Button></div>
              <p className="text-xs text-muted-foreground">Variables: area, floor, bedrooms, consumption, amount, rate, units · functions: min, max, round, ceil, floor, abs.</p>
              {testResult ? <p className={`text-xs ${testResult.error ? 'text-destructive' : 'text-success'}`}>{testResult.error ? testResult.error : `With a 1000 sq ft, floor 1, 2-bedroom unit consuming 10 units → ${formatCurrency(testResult.result)}`}</p> : null}
            </div>
          ) : null}
          <div className="space-y-1.5"><Label htmlFor="ch-tax">Tax rate (%)</Label><Input id="ch-tax" type="number" min={0} max={100} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ch-ledger">Income ledger code</Label><Input id="ch-ledger" value={form.ledgerAccountCode} onChange={(e) => setForm({ ...form, ledgerAccountCode: e.target.value })} placeholder="4100" /></div>
          <div className="space-y-1.5"><Label htmlFor="ch-fund">Fund (optional)</Label><Input id="ch-fund" value={form.fundKey} onChange={(e) => setForm({ ...form, fundKey: e.target.value.toUpperCase() })} placeholder="SINKING, CORPUS…" /></div>
          <div className="space-y-1.5"><Label htmlFor="ch-sort">Sort order</Label><Input id="ch-sort" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Applies to unit types <span className="text-xs text-muted-foreground">(none = all)</span></Label><div className="flex flex-wrap gap-1.5">{(unitTypes.data ?? []).map((t: any) => <button type="button" key={t.key} onClick={() => toggle('applicableUnitTypes', t.key.toUpperCase())} className={`rounded-full border px-2.5 py-0.5 text-xs ${form.applicableUnitTypes.includes(t.key.toUpperCase()) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{t.label}</button>)}</div></div>
          {(buildings.data ?? []).length > 1 ? <div className="space-y-1.5 sm:col-span-2"><Label>Applies to buildings <span className="text-xs text-muted-foreground">(none = all)</span></Label><div className="flex flex-wrap gap-1.5">{(buildings.data ?? []).map((b: any) => <button type="button" key={b.id} onClick={() => toggle('applicableBuildingIds', b.id)} className={`rounded-full border px-2.5 py-0.5 text-xs ${form.applicableBuildingIds.includes(b.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{b.name}</button>)}</div></div> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ch-desc">Description</Label><Textarea id="ch-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending || update.isPending} disabled={!form.name || !form.code} onClick={submit}>{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigForm() {
  const config = useBillingConfig();
  const save = useSaveBillingConfig();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (config.data && !form) setForm({ ...config.data, penalty: { type: 'FLAT', value: 0, applyAfterDays: 0, maxAmount: null, ...(config.data.penalty ?? {}) }, reminderDaysBeforeDue: (config.data.reminderDaysBeforeDue ?? [3]).join(', '), reminderDaysAfterDue: (config.data.reminderDaysAfterDue ?? [7, 30]).join(', ') }); }, [config.data, form]);
  if (!form) return <PageSkeleton />;
  const days = (s: string) => String(s).split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0);
  const submit = () => save.mutate({ cycle: form.cycle, dueDay: Number(form.dueDay), gracePeriodDays: Number(form.gracePeriodDays), penalty: { type: form.penalty.type, value: Number(form.penalty.value) || 0, applyAfterDays: Number(form.penalty.applyAfterDays) || 0, maxAmount: form.penalty.maxAmount === '' || form.penalty.maxAmount == null ? null : Number(form.penalty.maxAmount) }, invoicePrefix: form.invoicePrefix, receiptPrefix: form.receiptPrefix, taxRate: Number(form.taxRate) || 0, taxLabel: form.taxLabel, roundOff: Boolean(form.roundOff), autoIssue: Boolean(form.autoIssue), notifyOnIssue: Boolean(form.notifyOnIssue), notes: form.notes || undefined, carryForwardBalance: Boolean(form.carryForwardBalance), reminderDaysBeforeDue: days(form.reminderDaysBeforeDue), reminderDaysAfterDue: days(form.reminderDaysAfterDue) }, { onSuccess: () => toast.success('Billing settings saved'), onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-sm">Cycle & due dates</CardTitle><CardDescription>How often you bill and when payment is expected.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Billing cycle</Label><Select value={form.cycle} onValueChange={(v) => setForm({ ...form, cycle: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'].map((c) => <SelectItem key={c} value={c}>{formatStatus(c)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-dueDay">Due day of month (1–28)</Label><Input id="cfg-dueDay" type="number" min={1} max={28} value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-grace">Grace period (days)</Label><Input id="cfg-grace" type="number" min={0} max={90} value={form.gracePeriodDays} onChange={(e) => setForm({ ...form, gracePeriodDays: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-before">Reminders before due (days)</Label><Input id="cfg-before" value={form.reminderDaysBeforeDue} onChange={(e) => setForm({ ...form, reminderDaysBeforeDue: e.target.value })} placeholder="3" /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-after">Reminders after due (days)</Label><Input id="cfg-after" value={form.reminderDaysAfterDue} onChange={(e) => setForm({ ...form, reminderDaysAfterDue: e.target.value })} placeholder="7, 30" /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.carryForwardBalance)} onCheckedChange={(v) => setForm({ ...form, carryForwardBalance: v })} /> Show previous balance on invoices</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Late payment penalty</CardTitle><CardDescription>Applied once when an invoice becomes overdue (after the grace period).</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Type</Label><Select value={form.penalty.type} onValueChange={(v) => setForm({ ...form, penalty: { ...form.penalty, type: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FLAT">Flat amount</SelectItem><SelectItem value="PERCENT">% of balance due</SelectItem><SelectItem value="INTEREST_PA">Interest % per annum (pro-rated by days)</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-pen-value">{form.penalty.type === 'FLAT' ? 'Amount' : 'Percent'}</Label><Input id="cfg-pen-value" type="number" min={0} step="0.01" value={form.penalty.value} onChange={(e) => setForm({ ...form, penalty: { ...form.penalty, value: e.target.value } })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-pen-after">Apply after (days overdue)</Label><Input id="cfg-pen-after" type="number" min={0} value={form.penalty.applyAfterDays} onChange={(e) => setForm({ ...form, penalty: { ...form.penalty, applyAfterDays: e.target.value } })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-pen-max">Maximum penalty (blank = none)</Label><Input id="cfg-pen-max" type="number" min={0} value={form.penalty.maxAmount ?? ''} onChange={(e) => setForm({ ...form, penalty: { ...form.penalty, maxAmount: e.target.value } })} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Numbering, tax & rounding</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="cfg-inv-prefix">Invoice prefix</Label><Input id="cfg-inv-prefix" value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value.toUpperCase() })} maxLength={10} /><p className="text-xs text-muted-foreground">Numbers reset every financial year: {form.invoicePrefix || 'INV'}/2025-26/00001</p></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-rcp-prefix">Receipt prefix</Label><Input id="cfg-rcp-prefix" value={form.receiptPrefix} onChange={(e) => setForm({ ...form, receiptPrefix: e.target.value.toUpperCase() })} maxLength={10} /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-tax-label">Tax label</Label><Input id="cfg-tax-label" value={form.taxLabel} onChange={(e) => setForm({ ...form, taxLabel: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cfg-tax">Default tax rate (%)</Label><Input id="cfg-tax" type="number" min={0} max={100} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.roundOff)} onCheckedChange={(v) => setForm({ ...form, roundOff: v })} /> Round invoice totals to the nearest rupee</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Issuing & notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.autoIssue)} onCheckedChange={(v) => setForm({ ...form, autoIssue: v })} /> Issue invoices immediately when a billing run is generated (skip the draft review)</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.notifyOnIssue)} onCheckedChange={(v) => setForm({ ...form, notifyOnIssue: v })} /> Notify residents when their invoice is issued (channels from Settings → Notifications)</label>
          <div className="space-y-1.5"><Label htmlFor="cfg-notes">Footer note printed on invoices</Label><Textarea id="cfg-notes" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </CardContent>
      </Card>
      <div className="lg:col-span-2"><Button loading={save.isPending} onClick={submit}><Save /> Save settings</Button></div>
    </div>
  );
}

export default function BillingSetupPage() {
  const heads = useChargeHeads(true);
  const deactivate = useDeactivateChargeHead();
  const update = useUpdateChargeHead();
  const { confirm, ConfirmElement } = useConfirm();
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Billing setup" description="Charge heads, billing cycle, penalties and numbering — all configurable without code." />
      <SubscriptionGate>
        <Tabs defaultValue="heads">
          <TabsList><TabsTrigger value="heads">Charge heads</TabsTrigger><TabsTrigger value="config">Cycle & rules</TabsTrigger></TabsList>
          <TabsContent value="heads" className="mt-4">
            <div className="mb-3 flex justify-end"><PermissionGate permission="billing:configure"><Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> New charge head</Button></PermissionGate></div>
            <DataTable
              rows={heads.data}
              loading={heads.isLoading}
              error={heads.error}
              onRetry={() => heads.refetch()}
              rowKey={(h: any) => h.id}
              emptyTitle="No charge heads yet"
              emptyDescription="Add Maintenance, Sinking fund, Water… each with its own calculation rule."
              columns={[
                { key: 'name', header: 'Charge head', cell: (h: any) => <span><span className="font-medium">{h.name}</span><span className="ml-2 text-xs text-muted-foreground">{h.code}</span>{!h.isActive ? <Badge variant="muted" className="ml-2">Inactive</Badge> : null}{h.frequency === 'ONE_TIME' ? <Badge variant="secondary" className="ml-2">One-time</Badge> : null}</span> },
                { key: 'type', header: 'Rule', cell: (h: any) => <span className="text-sm">{TYPES.find((t) => t.value === h.type)?.label}{h.type === 'FORMULA' ? <code className="ml-2 text-xs">{h.formula}</code> : null}{h.type === 'METER_BASED' ? <span className="ml-2 text-xs text-muted-foreground">{h.meterType}</span> : null}</span> },
                { key: 'amount', header: 'Amount / rate', className: 'text-right', headerClassName: 'text-right', cell: (h: any) => <span className="tabular">{['FIXED', 'PER_UNIT'].includes(h.type) ? formatCurrency(h.amount) : h.type === 'PERCENTAGE' ? `${h.rate}%` : h.type === 'METER_BASED' ? `${formatCurrency(h.amount)} + ${formatCurrency(h.rate)}/unit` : h.type === 'AREA_BASED' ? `${formatCurrency(h.rate)}/sq ft` : '—'}</span> },
                { key: 'tax', header: 'Tax', hideBelow: 'md', cell: (h: any) => (h.taxRate ? `${h.taxRate}%` : '—') },
                { key: 'scope', header: 'Applies to', hideBelow: 'lg', cell: (h: any) => (h.applicableUnitTypes?.length ? h.applicableUnitTypes.map(formatStatus).join(', ') : 'All units') },
                { key: 'actions', header: '', className: 'text-right', cell: (h: any) => (
                  <PermissionGate permission="billing:configure">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, editing: h })}><Pencil /> Edit</Button>
                      {h.isActive ? <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Deactivate ${h.name}?`, description: 'It will be excluded from future billing runs. Existing invoices are unchanged.', confirmLabel: 'Deactivate' })) deactivate.mutate(h.id, { onSuccess: () => toast.success('Charge head deactivated'), onError: (e) => toast.error(getErrorMessage(e)) }); }}><Archive /> Deactivate</Button> : <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: h.id, isActive: true }, { onSuccess: () => toast.success('Charge head reactivated') })}>Reactivate</Button>}
                    </div>
                  </PermissionGate>
                ) },
              ]}
            />
          </TabsContent>
          <TabsContent value="config" className="mt-4"><ConfigForm /></TabsContent>
        </Tabs>
      </SubscriptionGate>
      <ChargeHeadDialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })} editing={dialog.editing} />
    </div>
  );
}
