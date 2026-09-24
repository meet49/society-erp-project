import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Combobox } from '@/components/common/combobox';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useApproveMove, useMoves, useRejectMove, useRequestMove, useResidents } from '@/hooks/use-residents';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { formatDate, formatDateTime, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const MOVE_TYPES = [['MOVE_IN', 'Move in'], ['MOVE_OUT', 'Move out'], ['TENANT_CHANGE', 'Tenant change'], ['OWNER_CHANGE', 'Owner change']] as const;

export default function MovesPage() {
  const list = useListState({ sort: '-date' });
  const moves = useMoves(list.params);
  const pending = useMoves({ approvalStatus: 'PENDING', limit: 50 });
  const request = useRequestMove();
  const approve = useApproveMove();
  const reject = useRejectMove();
  const units = useUnitOptions();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [rejecting, setRejecting] = React.useState<any | null>(null);
  const [reason, setReason] = React.useState('');
  const [form, setForm] = React.useState({ type: 'MOVE_IN', unitId: '', residentType: 'TENANT', mode: 'new', residentId: '', name: '', phone: '', email: '', rent: '', deposit: '', date: toInputDate(new Date()), notes: '' });
  const existing = useResidents({ status: 'MOVED_OUT', limit: 100 }, form.mode === 'existing');
  const submit = () =>
    request.mutate(
      { type: form.type, unitId: form.unitId, residentType: form.residentType, residentId: form.mode === 'existing' && form.type !== 'MOVE_OUT' ? form.residentId || undefined : undefined, resident: form.type !== 'MOVE_OUT' && form.mode === 'new' ? { name: form.name, phone: form.phone || undefined, email: form.email || undefined, tenancy: form.residentType === 'TENANT' && (form.rent || form.deposit) ? { rent: form.rent ? Number(form.rent) : undefined, deposit: form.deposit ? Number(form.deposit) : undefined } : undefined } : undefined, date: form.date, notes: form.notes || undefined },
      { onSuccess: (m) => { toast.success(m.approvalStatus === 'PENDING' ? 'Move request submitted for approval' : 'Move recorded'); setOpen(false); }, onError: (e) => toast.error(getErrorMessage(e)) },
    );
  return (
    <div>
      <PageHeader title="Move in / move out" description="Owner and tenant changes with approval and history. Outstanding dues are checked before move-out." breadcrumbs={[{ label: 'Residents', to: '/app/residents' }, { label: 'Moves' }]} actions={<SubscriptionGate><PermissionGate permission={['residents:move', 'residents:approve_move']}><Button onClick={() => setOpen(true)}><Plus /> New move</Button></PermissionGate></SubscriptionGate>} />
      {can('residents:approve_move') && (pending.data?.items ?? []).length ? (
        <Card className="mb-6 border-warning/50">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold">Awaiting your approval</p>
            <ul className="divide-y">
              {pending.data!.items.map((m: any) => (
                <li key={m.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                  <div className="flex-1 text-sm"><span className="font-medium">{formatStatus(m.type)}</span> · unit {m.unitId?.code} · {m.pendingResident?.name ?? m.residentId?.name ?? '—'} ({formatStatus(m.residentType)}) · {formatDate(m.date)}{m.outstandingDues ? <span className="ml-2 text-destructive">dues {m.outstandingDues}</span> : null}<p className="text-xs text-muted-foreground">Requested by {m.requestedBy?.name ?? '—'} · {m.notes ?? ''}</p></div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => approve.mutate(m.id, { onSuccess: () => toast.success('Move approved'), onError: (e) => toast.error(getErrorMessage(e)) })}><Check /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(m)}><X /> Reject</Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <FilterBar onReset={list.reset}>
        <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={MOVE_TYPES.map(([v, l]) => ({ value: v, label: l }))} allLabel="Any type" />
        <FilterSelect value={list.filters.approvalStatus ?? ''} onChange={(v) => list.setFilter('approvalStatus', v)} options={['PENDING', 'APPROVED', 'REJECTED', 'NA'].map((s) => ({ value: s, label: s === 'NA' ? 'No approval needed' : formatStatus(s) }))} allLabel="Any status" />
      </FilterBar>
      <DataTable
        rows={moves.data?.items}
        loading={moves.isFetching}
        error={moves.error}
        onRetry={() => moves.refetch()}
        rowKey={(m: any) => m.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No moves recorded"
        columns={[
          { key: 'date', header: 'Date', sortable: true, cell: (m: any) => formatDate(m.date) },
          { key: 'type', header: 'Type', sortable: true, cell: (m: any) => formatStatus(m.type) },
          { key: 'unit', header: 'Unit', cell: (m: any) => m.unitId?.code ?? '—' },
          { key: 'resident', header: 'Resident', cell: (m: any) => (<div><p>{m.residentId?.name ?? m.pendingResident?.name ?? '—'} <span className="text-xs text-muted-foreground">({formatStatus(m.residentType)})</span></p>{m.previousResidentId ? <p className="text-xs text-muted-foreground">replaces {m.previousResidentId.name}</p> : null}</div>) },
          { key: 'approvalStatus', header: 'Approval', sortable: true, cell: (m: any) => <StatusBadge status={m.approvalStatus === 'NA' ? 'APPROVED' : m.approvalStatus} label={m.approvalStatus === 'NA' ? 'Applied' : undefined} /> },
          { key: 'by', header: 'By', hideBelow: 'md', cell: (m: any) => (<div className="text-xs"><p>{m.requestedBy?.name ?? '—'}</p>{m.approvedBy ? <p className="text-muted-foreground">{m.approvalStatus === 'REJECTED' ? 'rejected' : 'approved'} by {m.approvedBy.name} · {formatDateTime(m.approvedAt)}</p> : null}</div>) },
        ]}
        pagination={moves.data ? { page: moves.data.page, pages: moves.data.pages, total: moves.data.total, limit: moves.data.limit, onPageChange: list.setPage } : undefined}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New move</DialogTitle><DialogDescription>{can('residents:approve_move') ? 'You can approve moves, so this is applied immediately.' : 'Your request goes to an approver before it takes effect.'}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MOVE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Owner or tenant</Label><Select value={form.residentType} onValueChange={(v) => setForm({ ...form, residentType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OWNER">Owner</SelectItem><SelectItem value="TENANT">Tenant</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Unit</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} placeholder="Select unit" /></div>
            {form.type !== 'MOVE_OUT' ? (
              <>
                <div className="space-y-1.5 sm:col-span-2"><Label>Resident</Label><Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New person</SelectItem><SelectItem value="existing">Returning resident (previously moved out)</SelectItem></SelectContent></Select></div>
                {form.mode === 'existing' ? (
                  <div className="space-y-1.5 sm:col-span-2"><Label>Select resident</Label><Combobox value={form.residentId} onChange={(v) => setForm({ ...form, residentId: v ?? '' })} options={(existing.data?.items ?? []).map((r: any) => ({ value: r.id, label: r.name, description: r.unitId?.code }))} placeholder="Search…" /></div>
                ) : (
                  <>
                    <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    {form.residentType === 'TENANT' ? <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label>Rent</Label><Input type="number" value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })} /></div><div className="space-y-1.5"><Label>Deposit</Label><Input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div></div> : null}
                  </>
                )}
              </>
            ) : null}
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Agreement number, NOC, handover remarks…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={request.isPending} disabled={!form.unitId || (form.type !== 'MOVE_OUT' && form.mode === 'new' && !form.name) || (form.type !== 'MOVE_OUT' && form.mode === 'existing' && !form.residentId)} onClick={submit}>{can('residents:approve_move') ? 'Apply move' : 'Submit for approval'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reject move request</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.trim().length < 2} loading={reject.isPending} onClick={() => reject.mutate({ id: rejecting.id, reason }, { onSuccess: () => { toast.success('Move rejected'); setRejecting(null); setReason(''); } })}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
