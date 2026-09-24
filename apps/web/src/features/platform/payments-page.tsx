import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePlatformPayments, useSocieties } from '@/hooks/use-platform';
import { useRecordPlatformPayment } from '@/hooks/use-payments';
import { usePermissions } from '@/hooks/use-access';
import { formatCurrency, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Platform team records a bank transfer / cheque received for a society's subscription; the subscription activates or renews. */
function RecordOfflineDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [search, setSearch] = React.useState('');
  const societies = useSocieties({ search, limit: 20 });
  const record = useRecordPlatformPayment();
  const [form, setForm] = React.useState({ societyId: '', amount: '', method: 'BANK_TRANSFER', reference: '', billingCycle: '', paidAt: toInputDate(new Date()), note: '' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record offline subscription payment</DialogTitle><DialogDescription>Use for NEFT / cheque payments received outside the gateway. The society's subscription is activated and its renewal date extended by one cycle.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Society *</Label><Combobox value={form.societyId} onChange={(v) => setForm({ ...form, societyId: v ?? '' })} onSearch={setSearch} loading={societies.isFetching} options={(societies.data?.items ?? []).map((s: any) => ({ value: s.id, label: s.name, description: `${s.address?.city ?? ''} · ${s.subscription?.status ?? ''}` }))} placeholder="Search society…" /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-amount">Amount *</Label><Input id="pp-amount" type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Method</Label><Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'OTHER'].map((m) => <SelectItem key={m} value={m}>{formatStatus(m)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="pp-ref">Reference</Label><Input id="pp-ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="UTR / cheque no." /></div>
          <div className="space-y-1.5"><Label>Billing cycle</Label><Select value={form.billingCycle || 'keep'} onValueChange={(v) => setForm({ ...form, billingCycle: v === 'keep' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Keep current</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem><SelectItem value="ANNUAL">Annual</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="pp-date">Paid on</Label><Input id="pp-date" type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pp-note">Note</Label><Textarea id="pp-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={record.isPending} disabled={!form.societyId || !form.amount} onClick={() => record.mutate({ societyId: form.societyId, amount: Number(form.amount), method: form.method, reference: form.reference || undefined, billingCycle: form.billingCycle || undefined, paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined, note: form.note || undefined }, { onSuccess: (p) => { toast.success(`Payment ${p.receiptNumber} recorded and subscription activated`); onOpenChange(false); setForm({ ...form, societyId: '', amount: '', reference: '', note: '' }); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformPaymentsPage() {
  const list = useListState({ sort: '-createdAt' });
  const payments = usePlatformPayments(list.params);
  const { can } = usePermissions();
  const [recording, setRecording] = React.useState(false);
  return (
    <div>
      <PageHeader title="Subscription payments" description="Online and offline payments received from societies for their subscriptions." actions={can('platform_payments:record') ? <Button onClick={() => setRecording(true)}><Plus /> Record offline payment</Button> : undefined} />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search society or reference…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.provider ?? ''} onChange={(v) => list.setFilter('provider', v)} options={[{ value: 'manual', label: 'Recorded offline' }, { value: 'razorpay', label: 'Razorpay' }, { value: 'mock', label: 'Demo gateway' }]} allLabel="Any provider" />
      </FilterBar>
      <DataTable
        rows={payments.data?.items}
        loading={payments.isFetching}
        error={payments.error}
        onRetry={() => payments.refetch()}
        rowKey={(p: any) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No payments yet"
        columns={[
          { key: 'createdAt', header: 'Date', sortable: true, cell: (p: any) => formatDateTime(p.paidAt ?? p.createdAt) },
          { key: 'society', header: 'Society', cell: (p: any) => <Link to={`/admin/societies/${p.societyId?.id ?? p.societyId}`} className="font-medium hover:underline">{p.societyId?.name ?? '—'}</Link> },
          { key: 'plan', header: 'Plan', hideBelow: 'md', cell: (p: any) => `${p.planId?.name ?? '—'} · ${formatStatus(p.billingCycle)}` },
          { key: 'amount', header: 'Amount', sortable: true, cell: (p: any) => <span className="tabular font-medium">{formatCurrency(p.amount, p.currency)}</span> },
          { key: 'provider', header: 'Provider', hideBelow: 'md', cell: (p: any) => `${formatStatus(p.provider)}${p.method ? ` · ${formatStatus(p.method)}` : ''}` },
          { key: 'reference', header: 'Reference', hideBelow: 'lg', cell: (p: any) => <code className="text-xs">{p.receiptNumber ?? ''}{p.reference || p.providerPaymentId ? ` · ${p.reference ?? p.providerPaymentId}` : ''}</code> },
          { key: 'status', header: 'Status', cell: (p: any) => <StatusBadge status={p.status} /> },
        ]}
        pagination={payments.data ? { page: payments.data.page, pages: payments.data.pages, total: payments.data.total, limit: payments.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <RecordOfflineDialog open={recording} onOpenChange={setRecording} />
    </div>
  );
}
