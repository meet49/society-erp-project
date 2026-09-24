import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, FileSignature, CalendarClock, IndianRupee, Wrench, Download, Pencil, Trash2, RefreshCw, Ban, CheckCircle2, ClipboardCheck, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { KeyValue } from '@/components/common/key-value';
import { Combobox } from '@/components/common/combobox';
import { CardSkeleton } from '@/components/common/loading-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { FileUpload } from '@/components/common/file-upload';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useActivateContract, useAssetOptions, useAssetsRealtime, useContract, useContractSettings, useContractStats, useContracts, useCreateContract, useDeleteContract, useExportContracts, useLogContractVisit, useRecordContractPayment, useRenewContract, useSaveContractSettings, useTerminateContract, useUpdateContract } from '@/hooks/use-assets';
import { useVendorOptions } from '@/hooks/use-expenses';
import { uploadFile } from '@/hooks/use-documents';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatCurrency, formatDate, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const TYPES = ['AMC', 'SERVICE', 'SUPPLY', 'LEASE', 'INSURANCE', 'OTHER'];
const CYCLES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'];
const blank = { title: '', type: 'AMC', vendorId: '', startDate: '', endDate: '', value: '', billingCycle: 'ANNUAL', amountPerCycle: '', autoRenew: false, noticePeriodDays: '', visitFrequencyMonths: '', assetIds: [] as string[], scope: '', contactName: '', contactPhone: '', notes: '', activate: true };

function daysTone(d: number | null) { return d == null ? '' : d < 0 ? 'text-destructive' : d <= 30 ? 'text-warning-foreground dark:text-warning' : ''; }

