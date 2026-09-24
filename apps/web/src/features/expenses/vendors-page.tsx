import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Download, Pencil, Trash2, Store } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCreateVendor, useDeleteVendor, useExportVendors, useUpdateVendor, useVendor, useVendors } from '@/hooks/use-expenses';
import { useCategories } from '@/hooks/use-society';
import { formatCurrency, formatDate, formatPhone, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const blank = { name: '', code: '', categoryKey: '', contactName: '', phone: '', email: '', gstin: '', pan: '', paymentTermsDays: '30', accountHolder: '', accountNumber: '', ifsc: '', upiId: '', city: '', notes: '', status: 'ACTIVE' };

function VendorDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: any | null }) {
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const categories = useCategories('VENDOR_CATEGORY');
  const [form, setForm] = React.useState<any>(blank);
  React.useEffect(() => { if (open) setForm(editing ? { ...blank, ...editing, categoryKey: editing.categoryKey ?? '', paymentTermsDays: String(editing.paymentTermsDays ?? 30), accountHolder: editing.bank?.accountHolder ?? '', accountNumber: '', ifsc: editing.bank?.ifsc ?? '', upiId: editing.bank?.upiId ?? '', city: editing.address?.city ?? '', phone: editing.phone ?? '', email: editing.email ?? '', contactName: editing.contactName ?? '', gstin: editing.gstin ?? '', pan: editing.pan ?? '', notes: editing.notes ?? '', code: editing.code ?? '' } : blank); }, [open, editing]);
  const payload = { name: form.name, code: form.code || undefined, categoryKey: form.categoryKey || undefined, contactName: form.contactName || undefined, phone: form.phone || '', email: form.email || '', gstin: form.gstin || undefined, pan: form.pan || undefined, paymentTermsDays: Number(form.paymentTermsDays) || 30, address: form.city ? { city: form.city } : undefined, bank: form.accountHolder || form.accountNumber || form.ifsc || form.upiId ? { accountHolder: form.accountHolder || undefined, accountNumber: form.accountNumber || undefined, ifsc: form.ifsc || undefined, upiId: form.upiId || undefined } : undefined, notes: form.notes || undefined };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : 'New vendor'}</DialogTitle><DialogDescription>Bank account numbers are stored masked; only the last four digits are kept.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="vn-name">Name *</Label><Input id="vn-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Category</Label><Combobox value={form.categoryKey} onChange={(v) => setForm({ ...form, categoryKey: v ?? '' })} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} placeholder="Category" /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-contact">Contact person</Label><Input id="vn-contact" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-phone">Phone</Label><Input id="vn-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-email">Email</Label><Input id="vn-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-city">City</Label><Input id="vn-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-gstin">GSTIN</Label><Input id="vn-gstin" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-pan">PAN</Label><Input id="vn-pan" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-terms">Payment terms (days)</Label><Input id="vn-terms" type="number" min={0} value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-code">Vendor code</Label><Input id="vn-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="optional" /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-holder">Bank account holder</Label><Input id="vn-holder" value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-account">Account number</Label><Input id="vn-account" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder={editing?.bank?.accountNumberMasked ?? ''} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-ifsc">IFSC</Label><Input id="vn-ifsc" value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vn-upi">UPI id</Label><Input id="vn-upi" value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} /></div>
          {editing ? <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['ACTIVE', 'INACTIVE', 'BLACKLISTED'].map((s) => <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>)}</SelectContent></Select></div> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="vn-notes">Notes</Label><Textarea id="vn-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending || update.isPending} disabled={!form.name} onClick={() => { const opts = { onSuccess: () => { toast.success(editing ? 'Vendor updated' : 'Vendor created'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) }; if (editing) update.mutate({ id: editing.id, ...payload, status: form.status }, opts); else create.mutate(payload, opts); }}>{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorDetail({ id, onEdit }: { id: string; onEdit: (v: any) => void }) {
  const vendor = useVendor(id);
  const v = vendor.data;
  if (!v) return null;
  return (
    <div className="space-y-4">
      <div><p className="flex items-center gap-2 text-lg font-semibold"><Store className="h-4 w-4" /> {v.name} <StatusBadge status={v.status} /></p><p className="text-xs text-muted-foreground">{v.categoryKey ? formatStatus(v.categoryKey) : 'Uncategorised'}{v.code ? ` · ${v.code}` : ''}</p></div>
      <KeyValue columns={2} items={[{ label: 'Contact', value: v.contactName ?? '—' }, { label: 'Phone', value: formatPhone(v.phone) }, { label: 'Email', value: v.email ?? '—' }, { label: 'Payment terms', value: `${v.paymentTermsDays} days` }, { label: 'GSTIN', value: v.gstin ?? '—' }, { label: 'PAN', value: v.pan ?? '—' }, { label: 'Bank', value: v.bank?.accountNumberMasked ? `${v.bank.accountHolder ?? ''} · ${v.bank.accountNumberMasked} · ${v.bank.ifsc ?? ''}` : v.bank?.upiId ?? '—', span: 2 }, { label: 'Billed', value: formatCurrency(v.stats?.billed ?? 0) }, { label: 'Outstanding', value: formatCurrency(v.stats?.outstanding ?? 0) }]} />
      {v.recentExpenses?.length ? <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Recent expenses</p><ul className="divide-y text-sm">{v.recentExpenses.map((e: any) => <li key={e.id} className="flex items-center justify-between gap-2 py-1.5"><Link to={`/app/expenses/${e.id}`} className="text-primary hover:underline">{e.expenseNumber}</Link><span className="truncate text-xs text-muted-foreground">{e.title}</span><span className="tabular">{formatCurrency(e.total)}</span><StatusBadge status={e.paymentStatus} /></li>)}</ul></div> : null}
      <PermissionGate permission="vendors:update"><Button variant="outline" size="sm" onClick={() => onEdit(v)}><Pencil /> Edit</Button></PermissionGate>
    </div>
  );
}

