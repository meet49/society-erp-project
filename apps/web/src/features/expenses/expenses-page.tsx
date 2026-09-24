import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Download, ClipboardList, Store, Clock, AlertTriangle, Wallet, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { HorizontalBars } from '@/components/common/charts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateExpense, useExpenseStats, useExpenses, useExportExpenses, useUpdateExpense, useVendorOptions } from '@/hooks/use-expenses';
import { useCategories } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { formatCurrency, formatDate, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export const blankExpense = { title: '', description: '', vendorId: '', vendorName: '', categoryKey: '', billNumber: '', billDate: toInputDate(new Date()), dueDate: '', amount: '', taxRate: '0', tdsAmount: '0', fundKey: '', submit: true };

export function ExpenseDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: any | null }) {
  const navigate = useNavigate();
  const vendors = useVendorOptions(open);
  const categories = useCategories('EXPENSE_CATEGORY');
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const { can } = usePermissions();
  const [form, setForm] = React.useState<any>(blankExpense);
  React.useEffect(() => { if (open) setForm(editing ? { ...blankExpense, ...editing, vendorId: editing.vendorId?.id ?? editing.vendorId ?? '', vendorName: editing.vendorName ?? '', categoryKey: editing.categoryKey ?? '', billNumber: editing.billNumber ?? '', billDate: toInputDate(editing.billDate), dueDate: toInputDate(editing.dueDate), amount: String(editing.amount), taxRate: String(editing.taxRate ?? 0), tdsAmount: String(editing.tdsAmount ?? 0), fundKey: editing.fundKey ?? '', description: editing.description ?? '', submit: false } : blankExpense); }, [open, editing]);
  const amount = Number(form.amount) || 0;
  const tax = (amount * (Number(form.taxRate) || 0)) / 100;
  const total = amount + tax - (Number(form.tdsAmount) || 0);
  const payload = { title: form.title, description: form.description || undefined, vendorId: form.vendorId || null, vendorName: form.vendorId ? undefined : form.vendorName || undefined, categoryKey: form.categoryKey || undefined, billNumber: form.billNumber || undefined, billDate: form.billDate ? new Date(form.billDate).toISOString() : undefined, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined, amount, taxRate: Number(form.taxRate) || 0, tdsAmount: Number(form.tdsAmount) || 0, fundKey: form.fundKey || null };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.expenseNumber}` : 'New expense'}</DialogTitle><DialogDescription>Bills from vendors, salaries, utilities and one-off costs. Approval follows the society's expense workflow.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ex-title">Title *</Label><Input id="ex-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Housekeeping - March" /></div>
          <div className="space-y-1.5"><Label>Vendor</Label><Combobox value={form.vendorId} onChange={(v) => setForm({ ...form, vendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name, description: v.categoryKey }))} placeholder="Registered vendor" /></div>
          {!form.vendorId ? <div className="space-y-1.5"><Label htmlFor="ex-vendor">Or payee name</Label><Input id="ex-vendor" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} placeholder="One-off payee" /></div> : <div />}
          <div className="space-y-1.5"><Label>Category</Label><Combobox value={form.categoryKey} onChange={(v) => setForm({ ...form, categoryKey: v ?? '' })} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} placeholder="Category" /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-fund">Fund (optional)</Label><Input id="ex-fund" value={form.fundKey} onChange={(e) => setForm({ ...form, fundKey: e.target.value.toUpperCase() })} placeholder="SINKING, REPAIR…" /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-bill">Bill number</Label><Input id="ex-bill" value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-billdate">Bill date</Label><Input id="ex-billdate" type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-amount">Amount (before tax) *</Label><Input id="ex-amount" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-tax">Tax rate (%)</Label><Input id="ex-tax" type="number" min={0} max={100} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-tds">TDS deducted</Label><Input id="ex-tds" type="number" min={0} step="0.01" value={form.tdsAmount} onChange={(e) => setForm({ ...form, tdsAmount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ex-due">Due date</Label><Input id="ex-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ex-desc">Notes</Label><Textarea id="ex-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="sm:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Tax</span><span className="tabular">{formatCurrency(tax)}</span></div><div className="flex justify-between font-semibold"><span>Payable</span><span className="tabular">{formatCurrency(total)}</span></div></div>
          {!editing && can('expenses:submit') ? <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.submit} onCheckedChange={(v) => setForm({ ...form, submit: v })} /> Submit for approval now</label> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending || update.isPending} disabled={!form.title || !form.amount} onClick={() => { const opts = { onSuccess: (e: any) => { toast.success(editing ? 'Expense updated' : e.approvalStatus === 'APPROVED' ? `${e.expenseNumber} approved automatically` : e.approvalStatus === 'PENDING' ? `${e.expenseNumber} sent for approval` : `${e.expenseNumber} saved as draft`); onOpenChange(false); if (!editing) navigate(`/app/expenses/${e.id}`); }, onError: (err: unknown) => toast.error(getErrorMessage(err)) }; if (editing) update.mutate({ id: editing.id, ...payload }, opts); else create.mutate({ ...payload, submit: form.submit }, opts); }}>{editing ? 'Save' : form.submit ? 'Create & submit' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpensesPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const list = useListState({ sort: '-createdAt' });
  React.useEffect(() => {
    for (const k of ['approvalStatus', 'paymentStatus', 'vendorId']) {
      const v = params.get(k);
      if (v) list.setFilter(k, v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const expenses = useExpenses(list.params);
  const stats = useExpenseStats();
  const exportRows = useExportExpenses();
  const categories = useCategories('EXPENSE_CATEGORY');
  const [adding, setAdding] = React.useState(false);
  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Vendor bills and outgoings with approval, payment tracking and ledger posting."
        actions={
          <SubscriptionGate>
            <PermissionGate permission="expenses:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
            <Button asChild variant="outline"><Link to="/app/expenses/purchase-orders"><ClipboardList /> Purchase orders</Link></Button>
            <PermissionGate permission="vendors:view"><Button asChild variant="outline"><Link to="/app/vendors"><Store /> Vendors</Link></Button></PermissionGate>
            <PermissionGate permission="expenses:create"><Button onClick={() => setAdding(true)}><Plus /> New expense</Button></PermissionGate>
          </SubscriptionGate>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Awaiting approval" value={formatCurrency(stats.data?.pendingApproval?.amount ?? 0)} hint={`${stats.data?.pendingApproval?.count ?? 0} expenses`} icon={<Clock />} tone={(stats.data?.pendingApproval?.count ?? 0) > 0 ? 'warning' : 'default'} to="/app/approvals" loading={stats.isLoading} />
        <StatCard label="Payable" value={formatCurrency(stats.data?.payable?.amount ?? 0)} hint={`${stats.data?.payable?.count ?? 0} approved bills`} icon={<Wallet />} tone="primary" loading={stats.isLoading} />
        <StatCard label="Overdue bills" value={stats.data?.overdueBills ?? 0} icon={<AlertTriangle />} tone={(stats.data?.overdueBills ?? 0) > 0 ? 'destructive' : 'default'} loading={stats.isLoading} />
        <StatCard label="This month" value={formatCurrency(stats.data?.thisMonth?.amount ?? 0)} hint={`${stats.data?.thisMonth?.count ?? 0} approved`} icon={<TrendingDown />} loading={stats.isLoading} />
      </StatGrid>
      {stats.data?.byCategory?.length ? <Card className="mb-6"><CardHeader><CardTitle className="text-sm">By category (last 90 days)</CardTitle></CardHeader><CardContent><HorizontalBars data={stats.data.byCategory.map((c: any) => ({ label: formatStatus(c.category), value: c.amount }))} labelKey="label" valueKey="value" valueFormatter={(v) => formatCurrency(v)} /></CardContent></Card> : null}
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Number, title, vendor, bill no…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.approvalStatus ?? ''} onChange={(v) => list.setFilter('approvalStatus', v)} options={['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any approval" />
        <FilterSelect value={list.filters.paymentStatus ?? ''} onChange={(v) => list.setFilter('paymentStatus', v)} options={['UNPAID', 'PARTIAL', 'PAID'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any payment" />
        <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
      </FilterBar>
      <DataTable
        rows={expenses.data?.items}
        loading={expenses.isFetching}
        error={expenses.error}
        onRetry={() => expenses.refetch()}
        rowKey={(e: any) => e.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(e: any) => navigate(`/app/expenses/${e.id}`)}
        emptyTitle="No expenses yet"
        emptyDescription="Record vendor bills and running costs here; approvals and accounting entries follow automatically."
        columns={[
          { key: 'expenseNumber', header: 'Expense', cell: (e: any) => <span><span className="font-medium">{e.expenseNumber}</span><span className="block text-xs text-muted-foreground">{e.title}</span></span> },
          { key: 'vendor', header: 'Vendor', hideBelow: 'md', cell: (e: any) => e.vendorName ?? '—' },
          { key: 'category', header: 'Category', hideBelow: 'lg', cell: (e: any) => (e.categoryKey ? <Badge variant="outline">{formatStatus(e.categoryKey)}</Badge> : '—') },
          { key: 'billDate', header: 'Bill date', sortable: true, hideBelow: 'sm', cell: (e: any) => formatDate(e.billDate) },
          { key: 'total', header: 'Total', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (e: any) => <span className="tabular font-medium">{formatCurrency(e.total)}</span> },
          { key: 'approvalStatus', header: 'Approval', sortable: true, cell: (e: any) => <StatusBadge status={e.approvalStatus} /> },
          { key: 'paymentStatus', header: 'Payment', sortable: true, cell: (e: any) => <StatusBadge status={e.paymentStatus} /> },
        ]}
        pagination={expenses.data ? { page: expenses.data.page, pages: expenses.data.pages, total: expenses.data.total, limit: expenses.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <ExpenseDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
