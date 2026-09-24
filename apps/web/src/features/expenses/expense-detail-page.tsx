import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Send, Undo2, CheckCheck, Ban, Wallet, Pencil, Trash2 } from 'lucide-react';
import { PaymentMethods } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDeleteExpense, useExpense, useExpenseAction, usePayExpense } from '@/hooks/use-expenses';
import { useBankAccounts } from '@/hooks/use-accounting';
import { useAccessibleModules } from '@/hooks/use-access';
import { ExpenseDialog } from '@/features/expenses/expenses-page';
import { formatCurrency, formatDate, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Approval trail rendered from the workflow instance attached to an entity. */
export function WorkflowTrail({ workflow }: { workflow: any | null }) {
  if (!workflow) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Approval trail <StatusBadge status={workflow.status} className="ml-2" /></CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {workflow.steps.map((s: any, i: number) => (
            <li key={s.order} className="flex gap-3 text-sm">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s.status === 'APPROVED' ? 'bg-success/15 text-success' : s.status === 'REJECTED' ? 'bg-destructive/15 text-destructive' : s.status === 'SKIPPED' ? 'bg-muted text-muted-foreground' : i === workflow.currentStep && workflow.status === 'PENDING' ? 'bg-warning/20 text-warning-foreground dark:text-warning' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name} <span className="text-xs font-normal text-muted-foreground">· {s.approverType === 'ROLE' ? `role ${formatStatus(s.approverRef)}` : s.approverType === 'PERMISSION' ? `anyone with ${s.approverRef}` : 'specific user'}{s.requiredApprovals > 1 ? ` · ${s.requiredApprovals} approvals` : ''}</span></p>
                {s.decisions?.length ? <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{s.decisions.map((d: any, j: number) => <li key={j}>{d.userId?.name ?? 'Approver'} {d.decision.toLowerCase()} · {formatDateTime(d.at)}{d.note ? ` · “${d.note}”` : ''}</li>)}</ul> : <p className="text-xs text-muted-foreground">{s.status === 'SKIPPED' ? 'Skipped (condition not met)' : s.status === 'PENDING' ? (i === workflow.currentStep ? 'Waiting for decision' : 'Queued') : formatStatus(s.status)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const expense = useExpense(id);
  const action = useExpenseAction();
  const pay = usePayExpense();
  const remove = useDeleteExpense();
  const { hasModule } = useAccessibleModules();
  const banks = useBankAccounts(hasModule('accounting'));
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [paying, setPaying] = React.useState(false);
  const [payForm, setPayForm] = React.useState({ amount: '', date: toInputDate(new Date()), method: 'BANK_TRANSFER', reference: '', bankAccountId: '', notes: '' });
  if (expense.isLoading) return <PageSkeleton />;
  if (expense.isError || !expense.data) return <ErrorState error={expense.error} onRetry={() => expense.refetch()} />;
  const e = expense.data;
  const outstanding = Math.max(0, e.total - (e.paidAmount ?? 0));
  const run = (act: 'submit' | 'withdraw' | 'approve' | 'reject', body: Record<string, unknown> = {}, msg = 'Done') => action.mutate({ id, action: act, ...body } as any, { onSuccess: () => { toast.success(msg); setRejecting(false); }, onError: (err) => toast.error(getErrorMessage(err)) });
  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title={<span className="flex items-center gap-2">{e.expenseNumber} <StatusBadge status={e.approvalStatus} /> <StatusBadge status={e.paymentStatus} /></span>}
        description={`${e.title}${e.vendorName ? ` · ${e.vendorName}` : ''}${e.categoryKey ? ` · ${formatStatus(e.categoryKey)}` : ''}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/app/expenses')}><ArrowLeft /> Expenses</Button>
            <SubscriptionGate>
              {['DRAFT', 'REJECTED'].includes(e.approvalStatus) ? <PermissionGate permission={['expenses:update', 'expenses:create']}><Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button></PermissionGate> : null}
              {['DRAFT', 'REJECTED'].includes(e.approvalStatus) ? <PermissionGate permission="expenses:submit"><Button loading={action.isPending} onClick={() => run('submit', {}, 'Submitted for approval')}><Send /> Submit</Button></PermissionGate> : null}
              {e.approvalStatus === 'PENDING' ? <PermissionGate permission={['expenses:submit', 'expenses:update']}><Button variant="outline" loading={action.isPending} onClick={() => run('withdraw', {}, 'Withdrawn')}><Undo2 /> Withdraw</Button></PermissionGate> : null}
              {e.approvalStatus === 'PENDING' ? <PermissionGate permission="expenses:approve"><Button loading={action.isPending} onClick={() => run('approve', {}, 'Approved')}><CheckCheck /> Approve</Button><Button variant="ghost" className="text-destructive" onClick={() => setRejecting(true)}><Ban /> Reject</Button></PermissionGate> : null}
              {e.approvalStatus === 'APPROVED' && outstanding > 0 ? <PermissionGate permission="expenses:pay"><Button onClick={() => { setPayForm({ ...payForm, amount: String(outstanding) }); setPaying(true); }}><Wallet /> Record payment</Button></PermissionGate> : null}
              {e.approvalStatus !== 'APPROVED' && !e.paidAmount ? <PermissionGate permission="expenses:delete"><Button variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete ${e.expenseNumber}?`, destructive: true, confirmLabel: 'Delete' })) remove.mutate(id, { onSuccess: () => { toast.success('Expense deleted'); navigate('/app/expenses'); }, onError: (err) => toast.error(getErrorMessage(err)) }); }}><Trash2 /></Button></PermissionGate> : null}
            </SubscriptionGate>
          </>
        }
      />
      {e.approvalStatus === 'REJECTED' ? <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Rejected{e.rejectedAt ? ` on ${formatDate(e.rejectedAt)}` : ''}: {e.rejectionReason}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
          <CardContent>
            <KeyValue columns={3} items={[{ label: 'Amount', value: formatCurrency(e.amount) }, { label: 'Tax', value: `${formatCurrency(e.taxAmount)} (${e.taxRate}%)` }, { label: 'TDS', value: formatCurrency(e.tdsAmount) }, { label: 'Payable', value: <strong>{formatCurrency(e.total)}</strong> }, { label: 'Paid', value: formatCurrency(e.paidAmount) }, { label: 'Outstanding', value: <span className={outstanding > 0 ? 'font-medium text-warning-foreground dark:text-warning' : ''}>{formatCurrency(outstanding)}</span> }, { label: 'Bill', value: e.billNumber ? `${e.billNumber} · ${formatDate(e.billDate)}` : formatDate(e.billDate) || '—' }, { label: 'Due', value: formatDate(e.dueDate) || '—' }, { label: 'Ledger', value: `${e.accountCode}${e.fundKey ? ` · fund ${e.fundKey}` : ''}` }, { label: 'Created', value: `${formatDateTime(e.createdAt)} · ${e.createdBy?.name ?? ''}` }, { label: 'Approved', value: e.approvedAt ? `${formatDateTime(e.approvedAt)}${e.approvedBy?.name ? ` · ${e.approvedBy.name}` : ''}` : '—' }, { label: 'Purchase order', value: e.purchaseOrderId ? <Link to={`/app/expenses/purchase-orders/${e.purchaseOrderId}`} className="text-primary hover:underline">View</Link> : '—' }, ...(e.description ? [{ label: 'Notes', value: e.description, span: 3 }] : [])]} />
            {e.payments?.length ? (
              <div className="mt-4"><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Payments</p><ul className="divide-y text-sm">{e.payments.map((p: any) => <li key={p._id ?? p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{formatDate(p.date)} · {formatStatus(p.method)}{p.reference ? ` · ${p.reference}` : ''}{p.bankAccountId?.name ? ` · ${p.bankAccountId.name}` : ''}</span><span className="flex items-center gap-2"><span className="tabular font-medium">{formatCurrency(p.amount)}</span>{p.journalEntryId ? <Link to={`/app/accounting/journals/${p.journalEntryId}`} className="text-xs text-primary hover:underline">journal</Link> : null}</span></li>)}</ul></div>
            ) : null}
            {e.approvalJournalEntryId ? <p className="mt-3 text-xs text-muted-foreground">Posted to the books: <Link to={`/app/accounting/journals/${e.approvalJournalEntryId}`} className="text-primary hover:underline">view journal</Link></p> : null}
          </CardContent>
        </Card>
        <WorkflowTrail workflow={e.workflow} />
      </div>
      <ExpenseDialog open={editing} onOpenChange={setEditing} editing={e} />
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reject {e.expenseNumber}</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="rej-reason">Reason *</Label><Textarea id="rej-reason" rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejecting(false)}>Cancel</Button><Button variant="destructive" loading={action.isPending} disabled={reason.trim().length < 2} onClick={() => run('reject', { reason }, 'Rejected')}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>Outstanding {formatCurrency(outstanding)}. The payment is posted against the selected bank / cash account.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ep-amount">Amount *</Label><Input id="ep-amount" type="number" min={0.01} max={outstanding} step="0.01" value={payForm.amount} onChange={(ev) => setPayForm({ ...payForm, amount: ev.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ep-date">Date</Label><Input id="ep-date" type="date" value={payForm.date} onChange={(ev) => setPayForm({ ...payForm, date: ev.target.value })} /></div>
            <div className="space-y-1.5"><Label>Method</Label><Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PaymentMethods.filter((m) => m !== 'ONLINE').map((m) => <SelectItem key={m} value={m}>{formatStatus(m)}</SelectItem>)}</SelectContent></Select></div>
            {banks.data?.length ? <div className="space-y-1.5"><Label>Paid from</Label><Select value={payForm.bankAccountId || 'auto'} onValueChange={(v) => setPayForm({ ...payForm, bankAccountId: v === 'auto' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Default for method</SelectItem>{banks.data.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div> : null}
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ep-ref">Reference</Label><Input id="ep-ref" value={payForm.reference} onChange={(ev) => setPayForm({ ...payForm, reference: ev.target.value })} placeholder="UTR / cheque no." /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ep-notes">Notes</Label><Textarea id="ep-notes" rows={2} value={payForm.notes} onChange={(ev) => setPayForm({ ...payForm, notes: ev.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaying(false)}>Cancel</Button><Button loading={pay.isPending} disabled={!Number(payForm.amount)} onClick={() => pay.mutate({ id, amount: Number(payForm.amount), date: new Date(payForm.date).toISOString(), method: payForm.method, reference: payForm.reference || undefined, bankAccountId: payForm.bankAccountId || null, notes: payForm.notes || undefined }, { onSuccess: () => { toast.success('Payment recorded'); setPaying(false); }, onError: (err) => toast.error(getErrorMessage(err)) })}>Record {formatCurrency(Number(payForm.amount) || 0)}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
