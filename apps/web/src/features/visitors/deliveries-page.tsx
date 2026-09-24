import { toast } from 'sonner';
import { Package, PackageCheck, Clock } from 'lucide-react';
import { DeliveryStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { HorizontalBars } from '@/components/common/charts';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeliveries, useDeliveryStats, useDeliveryStatus, useVisitorRealtime } from '@/hooks/use-visitors';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export default function DeliveriesPage() {
  const list = useListState({ sort: '-createdAt' });
  const deliveries = useDeliveries(list.params);
  const stats = useDeliveryStats();
  const setStatus = useDeliveryStatus();
  useVisitorRealtime();
  return (
    <div>
      <PageHeader title="Deliveries" description="Parcels and food logged at the gate, what is still waiting to be collected, and who collected what." />
      <StatGrid className="mb-6">
        <StatCard label="Arrived today" value={stats.data?.today ?? 0} icon={<Package />} tone="primary" loading={stats.isLoading} />
        <StatCard label="Held at the gate" value={stats.data?.held ?? 0} icon={<Clock />} tone={(stats.data?.held ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
      </StatGrid>
      {(stats.data?.byProvider ?? []).length ? <Card className="mb-6"><CardHeader><CardTitle className="text-sm">By provider (30 days)</CardTitle></CardHeader><CardContent><HorizontalBars data={stats.data.byProvider.map((p: any) => ({ label: p.provider, value: p.count }))} labelKey="label" valueKey="value" /></CardContent></Card> : null}
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Provider, tracking, person…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(DeliveryStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
      </FilterBar>
      <DataTable
        rows={deliveries.data?.items}
        loading={deliveries.isFetching}
        error={deliveries.error}
        onRetry={() => deliveries.refetch()}
        rowKey={(d: any) => d.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No deliveries logged"
        columns={[
          { key: 'provider', header: 'Delivery', cell: (d: any) => <span><span className="font-medium">{d.provider ?? formatStatus(d.kind)}</span><span className="block text-xs text-muted-foreground">{formatStatus(d.kind)}{d.trackingRef ? ` · ${d.trackingRef}` : ''}{d.deliveryPersonName ? ` · ${d.deliveryPersonName}` : ''}</span></span> },
          { key: 'unit', header: 'Unit', cell: (d: any) => d.unitId?.code },
          { key: 'arrivedAt', header: 'Arrived', sortable: true, hideBelow: 'sm', cell: (d: any) => (d.arrivedAt ? `${formatDateTime(d.arrivedAt)}${d.gateId?.name ? ` · ${d.gateId.name}` : ''}` : d.expectedAt ? `expected ${formatDateTime(d.expectedAt)}` : '—') },
          { key: 'collected', header: 'Collected', hideBelow: 'md', cell: (d: any) => (d.collectedAt ? `${formatDateTime(d.collectedAt)}${d.collectedByName ? ` · ${d.collectedByName}` : ''}` : '—') },
          { key: 'status', header: 'Status', sortable: true, cell: (d: any) => <StatusBadge status={d.status} /> },
          { key: 'actions', header: '', className: 'text-right', cell: (d: any) => (['ARRIVED', 'NOTIFIED', 'RECEIVED_AT_GATE'].includes(d.status) ? <SubscriptionGate><PermissionGate permission={['delivery:collect', 'delivery:update']}><Button size="sm" variant="outline" loading={setStatus.isPending} onClick={() => setStatus.mutate({ id: d.id, status: 'COLLECTED' }, { onSuccess: () => toast.success('Marked collected'), onError: (e) => toast.error(getErrorMessage(e)) })}><PackageCheck /> Collected</Button></PermissionGate></SubscriptionGate> : null) },
        ]}
        pagination={deliveries.data ? { page: deliveries.data.page, pages: deliveries.data.pages, total: deliveries.data.total, limit: deliveries.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
    </div>
  );
}
