import * as React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Receipt, AlertTriangle, History } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { PermissionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInvoices, useUnitBalance, useUnitLedger } from '@/hooks/use-billing';
import { useCreateOrder, useGatewayPublic, useSimulateGateway, useVerifyOrder } from '@/hooks/use-payments';
import { useCheckout } from '@/features/payments/checkout';
import { useAuth } from '@/hooks/use-auth';
import { useAccessibleModules } from '@/hooks/use-access';
import { useHousehold } from '@/hooks/use-residents';
import { formatCurrency, formatDate } from '@/lib/utils';

/** Resident self-service: bills for the unit(s) linked to the login, with online payment of all dues. */
export default function MyBillsPage() {
  const { context } = useAuth();
  const { hasModule } = useAccessibleModules();
  const household = useHousehold();
  const unitIds = React.useMemo(() => context?.resident?.unitIds ?? [], [context?.resident?.unitIds]);
  const [unitId, setUnitId] = React.useState<string>(context?.resident?.primaryUnitId ?? unitIds[0] ?? '');
  React.useEffect(() => { if (!unitId && unitIds[0]) setUnitId(unitIds[0]); }, [unitIds, unitId]);
  const list = useListState({ sort: '-createdAt' });
  const invoices = useInvoices({ ...list.params, unitId }, Boolean(unitId));
  const balance = useUnitBalance(unitId);
  const ledger = useUnitLedger(unitId, {});
  const gateway = useGatewayPublic(hasModule('payments'));
  const createOrder = useCreateOrder();
  const simulate = useSimulateGateway();
  const verify = useVerifyOrder();
  const due = balance.data?.balance ?? 0;
  const overdue = (invoices.data?.items ?? []).filter((i: any) => i.status === 'OVERDUE');
  const checkout = useCheckout({
    title: 'Pay outstanding dues',
    description: `All open invoices for unit ${household.data?.units?.find((u: any) => u.id === unitId)?.code ?? ''}`,
    prefill: { name: context?.user.name, email: context?.user.email ?? undefined },
    createOrder: () => createOrder.mutateAsync({ unitId }),
    simulate: (orderId, outcome) => simulate.mutateAsync({ orderId, outcome }),
    verify: (orderId, r) => verify.mutateAsync({ orderId, ...r }),
  });
  if (!unitIds.length) return <div><PageHeader title="My bills" /><EmptyState icon={<Receipt />} title="No unit linked" description="Bills appear once the society links your login to your flat." /></div>;
  const openTotal = (invoices.data?.items ?? []).filter((i: any) => ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status)).reduce((s: number, i: any) => s + i.balanceDue, 0);
  return (
    <div>
      {checkout.element}
      <PageHeader
        title="My bills"
        description="Maintenance invoices, utility charges and your unit ledger."
        actions={
          <>
            {unitIds.length > 1 ? <Select value={unitId} onValueChange={setUnitId}><SelectTrigger className="w-40"><SelectValue placeholder="Unit" /></SelectTrigger><SelectContent>{(household.data?.units ?? []).filter((u: any) => unitIds.includes(u.id)).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>)}</SelectContent></Select> : null}
            {hasModule('payments') && gateway.data?.enabled && openTotal > 0 ? <PermissionGate permission="payments:pay_own"><Button onClick={checkout.start}><CreditCard /> Pay {formatCurrency(openTotal)}</Button></PermissionGate> : null}
            <PermissionGate permission="payments:view_own"><Button asChild variant="outline"><Link to="/app/my/payments"><History /> Payments</Link></Button></PermissionGate>
          </>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label={due < 0 ? 'Advance balance' : 'Outstanding'} value={formatCurrency(Math.abs(due))} hint={due < 0 ? 'Adjusted against future bills' : due === 0 ? 'All settled' : undefined} icon={<Receipt />} tone={due > 0 ? 'warning' : 'success'} loading={balance.isLoading} />
        <StatCard label="Overdue invoices" value={overdue.length} hint={overdue.length ? `${formatCurrency(overdue.reduce((s: number, i: any) => s + i.balanceDue, 0))} past due` : undefined} icon={<AlertTriangle />} tone={overdue.length ? 'destructive' : 'default'} />
      </StatGrid>
      {hasModule('payments') && gateway.data && !gateway.data.enabled ? <p className="mb-4 text-sm text-muted-foreground">Online payment is not enabled yet — pay at the society office and your receipt will appear under Payments.</p> : null}
      <DataTable
        rows={invoices.data?.items}
        loading={invoices.isFetching}
        error={invoices.error}
        onRetry={() => invoices.refetch()}
        rowKey={(i: any) => i.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No bills yet"
        emptyDescription="Your invoices show up here as soon as the society issues them."
        columns={[
          { key: 'invoiceNumber', header: 'Invoice', cell: (i: any) => <Link to={`/app/my/bills/${i.id}`} className="font-medium text-primary hover:underline">{i.invoiceNumber}</Link> },
          { key: 'period', header: 'Period', cell: (i: any) => i.period?.label ?? '—' },
          { key: 'dueDate', header: 'Due', sortable: true, cell: (i: any) => formatDate(i.dueDate) },
          { key: 'total', header: 'Total', className: 'text-right', headerClassName: 'text-right', cell: (i: any) => <span className="tabular">{formatCurrency(i.total)}</span> },
          { key: 'balanceDue', header: 'Balance', className: 'text-right', headerClassName: 'text-right', cell: (i: any) => <span className={`tabular ${i.balanceDue > 0 ? 'font-medium' : 'text-muted-foreground'}`}>{formatCurrency(i.balanceDue)}</span> },
          { key: 'status', header: 'Status', cell: (i: any) => <StatusBadge status={i.status} /> },
        ]}
        pagination={invoices.data ? { page: invoices.data.page, pages: invoices.data.pages, total: invoices.data.total, limit: invoices.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-sm">Ledger</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(ledger.data?.entries ?? []).slice().reverse().slice(0, 12).map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate">{e.description}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.date)}</span><span className={`shrink-0 tabular ${e.debit ? '' : 'text-success'}`}>{e.debit ? formatCurrency(e.debit) : `−${formatCurrency(e.credit)}`}</span><span className="hidden shrink-0 tabular text-xs text-muted-foreground sm:inline">bal {formatCurrency(e.balance)}</span></li>
            ))}
            {!ledger.isLoading && !(ledger.data?.entries ?? []).length ? <li className="py-2 text-muted-foreground">No transactions yet.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