export default function VendorsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: 'name' });
  const vendors = useVendors(list.params);
  const categories = useCategories('VENDOR_CATEGORY');
  const remove = useDeleteVendor();
  const exportRows = useExportVendors();
  const { confirm, ConfirmElement } = useConfirm();
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Vendors" description="Suppliers, contractors and service providers with their tax and payment details." actions={<SubscriptionGate><PermissionGate permission="vendors:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(undefined, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate><PermissionGate permission="vendors:create"><Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> New vendor</Button></PermissionGate></SubscriptionGate>} />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, contact, phone…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'PENDING_APPROVAL', 'INACTIVE', 'BLACKLISTED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
      </FilterBar>
      <DataTable
        rows={vendors.data?.items}
        loading={vendors.isFetching}
        error={vendors.error}
        onRetry={() => vendors.refetch()}
        rowKey={(v: any) => v.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(v: any) => navigate(`/app/vendors/${v.id}`)}
        emptyTitle="No vendors yet"
        columns={[
          { key: 'name', header: 'Vendor', sortable: true, cell: (v: any) => <span><span className="font-medium">{v.name}</span>{v.categoryKey ? <Badge variant="outline" className="ml-2">{formatStatus(v.categoryKey)}</Badge> : null}</span> },
          { key: 'contact', header: 'Contact', hideBelow: 'md', cell: (v: any) => `${v.contactName ?? ''}${v.phone ? ` · ${formatPhone(v.phone)}` : ''}` },
          { key: 'terms', header: 'Terms', hideBelow: 'lg', cell: (v: any) => `${v.paymentTermsDays} days` },
          { key: 'createdAt', header: 'Added', sortable: true, hideBelow: 'lg', cell: (v: any) => formatDate(v.createdAt) },
          { key: 'status', header: 'Status', sortable: true, cell: (v: any) => <StatusBadge status={v.status} /> },
          { key: 'actions', header: '', className: 'text-right', cell: (v: any) => <PermissionGate permission="vendors:delete"><Button variant="ghost" size="sm" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: `Remove ${v.name}?`, description: 'Vendors with unpaid bills cannot be removed.', destructive: true, confirmLabel: 'Remove' })) remove.mutate(v.id, { onSuccess: () => toast.success('Vendor removed'), onError: (err) => toast.error(getErrorMessage(err)) }); }}><Trash2 /></Button></PermissionGate> },
        ]}
        pagination={vendors.data ? { page: vendors.data.page, pages: vendors.data.pages, total: vendors.data.total, limit: vendors.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <VendorDialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })} editing={dialog.editing} />
      <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) navigate('/app/vendors'); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Vendor</SheetTitle><SheetDescription>Profile, tax details and recent bills.</SheetDescription></SheetHeader><div className="mt-4">{id ? <VendorDetail id={id} onEdit={(v) => setDialog({ open: true, editing: v })} /> : null}</div></SheetContent>
      </Sheet>
    </div>
  );
}