function ContractDialog({ open, onOpenChange, contract }: { open: boolean; onOpenChange: (o: boolean) => void; contract?: any | null }) {
  const vendors = useVendorOptions(open);
  const assets = useAssetOptions(open);
  const create = useCreateContract();
  const update = useUpdateContract();
  const [form, setForm] = React.useState(blank);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setFiles([]);
    setForm(contract ? { ...blank, title: contract.title, type: contract.type, vendorId: contract.vendorId?.id ?? '', startDate: toInputDate(contract.startDate), endDate: toInputDate(contract.endDate), value: String(contract.value ?? ''), billingCycle: contract.billingCycle, amountPerCycle: contract.amountPerCycle ? String(contract.amountPerCycle) : '', autoRenew: Boolean(contract.autoRenew), noticePeriodDays: String(contract.noticePeriodDays ?? ''), visitFrequencyMonths: contract.visitFrequencyMonths ? String(contract.visitFrequencyMonths) : '', assetIds: (contract.assetIds ?? []).map((a: any) => a.id ?? a), scope: contract.scope ?? '', contactName: contract.contact?.name ?? '', contactPhone: contract.contact?.phone ?? '', notes: contract.notes ?? '', activate: false } : blank);
  }, [open, contract]);
  const submit = async () => {
    setBusy(true);
    try {
      const documents = [];
      for (const f of files) { const stored = await uploadFile(f, 'contracts'); documents.push({ storageKey: stored.storageKey, name: stored.name, mimeType: stored.mimeType, size: stored.size }); }
      const payload: any = { title: form.title, type: form.type, vendorId: form.vendorId, startDate: form.startDate, endDate: form.endDate, value: Number(form.value) || 0, billingCycle: form.billingCycle, amountPerCycle: form.amountPerCycle ? Number(form.amountPerCycle) : undefined, autoRenew: form.autoRenew, noticePeriodDays: form.noticePeriodDays ? Number(form.noticePeriodDays) : undefined, visitFrequencyMonths: form.visitFrequencyMonths ? Number(form.visitFrequencyMonths) : 0, assetIds: form.assetIds, scope: form.scope || undefined, contact: form.contactName || form.contactPhone ? { name: form.contactName || undefined, phone: form.contactPhone || undefined } : undefined, notes: form.notes || undefined };
      if (documents.length) payload.documents = contract ? [...(contract.documents ?? []).map((d: any) => ({ storageKey: d.storageKey, name: d.name, mimeType: d.mimeType, size: d.size })), ...documents] : documents;
      if (contract) await update.mutateAsync({ id: contract.id, ...payload }); else await create.mutateAsync({ ...payload, activate: form.activate });
      toast.success(contract ? 'Contract updated' : form.activate ? 'Contract created and active' : 'Draft contract saved');
      onOpenChange(false);
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{contract ? `Edit ${contract.contractNumber}` : 'New contract / AMC'}</DialogTitle><DialogDescription>Reminders go out before the end date; AMC visits are tracked against the covered assets.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ct-title">Title *</Label><Input id="ct-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lift AMC (comprehensive)" /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-type">Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger id="ct-type"><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Vendor *</Label><Combobox value={form.vendorId} onChange={(v) => setForm({ ...form, vendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name, description: v.categoryKey }))} placeholder="Choose vendor" /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-start">Start *</Label><Input id="ct-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-end">End *</Label><Input id="ct-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-value">Contract value (₹)</Label><Input id="ct-value" type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-cycle">Billing</Label><Select value={form.billingCycle} onValueChange={(v) => setForm({ ...form, billingCycle: v })}><SelectTrigger id="ct-cycle"><SelectValue /></SelectTrigger><SelectContent>{CYCLES.map((c) => <SelectItem key={c} value={c}>{formatStatus(c)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="ct-percycle">Amount per cycle (₹)</Label><Input id="ct-percycle" type="number" min={0} value={form.amountPerCycle} onChange={(e) => setForm({ ...form, amountPerCycle: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-notice">Notice period (days)</Label><Input id="ct-notice" type="number" min={0} value={form.noticePeriodDays} onChange={(e) => setForm({ ...form, noticePeriodDays: e.target.value })} placeholder="30" /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-visits">Service visit every (months, 0 = none)</Label><Input id="ct-visits" type="number" min={0} value={form.visitFrequencyMonths} onChange={(e) => setForm({ ...form, visitFrequencyMonths: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="flex items-center gap-2 pt-6"><Switch checked={form.autoRenew} onCheckedChange={(v) => setForm({ ...form, autoRenew: v })} /> Auto-renews unless cancelled</Label></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label>Covered assets</Label><div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">{(assets.data ?? []).map((a: any) => <label key={a.value} className="flex items-center gap-2 text-sm"><Checkbox checked={form.assetIds.includes(a.value)} onCheckedChange={(c) => setForm({ ...form, assetIds: c ? [...form.assetIds, a.value] : form.assetIds.filter((x) => x !== a.value) })} /> {a.label}</label>)}{!(assets.data ?? []).length ? <p className="text-xs text-muted-foreground">No assets registered yet.</p> : null}</div></div>
          <div className="space-y-1.5"><Label htmlFor="ct-cname">Vendor contact</Label><Input id="ct-cname" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Name" /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-cphone">Contact phone</Label><Input id="ct-cphone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="ct-scope">Scope of work</Label><Textarea id="ct-scope" rows={2} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><FileUpload value={files} onChange={setFiles} multiple accept=".pdf,.png,.jpg,.jpeg,.docx" label="Attach the signed contract or quotation" /></div>
          {!contract ? <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3"><Checkbox checked={form.activate} onCheckedChange={(c) => setForm({ ...form, activate: Boolean(c) })} /> Activate immediately (otherwise saved as a draft)</label> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} disabled={form.title.trim().length < 2 || !form.vendorId || !form.startDate || !form.endDate} onClick={submit}>{contract ? 'Save' : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContractSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (c: any) => void }) {
  const contract = useContract(id ?? '');
  const { can } = usePermissions();
  const activate = useActivateContract();
  const renew = useRenewContract();
  const terminate = useTerminateContract();
  const visit = useLogContractVisit();
  const payment = useRecordContractPayment();
  const remove = useDeleteContract();
  const { confirm, ConfirmElement } = useConfirm();
  const [mode, setMode] = React.useState<'renew' | 'terminate' | 'visit' | 'payment' | null>(null);
  const [form, setForm] = React.useState<any>({});
  React.useEffect(() => { setMode(null); setForm({}); }, [id]);
  const c = contract.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        {!c ? <CardSkeleton count={2} /> : <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{c.contractNumber}</span><StatusBadge status={c.status} /><Badge variant="outline">{formatStatus(c.type)}</Badge></SheetTitle><SheetDescription className="text-base font-medium text-foreground">{c.title}</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-5">
            <KeyValue columns={2} items={[
              { label: 'Vendor', value: <span>{c.vendorName ?? c.vendorId?.name}{c.contact?.name || c.contact?.phone ? <span className="block text-xs text-muted-foreground">{[c.contact?.name, c.contact?.phone].filter(Boolean).join(' · ')}</span> : null}</span> },
              { label: 'Period', value: <span>{formatDate(c.startDate)} – {formatDate(c.endDate)}{c.daysRemaining != null ? <span className={cn('block text-xs', daysTone(c.daysRemaining))}>{c.daysRemaining < 0 ? `${-c.daysRemaining} days overdue` : `${c.daysRemaining} days left`}</span> : null}</span> },
              { label: 'Value', value: `${formatCurrency(c.value)} · ${formatStatus(c.billingCycle)}${c.amountPerCycle ? ` (${formatCurrency(c.amountPerCycle)} per cycle)` : ''}` },
              { label: 'Terms', value: `${c.paymentTermsDays} days payment · ${c.noticePeriodDays} days notice${c.autoRenew ? ' · auto-renews' : ''}` },
              { label: 'Billed / paid', value: `${formatCurrency(c.payments?.billed ?? 0)} / ${formatCurrency(c.payments?.paid ?? 0)}` },
              { label: 'Service visits', value: c.visitFrequencyMonths ? `Every ${c.visitFrequencyMonths} month${c.visitFrequencyMonths > 1 ? 's' : ''} · next ${c.nextVisitDue ? formatDate(c.nextVisitDue) : '—'}${c.visitOverdue ? ' (overdue)' : ''}` : 'Not scheduled' },
              ...(c.assetIds?.length ? [{ label: 'Covered assets', value: c.assetIds.map((a: any) => `${a.name} (${a.assetCode})`).join(', '), span: 2 }] : []),
              ...(c.scope ? [{ label: 'Scope', value: <span className="whitespace-pre-wrap">{c.scope}</span>, span: 2 }] : []),
              ...(c.renewedFromId ? [{ label: 'Renewed from', value: c.renewedFromId.contractNumber }] : []),
              ...(c.renewedToId ? [{ label: 'Renewed as', value: `${c.renewedToId.contractNumber} (until ${formatDate(c.renewedToId.endDate)})` }] : []),
              ...(c.terminatedAt ? [{ label: 'Terminated', value: `${formatDate(c.terminatedAt)} · ${c.terminationReason}`, span: 2 }] : []),
            ]} />
            {c.documents?.length ? <ul className="flex flex-wrap gap-2">{c.documents.map((d: any) => <li key={d.id || d.storageKey}><Button asChild size="sm" variant="outline"><a href={d.url ?? '#'} target="_blank" rel="noreferrer">{d.name}</a></Button></li>)}</ul> : null}
            {!mode ? (
              <div className="flex flex-wrap gap-2">
                {c.status === 'DRAFT' && can('contracts:update') ? <Button size="sm" loading={activate.isPending} onClick={() => activate.mutate(c.id, { onSuccess: () => toast.success('Contract is active'), onError: err })}><CheckCircle2 /> Activate</Button> : null}
                {['ACTIVE', 'EXPIRED'].includes(c.status) && can('contracts:renew') ? <Button size="sm" onClick={() => { setForm({ endDate: '', value: String(c.value ?? ''), amountPerCycle: String(c.amountPerCycle ?? '') }); setMode('renew'); }}><RefreshCw /> Renew</Button> : null}
                {c.status === 'ACTIVE' && c.visitFrequencyMonths > 0 && can('contracts:update') ? <Button size="sm" variant="outline" onClick={() => { setForm({ note: '' }); setMode('visit'); }}><ClipboardCheck /> Log visit</Button> : null}
                {['ACTIVE', 'EXPIRED', 'RENEWED'].includes(c.status) && can('contracts:update') ? <Button size="sm" variant="outline" onClick={() => { setForm({ amount: String(c.amountPerCycle || ''), billNumber: '', submit: true }); setMode('payment'); }}><Receipt /> Record bill</Button> : null}
                {['DRAFT', 'ACTIVE', 'EXPIRED'].includes(c.status) && can('contracts:update') ? <Button size="sm" variant="ghost" onClick={() => onEdit(c)}><Pencil /> Edit</Button> : null}
                {['ACTIVE', 'DRAFT', 'EXPIRED'].includes(c.status) && can('contracts:update') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setForm({ reason: '' }); setMode('terminate'); }}><Ban /> Terminate</Button> : null}
                {c.status === 'DRAFT' && can('contracts:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(c.id, { onSuccess: () => { toast.success('Deleted'); onClose(); }, onError: err }); }}><Trash2 /></Button> : null}
              </div>
            ) : null}
            {mode === 'renew' ? <div className="space-y-2 rounded-md border p-3"><p className="text-sm font-medium">Renew · new term starts the day after {formatDate(c.endDate)}</p><div className="grid gap-2 sm:grid-cols-3"><div className="space-y-1"><Label htmlFor="rn-end">New end date *</Label><Input id="rn-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="rn-value">Value (₹)</Label><Input id="rn-value" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="rn-cycle">Per cycle (₹)</Label><Input id="rn-cycle" type="number" value={form.amountPerCycle} onChange={(e) => setForm({ ...form, amountPerCycle: e.target.value })} /></div></div><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" loading={renew.isPending} disabled={!form.endDate} onClick={() => renew.mutate({ id: c.id, endDate: form.endDate, value: form.value ? Number(form.value) : undefined, amountPerCycle: form.amountPerCycle ? Number(form.amountPerCycle) : undefined }, { onSuccess: () => { toast.success('Renewed'); setMode(null); }, onError: err })}>Renew</Button></div></div> : null}
            {mode === 'terminate' ? <div className="space-y-2 rounded-md border border-destructive/40 p-3"><Label htmlFor="tm-reason">Reason *</Label><Input id="tm-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" variant="destructive" loading={terminate.isPending} disabled={(form.reason ?? '').trim().length < 2} onClick={() => terminate.mutate({ id: c.id, reason: form.reason }, { onSuccess: () => { toast.success('Terminated'); setMode(null); }, onError: err })}>Terminate</Button></div></div> : null}
            {mode === 'visit' ? <div className="space-y-2 rounded-md border p-3"><Label htmlFor="vs-note">What was done</Label><Textarea id="vs-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /><p className="text-xs text-muted-foreground">Logged on every covered asset as an AMC visit.</p><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" loading={visit.isPending} onClick={() => visit.mutate({ id: c.id, note: form.note || undefined }, { onSuccess: () => { toast.success('Visit logged'); setMode(null); }, onError: err })}>Log visit</Button></div></div> : null}
            {mode === 'payment' ? <div className="space-y-2 rounded-md border p-3"><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="py-amt">Bill amount (₹) *</Label><Input id="py-amt" type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="py-no">Bill number</Label><Input id="py-no" value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} /></div></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.submit} onCheckedChange={(v) => setForm({ ...form, submit: Boolean(v) })} /> Submit for approval right away</label><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" loading={payment.isPending} disabled={!(Number(form.amount) > 0)} onClick={() => payment.mutate({ id: c.id, amount: Number(form.amount), billNumber: form.billNumber || undefined, submit: form.submit }, { onSuccess: (e) => { toast.success(`Expense ${e.expenseNumber} created`); setMode(null); }, onError: err })}>Create expense</Button></div></div> : null}
            {c.payments?.items?.length ? <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Bills</h3><ul className="divide-y rounded-md border text-sm">{c.payments.items.map((p: any) => <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5"><Link to={`/app/expenses/${p.id}`} className="underline-offset-2 hover:underline">{p.expenseNumber} · {formatDate(p.billDate)}</Link><span className="flex items-center gap-2">{formatCurrency(p.total)}<StatusBadge status={p.paymentStatus === 'PAID' ? 'PAID' : p.approvalStatus} /></span></li>)}</ul></div> : null}
            {c.visits?.length ? <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Service visits</h3><ol className="space-y-1 border-l pl-3 text-sm">{[...c.visits].reverse().map((v: any) => <li key={v.id ?? v.at}><span className="font-medium">{formatDateTime(v.at)}</span><span className="text-xs text-muted-foreground"> · {v.byUserId?.name ?? ''}</span>{v.note ? <p className="text-muted-foreground">{v.note}</p> : null}</li>)}</ol></div> : null}
          </div>
        </>}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}

function SettingsPanel() {
  const settings = useContractSettings();
  const save = useSaveContractSettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (settings.data && !form) setForm({ ...settings.data, reminderDaysText: (settings.data.reminderDays ?? []).join(', ') }); }, [settings.data, form]);
  if (!form) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3 text-sm">
      <div className="space-y-1"><Label htmlFor="cs-days">Remind before expiry (days, comma separated)</Label><Input id="cs-days" className="w-56" value={form.reminderDaysText} onChange={(e) => setForm({ ...form, reminderDaysText: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="cs-visit">Visit reminder (days ahead)</Label><Input id="cs-visit" type="number" min={0} className="w-32" value={form.visitReminderDays} onChange={(e) => setForm({ ...form, visitReminderDays: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label htmlFor="cs-notice">Default notice period (days)</Label><Input id="cs-notice" type="number" min={0} className="w-32" value={form.defaultNoticePeriodDays} onChange={(e) => setForm({ ...form, defaultNoticePeriodDays: Number(e.target.value) })} /></div>
      <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ reminderDays: String(form.reminderDaysText).split(',').map((x: string) => Number(x.trim())).filter((n: number) => Number.isInteger(n) && n >= 0), visitReminderDays: form.visitReminderDays, defaultNoticePeriodDays: form.defaultNoticePeriodDays }, { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save rules</Button>
    </div>
  );
}

/** Contracts & AMC register with expiry radar. */
export default function ContractsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const stats = useContractStats();
  const list = useListState({ limit: 25, sort: 'endDate', filters: { expiringWithinDays: params.get('expiringWithinDays') ?? '', status: params.get('status') ?? '' } });
  const contracts = useContracts(list.params);
  const exportRows = useExportContracts();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [showRules, setShowRules] = React.useState(false);
  useAssetsRealtime();
  const selected = params.get('contract');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Contracts & AMC" description="Vendor agreements with renewal reminders, service visits and bills." actions={<span className="flex gap-2">{can('contracts:update') ? <Button variant="outline" onClick={() => setShowRules((v) => !v)}>Rules</Button> : null}<PermissionGate permission="contracts:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> New contract</Button></SubscriptionGate></PermissionGate></span>} />
      <StatGrid className="mb-6">
        <StatCard label="Active contracts" value={stats.data?.active ?? 0} hint={`${stats.data?.draft ?? 0} draft · ${stats.data?.expired ?? 0} expired`} icon={<FileSignature />} loading={stats.isLoading} />
        <StatCard label="Expiring in 30 days" value={stats.data?.expiring30 ?? 0} hint={`${stats.data?.expiring90 ?? 0} within 90 days`} icon={<CalendarClock />} tone={(stats.data?.expiring30 ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Annual commitment" value={formatCurrency(stats.data?.activeValue ?? 0, 'INR', { compact: true })} icon={<IndianRupee />} loading={stats.isLoading} />
        <StatCard label="AMC visits overdue" value={stats.data?.visitsOverdue ?? 0} icon={<Wrench />} tone={(stats.data?.visitsOverdue ?? 0) > 0 ? 'destructive' : 'default'} loading={stats.isLoading} />
      </StatGrid>
      {showRules ? <div className="mb-4"><SettingsPanel /></div> : null}
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Title, vendor, number…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={TYPES.map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="All types" />
        <FilterSelect value={list.filters.expiringWithinDays ?? ''} onChange={(v) => list.setFilter('expiringWithinDays', v)} options={[{ value: '30', label: 'Expiring in 30 days' }, { value: '90', label: 'Expiring in 90 days' }]} allLabel="Any expiry" />
        <span className="flex-1" />
        <Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button>
      </FilterBar>
      <DataTable
        rows={contracts.data?.items}
        loading={contracts.isFetching}
        error={contracts.error}
        onRetry={() => contracts.refetch()}
        rowKey={(c: any) => c.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(c: any) => setParam('contract', c.id)}
        emptyTitle="No contracts yet"
        emptyDescription="Add AMCs and service agreements so renewals never slip."
        columns={[
          { key: 'title', header: 'Contract', sortable: true, cell: (c: any) => <span><span className="font-medium">{c.title}</span><span className="block text-xs text-muted-foreground">{c.contractNumber} · {formatStatus(c.type)} · {c.vendorName ?? c.vendorId?.name}</span></span> },
          { key: 'endDate', header: 'Ends', sortable: true, cell: (c: any) => <span>{formatDate(c.endDate)}{c.daysRemaining != null ? <span className={cn('block text-xs', daysTone(c.daysRemaining))}>{c.daysRemaining < 0 ? 'overdue' : `${c.daysRemaining} days`}</span> : null}</span> },
          { key: 'value', header: 'Value', sortable: true, hideBelow: 'md', cell: (c: any) => <span>{formatCurrency(c.value)}<span className="block text-xs text-muted-foreground">{formatStatus(c.billingCycle)}</span></span> },
          { key: 'visits', header: 'Next visit', hideBelow: 'lg', cell: (c: any) => c.nextVisitDue ? <span className={cn(c.visitOverdue && 'text-destructive')}>{formatDate(c.nextVisitDue)}</span> : <span className="text-muted-foreground">—</span> },
          { key: 'status', header: 'Status', sortable: true, cell: (c: any) => <StatusBadge status={c.status} /> },
        ]}
        pagination={contracts.data ? { page: contracts.data.page, pages: contracts.data.pages, total: contracts.data.total, limit: contracts.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <ContractDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} contract={editing === 'new' ? null : editing} />
      <ContractSheet id={selected} onClose={() => setParam('contract', null)} onEdit={(c) => setEditing(c)} />
    </div>
  );
}
