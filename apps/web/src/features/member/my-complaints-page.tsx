import * as React from 'react';
import { Link } from 'react-router-dom';
import { Plus, MessageSquareWarning } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useComplaints } from '@/hooks/use-complaints';
import { RaiseComplaintDialog, SlaChip } from '@/features/complaints/complaints-page';
import { formatRelative, formatStatus } from '@/lib/utils';

/** Resident view: own tickets (and public common-area tickets), raise new ones. */
export default function MyComplaintsPage() {
  const [status, setStatus] = React.useState('');
  const complaints = useComplaints({ limit: 50, sort: '-createdAt', ...(status === 'open' ? { openOnly: 'true' } : status ? { status } : {}) });
  const [raising, setRaising] = React.useState(false);
  const items = complaints.data?.items ?? [];
  return (
    <div>
      <PageHeader title="My complaints" description="Raise issues about your flat or the common areas and follow their progress." actions={<SubscriptionGate><Button onClick={() => setRaising(true)}><Plus /> Raise a complaint</Button></SubscriptionGate>} />
      <FilterBar onReset={() => setStatus('')}>
        <FilterSelect value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'CLOSED', label: 'Closed' }]} allLabel="All" />
      </FilterBar>
      {complaints.isLoading ? <CardSkeleton count={3} /> : complaints.isError ? <ErrorState error={complaints.error} onRetry={() => complaints.refetch()} /> : !items.length ? <EmptyState icon={<MessageSquareWarning />} title="No complaints yet" description="Something broken or bothering you? Raise a complaint and the society office will take it from there." action={<Button onClick={() => setRaising(true)}><Plus /> Raise a complaint</Button>} /> : (
        <div className="space-y-3">
          {items.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <Link to={`/app/my/complaints/${c.id}`} className="block">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.ticketNumber}</span><Badge variant="outline">{formatStatus(c.categoryKey)}</Badge><StatusBadge status={c.status} /><SlaChip complaint={c} />{c.isPublic ? <Badge variant="secondary">Common area</Badge> : null}</div>
                  <p className="mt-1 text-sm">{c.title}</p>
                  <p className="text-xs text-muted-foreground">Raised {formatRelative(c.createdAt)}{c.assignedTo?.name ? ` · handled by ${c.assignedTo.name}` : ''}{c.unitId?.code ? ` · ${c.unitId.code}` : ''}</p>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <RaiseComplaintDialog open={raising} onOpenChange={setRaising} member />
    </div>
  );
}
