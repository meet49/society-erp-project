import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw, Radar } from 'lucide-react';
import { SubscriptionStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { usePlans, useRunLifecycle, useSubscriptions } from '@/hooks/use-platform';
import { SubscriptionActions } from '@/features/platform/subscription-actions';
import { formatCurrency, formatDate, formatStatus, daysBetween } from '@/lib/utils';

export default function SubscriptionsPage() {
  const [params] = useSearchParams();
  const list = useListState({ sort: 'renewalDate' });
  React.useEffect(() => {
    const s = params.get('status');
    if (s) list.setFilter('status', s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const subs = useSubscriptions(list.params);
  const plans = usePlans();
  const lifecycle = useRunLifecycle();
  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Lifecycle, renewals and plan changes for every society."
        actions={
          <>
            <Button variant="outline" onClick={() => lifecycle.mutate(undefined, { onSuccess: (r: any) => toast.success(`Sweep done: ${r.pastDue} past due, ${r.expired} expired, ${r.suspended} suspended, ${r.reminders} reminders`) })} loading={lifecycle.isPending}>
              <RefreshCw /> Run lifecycle sweep
            </Button>
            <Button asChild>
              <Link to="/admin/subscriptions/expiry">
                <Radar /> Expiry radar
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search society…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(SubscriptionStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.planId ?? ''} onChange={(v) => list.setFilter('planId', v)} options={(plans.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))} allLabel="Any plan" />
        <FilterSelect value={list.filters.billingCycle ?? ''} onChange={(v) => list.setFilter('billingCycle', v)} options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Annual' }]} allLabel="Any cycle" />
      </FilterBar>
      <DataTable
        rows={subs.data?.items}
        loading={subs.isFetching}
        error={subs.error}
        onRetry={() => subs.refetch()}
        rowKey={(s: any) => s.id}
        sort={list.sort}
        onSortChange={list.setSort}
        columns={[
          { key: 'society', header: 'Society', cell: (s: any) => (
              <Link to={`/admin/societies/${s.societyId?.id ?? s.societyId?._id ?? s.societyId}`} className="font-medium hover:underline">
                {s.societyId?.name ?? '—'}
              </Link>
            ) },
          { key: 'plan', header: 'Plan', cell: (s: any) => `${s.planId?.name ?? '—'} · ${formatStatus(s.billingCycle)}` },
          { key: 'status', header: 'Status', sortable: true, cell: (s: any) => <StatusBadge status={s.status} /> },
          { key: 'amount', header: 'Amount', sortable: true, hideBelow: 'md', cell: (s: any) => formatCurrency(s.amount, s.currency) },
          { key: 'renewalDate', header: 'Renewal', sortable: true, cell: (s: any) => {
              const d = daysBetween(s.renewalDate);
              return (
                <div>
                  <p>{formatDate(s.renewalDate)}</p>
                  <p className={`text-xs ${d < 0 ? 'text-destructive' : d <= 7 ? 'text-warning-foreground dark:text-warning' : 'text-muted-foreground'}`}>{d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? 'Today' : `in ${d} days`}</p>
                </div>
              );
            } },
          { key: 'actions', header: '', cell: (s: any) => <SubscriptionActions compact subscription={{ id: s.id, status: s.status, planId: s.planId, billingCycle: s.billingCycle, amount: s.amount, currency: s.currency }} /> },
        ]}
        pagination={subs.data ? { page: subs.data.page, pages: subs.data.pages, total: subs.data.total, limit: subs.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
    </div>
  );
}
