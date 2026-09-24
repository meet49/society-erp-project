import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Upload, Wand2, Link2, Unlink, EyeOff, Landmark, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { FilterSelect, FilterBar, SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAddBankTransaction, useAutoMatch, useBankAccounts, useBankTransactions, useCreateBankAccount, useIgnoreTransaction, useImportStatement, useMatchSuggestions, useMatchTransaction, useReconciliation, useUnmatchTransaction, useUpdateBankAccount } from '@/hooks/use-accounting';
import { cn, formatCurrency, formatDate, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const METHODS = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'ONLINE', 'CARD', 'NETBANKING', 'WALLET', 'OTHER'];
const blank = { name: '', kind: 'BANK', bankName: '', branch: '', accountNumber: '', ifsc: '', openingBalance: '0', openingBalanceDate: toInputDate(new Date()), isDefault: false, paymentMethods: [] as string[] };

function BankAccountDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: any | null }) {
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const [form, setForm] = React.useState<any>(blank);
  React.useEffect(() => { if (open) setForm(editing ? { ...blank, ...editing, accountNumber: '', paymentMethods: editing.paymentMethods ?? [] } : blank); }, [open, editing]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : 'New bank / cash account'}</DialogTitle><DialogDescription>A ledger account is created automatically. Only the last four digits of the account number are stored.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ba-name">Name *</Label><Input id="ba-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HDFC current account" /></div>
          <div className="space-y-1.5"><Label>Kind</Label><Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BANK">Bank</SelectItem><SelectItem value="CASH">Cash box</SelectItem><SelectItem value="WALLET">Wallet</SelectItem><SelectItem value="GATEWAY">Gateway settlement</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="ba-bank">Bank name</Label><Input id="ba-bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ba-number">Account number</Label><Input id="ba-number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder={editing?.accountNumberMasked ?? ''} /></div>
          <div className="space-y-1.5"><Label htmlFor="ba-ifsc">IFSC</Label><Input id="ba-ifsc" value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} /></div>
          {!editing ? <><div className="space-y-1.5"><Label htmlFor="ba-opening">Opening balance</Label><Input id="ba-opening" type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="ba-opening-date">As of</Label><Input id="ba-opening-date" type="date" value={form.openingBalanceDate} onChange={(e) => setForm({ ...form, openingBalanceDate: e.target.value })} /></div></> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label>Default for payment methods</Label><div className="flex flex-wrap gap-3 pt-1">{METHODS.map((m) => <label key={m} className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.paymentMethods.includes(m)} onCheckedChange={(c) => setForm({ ...form, paymentMethods: c ? [...form.paymentMethods, m] : form.paymentMethods.filter((x: string) => x !== m) })} />{formatStatus(m)}</label>)}</div></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} /> Default account</label>
          {editing ? <label className="flex items-center gap-2 text-sm"><Switch checked={form.isActive !== false} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /> Active</label> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending || update.isPending} disabled={!form.name} onClick={() => { const opts = { onSuccess: () => { toast.success('Bank account saved'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) }; const base = { name: form.name, kind: form.kind, bankName: form.bankName || undefined, branch: form.branch || undefined, accountNumber: form.accountNumber || undefined, ifsc: form.ifsc || undefined, isDefault: form.isDefault, paymentMethods: form.paymentMethods }; if (editing) update.mutate({ id: editing.id, ...base, isActive: form.isActive !== false }, opts); else create.mutate({ ...base, openingBalance: Number(form.openingBalance) || 0, openingBalanceDate: form.openingBalanceDate ? new Date(form.openingBalanceDate).toISOString() : undefined }, opts); }}>{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchSheet({ txn, onClose }: { txn: any | null; onClose: () => void }) {
  const suggestions = useMatchSuggestions(txn?.id ?? '');
  const match = useMatchTransaction();
  const unmatch = useUnmatchTransaction();
  const ignore = useIgnoreTransaction();
  if (!txn) return null;
  return (
    <Sheet open={Boolean(txn)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Statement line</SheetTitle><SheetDescription>{formatDate(txn.date)} · {txn.description}</SheetDescription></SheetHeader>
        <div className="mt-4 space-y-4">
          <KeyValue columns={2} items={[{ label: 'Amount', value: <span className={cn('tabular font-semibold', txn.type === 'CREDIT' ? 'text-success' : 'text-destructive')}>{txn.type === 'CREDIT' ? '+' : '−'}{formatCurrency(txn.amount)}</span> }, { label: 'Reference', value: txn.reference ?? '—' }, { label: 'Status', value: <StatusBadge status={txn.status} /> }, { label: 'Matched to', value: txn.matchedType ? `${txn.matchedType}` : '—' }]} />
          {txn.status === 'UNMATCHED' ? (
            <div>
              <p className="mb-2 text-sm font-medium">Suggested matches</p>
              <ul className="space-y-2">
                {(suggestions.data ?? []).map((sg: any) => (
                  <li key={sg.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span><span className="font-medium">{sg.label}</span><span className="block text-xs text-muted-foreground">{formatDate(sg.date)} · {formatCurrency(sg.amount)}{sg.reference ? ` · ${sg.reference}` : ''}{sg.score === 2 ? ' · reference match' : ''}</span></span><Button size="sm" loading={match.isPending} onClick={() => match.mutate({ id: txn.id, type: sg.type, targetId: sg.id }, { onSuccess: () => { toast.success('Matched'); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Link2 /> Match</Button></li>
                ))}
                {!suggestions.isLoading && !(suggestions.data ?? []).length ? <li className="text-sm text-muted-foreground">No payment or expense payment with this amount around this date. Record it first, then match, or ignore the line (bank charges, interest…).</li> : null}
              </ul>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => ignore.mutate({ id: txn.id }, { onSuccess: () => { toast.success('Line ignored'); onClose(); } })}><EyeOff /> Ignore line</Button>
            </div>
          ) : null}
          {txn.status === 'MATCHED' ? <Button variant="outline" size="sm" loading={unmatch.isPending} onClick={() => unmatch.mutate(txn.id, { onSuccess: () => { toast.success('Unmatched'); onClose(); } })}><Unlink /> Unmatch</Button> : null}
          {txn.status === 'IGNORED' ? <Button variant="outline" size="sm" onClick={() => ignore.mutate({ id: txn.id }, { onSuccess: () => { toast.success('Line restored'); onClose(); } })}>Restore line</Button> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function BankPage() {
  const banks = useBankAccounts();
  const [selected, setSelected] = React.useState('');
  React.useEffect(() => { if (!selected && banks.data?.length) setSelected((banks.data.find((b: any) => b.isDefault) ?? banks.data[0]).id); }, [banks.data, selected]);
  const recon = useReconciliation(selected);
  const list = useListState({ sort: '-date' });
  const txns = useBankTransactions({ ...list.params, bankAccountId: selected });
  const importStatement = useImportStatement();
  const autoMatch = useAutoMatch();
  const addTxn = useAddBankTransaction();
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [importing, setImporting] = React.useState(false);
  const [csv, setCsv] = React.useState('');
  const [importResult, setImportResult] = React.useState<any>(null);
  const [adding, setAdding] = React.useState(false);
  const [manual, setManual] = React.useState({ date: toInputDate(new Date()), description: '', reference: '', amount: '', type: 'CREDIT' });
  const [active, setActive] = React.useState<any | null>(null);
  const bank = (banks.data ?? []).find((b: any) => b.id === selected);
  const r = recon.data;
  return (
    <div>
      <PageHeader title="Bank & reconciliation" description="Import statements, match lines to receipts and vendor payments, and keep book balances in step with the bank." actions={<SubscriptionGate><PermissionGate permission="accounting:configure"><Button variant="outline" onClick={() => setDialog({ open: true, editing: null })}><Plus /> Bank account</Button></PermissionGate></SubscriptionGate>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(banks.data ?? []).map((b: any) => (
          <button key={b.id} type="button" onClick={() => setSelected(b.id)} className={cn('flex min-w-[220px] flex-col rounded-lg border p-3 text-left transition-colors', selected === b.id ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/50')}>
            <span className="flex items-center gap-2 text-sm font-medium"><Landmark className="h-4 w-4 text-muted-foreground" /> {b.name} {b.isDefault ? <Badge variant="secondary">Default</Badge> : null}{!b.isActive ? <Badge variant="muted">Inactive</Badge> : null}</span>
            <span className="mt-1 text-lg font-semibold tabular">{formatCurrency(b.ledgerBalance)}</span>
            <span className="text-xs text-muted-foreground">{formatStatus(b.kind)}{b.accountNumberMasked ? ` · ${b.accountNumberMasked}` : ''}{b.unmatchedCount ? ` · ${b.unmatchedCount} unmatched` : ''}</span>
          </button>
        ))}
      </div>
      {bank ? (
        <SubscriptionGate>
          <Card className="mb-4">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">{bank.name}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <PermissionGate permission="accounting:configure"><Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, editing: bank })}><Pencil /> Edit</Button></PermissionGate>
                <PermissionGate permission="accounting:reconcile">
                  <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus /> Add line</Button>
                  <Button variant="outline" size="sm" onClick={() => { setImportResult(null); setImporting(true); }}><Upload /> Import statement</Button>
                  <Button size="sm" loading={autoMatch.isPending} onClick={() => autoMatch.mutate(bank.id, { onSuccess: (res) => toast.success(`${res.matched} line(s) matched automatically`), onError: (e) => toast.error(getErrorMessage(e)) })}><Wand2 /> Auto-match</Button>
                </PermissionGate>
              </div>
            </CardHeader>
            <CardContent>
              <KeyValue columns={3} items={[{ label: 'Book balance', value: formatCurrency(r?.ledgerBalance ?? bank.ledgerBalance) }, { label: 'Last statement balance', value: r?.statementBalance != null ? formatCurrency(r.statementBalance) : '—' }, { label: 'Difference', value: r?.difference != null ? <span className={r.difference === 0 ? 'text-success' : 'text-warning-foreground dark:text-warning'}>{formatCurrency(r.difference)}</span> : '—' }, { label: 'Unmatched', value: r ? `${r.unmatched.credits.count} credits · ${r.unmatched.debits.count} debits` : '—' }, { label: 'Receipts awaiting reconciliation', value: r?.unreconciledPayments ?? '—' }, { label: 'Last reconciled', value: r?.lastReconciledAt ? formatDateTime(r.lastReconciledAt) : 'Never' }]} />
            </CardContent>
          </Card>
          <FilterBar onReset={list.reset}>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Narration or reference…" className="w-full sm:w-64" />
            <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['UNMATCHED', 'MATCHED', 'IGNORED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="All lines" />
            <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={[{ value: 'CREDIT', label: 'Credits (money in)' }, { value: 'DEBIT', label: 'Debits (money out)' }]} allLabel="Credits & debits" />
          </FilterBar>
          <DataTable
            rows={txns.data?.items}
            loading={txns.isFetching}
            error={txns.error}
            onRetry={() => txns.refetch()}
            rowKey={(t: any) => t.id}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={(t: any) => setActive(t)}
            emptyTitle="No statement lines"
            emptyDescription="Import a CSV statement from your bank to start reconciling."
            columns={[
              { key: 'date', header: 'Date', sortable: true, cell: (t: any) => formatDate(t.date) },
              { key: 'description', header: 'Narration', cell: (t: any) => <span className="line-clamp-1">{t.description || '—'}</span> },
              { key: 'reference', header: 'Reference', hideBelow: 'md', cell: (t: any) => t.reference ?? '' },
              { key: 'amount', header: 'Amount', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (t: any) => <span className={cn('tabular font-medium', t.type === 'CREDIT' ? 'text-success' : 'text-destructive')}>{t.type === 'CREDIT' ? '+' : '−'}{formatCurrency(t.amount)}</span> },
              { key: 'status', header: 'Status', sortable: true, cell: (t: any) => <StatusBadge status={t.status} /> },
            ]}
            pagination={txns.data ? { page: txns.data.page, pages: txns.data.pages, total: txns.data.total, limit: txns.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
          />
        </SubscriptionGate>
      ) : null}
      <BankAccountDialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })} editing={dialog.editing} />
      <MatchSheet txn={active} onClose={() => setActive(null)} />
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Import bank statement</DialogTitle><DialogDescription>CSV export from net banking. Columns like Date, Narration, Chq/Ref, Withdrawal, Deposit, Balance are detected automatically; duplicates are skipped.</DialogDescription></DialogHeader>
          <Input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} aria-label="Statement CSV" />
          <Textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" placeholder={'Date,Narration,Chq/Ref No,Withdrawal,Deposit,Balance\n01/04/2026,NEFT CR A-101,UTR123,,3500.00,152300.00'} aria-label="Statement contents" />
          {importResult ? <p className="text-sm">{importResult.imported} imported · {importResult.duplicates} duplicates · {importResult.autoMatched} auto-matched{importResult.errors?.length ? ` · ${importResult.errors.length} lines skipped` : ''}</p> : null}
          <DialogFooter><Button variant="outline" onClick={() => setImporting(false)}>Close</Button><Button loading={importStatement.isPending} disabled={!csv.trim()} onClick={() => importStatement.mutate({ id: bank.id, csv }, { onSuccess: (res) => { setImportResult(res); toast.success(`${res.imported} lines imported`); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Upload /> Import</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Add statement line</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label htmlFor="ml-date">Date</Label><Input id="ml-date" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ml-desc">Narration</Label><Input id="ml-desc" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ml-ref">Reference</Label><Input id="ml-ref" value={manual.reference} onChange={(e) => setManual({ ...manual, reference: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label htmlFor="ml-amount">Amount</Label><Input id="ml-amount" type="number" min={0} step="0.01" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} /></div><div className="space-y-1.5"><Label>Direction</Label><Select value={manual.type} onValueChange={(v) => setManual({ ...manual, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CREDIT">Credit (in)</SelectItem><SelectItem value="DEBIT">Debit (out)</SelectItem></SelectContent></Select></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button loading={addTxn.isPending} disabled={!manual.amount} onClick={() => addTxn.mutate({ id: bank.id, date: new Date(manual.date).toISOString(), description: manual.description || undefined, reference: manual.reference || undefined, amount: Number(manual.amount), type: manual.type }, { onSuccess: () => { toast.success('Line added'); setAdding(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
