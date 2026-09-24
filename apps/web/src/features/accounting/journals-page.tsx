import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, CheckCheck, Undo2, Trash2, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { useConfirm } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAccounts, useCreateJournal, useDeleteJournal, useJournal, useJournals, usePostJournal, useReverseJournal } from '@/hooks/use-accounting';
import { usePermissions } from '@/hooks/use-access';
import { formatCurrency, formatDate, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

type Line = { accountCode: string; debit: string; credit: string; description: string };
const blankLine = (): Line => ({ accountCode: '', debit: '', credit: '', description: '' });

/** Manual journal entry: N lines, must balance; can be saved as draft or posted directly. */
export function JournalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const create = useCreateJournal();
  const { can } = usePermissions();
  const [form, setForm] = React.useState({ date: toInputDate(new Date()), narration: '', post: false });
  const [lines, setLines] = React.useState<Line[]>([blankLine(), blankLine()]);
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
  const options = (accounts.data ?? []).map((a: any) => ({ value: a.code, label: `${a.code} · ${a.name}`, description: formatStatus(a.type) }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>New journal entry</DialogTitle><DialogDescription>Debits must equal credits. Use journals for adjustments, opening balances, bank charges, interest and anything not created automatically.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="jv-date">Date *</Label><Input id="jv-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="jv-narration">Narration *</Label><Input id="jv-narration" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} placeholder="e.g. Bank interest credited for Q1" /></div>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1.6fr_1.2fr_110px_110px_auto]">
              <Combobox value={l.accountCode} onChange={(v) => setLine(i, { accountCode: v ?? '' })} options={options} placeholder="Account" />
              <Input placeholder="Line description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label="Line description" />
              <Input type="number" min={0} step="0.01" placeholder="Debit" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} aria-label="Debit" />
              <Input type="number" min={0} step="0.01" placeholder="Credit" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} aria-label="Credit" />
              <Button type="button" variant="ghost" size="sm" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>Remove</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}><Plus /> Add line</Button>
            <p className={`text-sm tabular ${balanced ? 'text-success' : 'text-muted-foreground'}`}>Dr {formatCurrency(debit)} · Cr {formatCurrency(credit)}{!balanced && debit + credit > 0 ? ` · difference ${formatCurrency(Math.abs(debit - credit))}` : ''}</p>
          </div>
        </div>
        {can('accounting:post') ? <label className="flex items-center gap-2 text-sm"><Switch checked={form.post} onCheckedChange={(v) => setForm({ ...form, post: v })} /> Post immediately (otherwise saved as a draft for review)</label> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!balanced || form.narration.trim().length < 3 || lines.some((l) => !l.accountCode)} onClick={() => create.mutate({ date: new Date(form.date).toISOString(), narration: form.narration, post: form.post, lines: lines.map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || undefined })) }, { onSuccess: (j) => { toast.success(`${j.entryNumber} ${j.status === 'POSTED' ? 'posted' : 'saved as draft'}`); onOpenChange(false); setLines([blankLine(), blankLine()]); setForm({ date: toInputDate(new Date()), narration: '', post: false }); navigate(`/app/accounting/journals/${j.id}`); }, onError: (e) => toast.error(getErrorMessage(e)) })}>{form.post ? 'Post journal' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JournalDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const journal = useJournal(id);
  const post = usePostJournal();
  const reverse = useReverseJournal();
  const remove = useDeleteJournal();
  const { confirm, ConfirmElement } = useConfirm();
  const [reversing, setReversing] = React.useState(false);
  const [reason, setReason] = React.useState('');
  if (journal.isLoading) return <PageSkeleton />;
  if (journal.isError || !journal.data) return <ErrorState error={journal.error} onRetry={() => journal.refetch()} />;
  const j = journal.data;
  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title={<span className="flex items-center gap-2">{j.entryNumber} <StatusBadge status={j.status} /></span>}
        description={`${formatDate(j.date)} · ${formatStatus(j.source)}${j.refNumber ? ` · ref ${j.refNumber}` : ''}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/app/accounting/journals')}><ArrowLeft /> Journals</Button>
            <SubscriptionGate>
              {j.status === 'DRAFT' ? <PermissionGate permission="accounting:post"><Button loading={post.isPending} onClick={() => post.mutate(id, { onSuccess: () => toast.success('Journal posted'), onError: (e) => toast.error(getErrorMessage(e)) })}><CheckCheck /> Post</Button></PermissionGate> : null}
              {j.status === 'DRAFT' ? <PermissionGate permission="accounting:update"><Button variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(id, { onSuccess: () => { toast.success('Draft deleted'); navigate('/app/accounting/journals'); }, onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /> Delete</Button></PermissionGate> : null}
              {j.status === 'POSTED' ? <PermissionGate permission="accounting:reverse"><Button variant="outline" onClick={() => setReversing(true)}><Undo2 /> Reverse</Button></PermissionGate> : null}
            </SubscriptionGate>
          </>
        }
      />
      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4"><p className="font-medium">{j.narration}</p><KeyValue columns={3} className="mt-3" items={[{ label: 'Created by', value: j.createdBy?.name ?? 'System' }, { label: 'Posted', value: j.postedAt ? `${formatDateTime(j.postedAt)}${j.postedBy?.name ? ` by ${j.postedBy.name}` : ''}` : '—' }, { label: 'Reference', value: j.refType ? `${j.refType} ${j.refNumber ?? ''}` : '—' }]} /></div>
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead>Fund</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
            <TableBody>
              {j.lines.map((l: any) => <TableRow key={l._id ?? l.id}><TableCell><span className="font-medium">{l.accountCode}</span> {l.accountName}</TableCell><TableCell className="text-muted-foreground">{l.description ?? ''}</TableCell><TableCell>{l.fundKey ?? ''}</TableCell><TableCell className="text-right tabular">{l.debit ? formatCurrency(l.debit) : ''}</TableCell><TableCell className="text-right tabular">{l.credit ? formatCurrency(l.credit) : ''}</TableCell></TableRow>)}
              <TableRow className="font-semibold"><TableCell colSpan={3}>Total</TableCell><TableCell className="text-right tabular">{formatCurrency(j.totalDebit)}</TableCell><TableCell className="text-right tabular">{formatCurrency(j.totalCredit)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {j.reversedBy ? <p className="mt-3 text-sm text-muted-foreground">Reversed by <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/app/accounting/journals/${j.reversedBy}`)}>reversal entry</Button>.</p> : null}
      {j.reversalOf ? <p className="mt-3 text-sm text-muted-foreground">This entry reverses <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/app/accounting/journals/${j.reversalOf}`)}>an earlier journal</Button>.</p> : null}
      <Dialog open={reversing} onOpenChange={setReversing}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reverse {j.entryNumber}</DialogTitle><DialogDescription>A mirrored entry is posted today; the original stays in the books for audit.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="rev-reason">Reason *</Label><Textarea id="rev-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setReversing(false)}>Cancel</Button><Button variant="destructive" loading={reverse.isPending} disabled={reason.trim().length < 2} onClick={() => reverse.mutate({ id, reason }, { onSuccess: (r) => { toast.success(`Reversed with ${r.entryNumber}`); setReversing(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Reverse</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function JournalsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: '-date' });
  const journals = useJournals(list.params);
  const [creating, setCreating] = React.useState(false);
  if (id) return <JournalDetail id={id} />;
  return (
    <div>
      <PageHeader title="Journals" description="Every posting in the books: automatic entries from billing, payments and expenses, plus manual adjustments." actions={<SubscriptionGate><PermissionGate permission="accounting:create"><Button onClick={() => setCreating(true)}><Plus /> New journal</Button></PermissionGate></SubscriptionGate>} />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Entry no., narration, reference…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['DRAFT', 'POSTED', 'REVERSED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.source ?? ''} onChange={(v) => list.setFilter('source', v)} options={['MANUAL', 'INVOICE', 'PAYMENT', 'REFUND', 'EXPENSE', 'EXPENSE_PAYMENT', 'BANK', 'OPENING', 'ADJUSTMENT'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any source" />
      </FilterBar>
      <DataTable
        rows={journals.data?.items}
        loading={journals.isFetching}
        error={journals.error}
        onRetry={() => journals.refetch()}
        rowKey={(j: any) => j.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(j: any) => navigate(`/app/accounting/journals/${j.id}`)}
        emptyTitle="No journal entries yet"
        emptyDescription="Entries appear automatically when invoices are issued and payments are recorded."
        columns={[
          { key: 'date', header: 'Date', sortable: true, cell: (j: any) => formatDate(j.date) },
          { key: 'entryNumber', header: 'Entry', sortable: true, cell: (j: any) => <span className="font-medium">{j.entryNumber}</span> },
          { key: 'narration', header: 'Narration', cell: (j: any) => <span className="line-clamp-1">{j.narration}</span> },
          { key: 'source', header: 'Source', hideBelow: 'md', cell: (j: any) => formatStatus(j.source) },
          { key: 'totalDebit', header: 'Amount', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (j: any) => <span className="tabular">{formatCurrency(j.totalDebit)}</span> },
          { key: 'status', header: 'Status', sortable: true, cell: (j: any) => <StatusBadge status={j.status} /> },
        ]}
        pagination={journals.data ? { page: journals.data.page, pages: journals.data.pages, total: journals.data.total, limit: journals.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <JournalDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
