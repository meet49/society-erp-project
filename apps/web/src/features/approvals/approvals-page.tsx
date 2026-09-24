import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCheck, Ban, Inbox, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApprovals, useDecideApproval } from '@/hooks/use-workflows';
import { onSocketEvent } from '@/lib/socket';
import { formatCurrency, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const LINKS: Record<string, (id: string) => string> = {
  Expense: (id) => `/app/expenses/${id}`,
  PurchaseOrder: (id) => `/app/expenses/purchase-orders/${id}`,
  Vendor: (id) => `/app/vendors/${id}`,
  AmenityBooking: (id) => `/app/amenities/bookings/${id}`,
  Document: (id) => `/app/documents?document=${id}`,
};

function describe(i: any) {
  const c = i.context ?? {};
  if (i.entityType === 'Expense') return { title: `${c.expenseNumber ?? 'Expense'} · ${c.title ?? ''}`, amount: c.amount, meta: c.vendorName ?? c.categoryKey ?? '' };
  if (i.entityType === 'PurchaseOrder') return { title: `${c.poNumber ?? 'Purchase order'} · ${c.title ?? ''}`, amount: c.amount, meta: c.categoryKey ?? '' };
  if (i.entityType === 'Vendor') return { title: `Vendor · ${c.name ?? ''}`, amount: undefined, meta: c.categoryKey ?? '' };
  if (i.entityType === 'AmenityBooking') return { title: `${c.amenityName ?? 'Amenity'} · ${c.unitCode ?? ''}`, amount: c.amount, meta: c.startAt ? new Date(c.startAt).toLocaleString() : '' };
  if (i.entityType === 'Document') return { title: `Document · ${c.title ?? c.name ?? ''}`, amount: undefined, meta: c.categoryKey ?? '' };
  return { title: `${formatStatus(i.entityType)} · ${c.title ?? c.name ?? ''}`, amount: c.amount, meta: '' };
}

/** Everything waiting on the current user across all workflows (expenses, purchase orders, vendors, bookings…). */
export default function ApprovalsPage() {
  const [entityType, setEntityType] = React.useState('');
  const approvals = useApprovals(entityType ? { entityType } : {});
  const decide = useDecideApproval();
  const [rejecting, setRejecting] = React.useState<any | null>(null);
  const [note, setNote] = React.useState('');
  React.useEffect(() => onSocketEvent('approvals.changed', () => approvals.refetch()), [approvals]);
  const items = approvals.data ?? [];
  return (
    <div>
      <PageHeader title="Approvals" description="Requests waiting for your decision, routed by your society's workflows." />
      <FilterBar onReset={() => setEntityType('')}>
        <FilterSelect value={entityType} onChange={setEntityType} options={[{ value: 'Expense', label: 'Expenses' }, { value: 'PurchaseOrder', label: 'Purchase orders' }, { value: 'Vendor', label: 'Vendors' }, { value: 'AmenityBooking', label: 'Amenity bookings' }, { value: 'Document', label: 'Documents' }]} allLabel="Everything" />
      </FilterBar>
      {approvals.isLoading ? <CardSkeleton count={3} /> : approvals.isError ? <ErrorState error={approvals.error} onRetry={() => approvals.refetch()} /> : !items.length ? <EmptyState icon={<Inbox />} title="Nothing to approve" description="You're all caught up. New requests appear here the moment they're submitted." /> : (
        <div className="space-y-3">
          {items.map((i: any) => {
            const d = describe(i);
            const link = LINKS[i.entityType]?.(String(i.entityId));
            return (
              <Card key={i.id}>
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium"><Badge variant="outline">{formatStatus(i.entityType)}</Badge> {d.title}</p>
                    <p className="text-xs text-muted-foreground">Step “{i.currentStepName}” · requested by {i.startedBy?.name ?? 'someone'} {formatRelative(i.createdAt)}{d.meta ? ` · ${formatStatus(d.meta)}` : ''}</p>
                  </div>
                  {d.amount != null ? <p className="text-lg font-semibold tabular">{formatCurrency(d.amount)}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {link ? <Button asChild variant="ghost" size="sm"><Link to={link}><ExternalLink /> Details</Link></Button> : null}
                    <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: i.id, decision: 'APPROVED' }, { onSuccess: (r) => toast.success(r.status === 'APPROVED' ? 'Approved' : 'Approved · waiting for the next step'), onError: (e) => toast.error(getErrorMessage(e)) })}><CheckCheck /> Approve</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setNote(''); setRejecting(i); }}><Ban /> Reject</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reject request</DialogTitle><DialogDescription>{rejecting ? describe(rejecting).title : ''} <StatusBadge status="PENDING" /></DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="ap-note">Reason *</Label><Textarea id="ap-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="destructive" loading={decide.isPending} disabled={note.trim().length < 2} onClick={() => decide.mutate({ id: rejecting.id, decision: 'REJECTED', note }, { onSuccess: () => { toast.success('Rejected'); setRejecting(null); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
