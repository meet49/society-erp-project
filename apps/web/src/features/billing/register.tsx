import { Link } from 'react-router-dom';
import { Receipt, Wallet, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { HorizontalBars, SimpleBarChart, ChartCard } from '@/components/common/charts';
import { PermissionGate } from '@/components/common/gates';
import { registerWidgets } from '@/features/society/widgets';
import { UNIT_DETAIL_SECTIONS } from '@/features/units/unit-detail-page';
import { MY_UNIT_SECTIONS } from '@/features/member/my-unit-page';
import { useBillingStats, useInvoices, useUnitBalance, useUnitLedger } from '@/hooks/use-billing';
import { usePayments, usePaymentStats } from '@/hooks/use-payments';
import { useAccessibleModules } from '@/hooks/use-access';
import { formatCurrency, formatDate, formatStatus } from '@/lib/utils';

// ------------------------------------------------------------------ dashboard widgets
function OutstandingWidget() {
  const stats = useBillingStats();
  return <StatCard label="Outstanding dues" value={formatCurrency(stats.data?.outstanding ?? 0)} hint={`${stats.data?.openInvoices ?? 0} open invoices · ${stats.data?.overdueCount ?? 0} overdue`} icon={<Receipt />} tone={(stats.data?.overdueCount ?? 0) > 0 ? 'warning' : 'default'} to="/app/billing?status=OVERDUE" loading={stats.isLoading} />;
}

function CollectedWidget() {
  const stats = usePaymentStats();
  return <StatCard label="Collected this month" value={formatCurrency(stats.data?.collectedThisMonth ?? 0)} hint={`${stats.data?.paymentsThisMonth ?? 0} payments · ${stats.data?.onlineShare ?? 0}% online`} icon={<Wallet />} tone="success" to="/app/payments" loading={stats.isLoading} />;
}

function OutstandingByBuildingWidget() {
  const stats = useBillingStats();
  const rows = (stats.data?.outstandingByBuilding ?? []).map((b: any) => ({ label: b.building, value: b.amount, count: b.count }));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Outstanding by building</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/billing">Billing <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>{stats.isLoading ? null : rows.length ? <HorizontalBars data={rows} labelKey="label" valueKey="value" valueFormatter={(v) => formatCurrency(v)} /> : <p className="text-sm text-muted-foreground">No dues outstanding.</p>}</CardContent>
    </Card>
  );
}

function CollectionTrendWidget() {
  const stats = usePaymentStats();
  const rows = (stats.data?.trend ?? []).map((t: any) => ({ month: t.month, amount: t.amount, count: t.count }));
  return (
    <ChartCard title="Collections (last 6 months)" loading={stats.isLoading} columns={[{ key: 'month', label: 'Month' }, { key: 'amount', label: 'Collected', format: (v) => formatCurrency(v) }, { key: 'count', label: 'Payments' }]} rows={rows}>
      <SimpleBarChart data={rows} xKey="month" series={[{ key: 'amount', label: 'Collected' }]} valueFormatter={(v) => formatCurrency(v, 'INR', { compact: true })} height={220} />
    </ChartCard>
  );
}

function RecentPaymentsWidget() {
  const payments = usePayments({ limit: 6, sort: '-receivedAt' });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Recent payments</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/payments">All payments <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {(payments.data?.items ?? []).map((p: any) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><Link to={`/app/payments/${p.id}`} className="font-medium hover:underline">{p.unitId?.code ?? '—'}</Link><p className="truncate text-xs text-muted-foreground">{p.receiptNumber} · {formatStatus(p.method)} · {formatDate(p.receivedAt)}</p></div>
              <span className="tabular font-medium">{formatCurrency(p.amount)}</span>
            </li>
          ))}
          {!payments.isLoading && !(payments.data?.items ?? []).length ? <li className="py-3 text-muted-foreground">No payments yet.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'billing-outstanding', module: 'billing', permission: 'billing:view', size: 'stat', component: OutstandingWidget },
  { key: 'payments-collected', module: 'payments', permission: 'payments:view', size: 'stat', component: CollectedWidget },
  { key: 'billing-by-building', module: 'billing', permission: 'billing:view', size: 'half', component: OutstandingByBuildingWidget },
  { key: 'payments-trend', module: 'payments', permission: 'payments:view', size: 'half', component: CollectionTrendWidget },
  { key: 'payments-recent', module: 'payments', permission: 'payments:view', size: 'half', component: RecentPaymentsWidget },
]);

// ------------------------------------------------------------------ unit detail: ledger & open invoices
function UnitBillingSection({ unit }: { unit: any }) {
  const ledger = useUnitLedger(unit.id, {});
  const invoices = useInvoices({ unitId: unit.id, limit: 5, sort: '-createdAt' });
  const entries: any[] = ledger.data?.entries ?? [];
  const balance = ledger.data?.closingBalance ?? 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Billing & ledger</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={balance > 0 ? 'warning' : 'success'}>{balance > 0 ? `Due ${formatCurrency(balance)}` : balance < 0 ? `Advance ${formatCurrency(-balance)}` : 'Nothing due'}</Badge>
          <Button asChild variant="ghost" size="sm"><Link to={`/app/billing?unitId=${unit.id}`}>Invoices <ArrowRight /></Link></Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Recent invoices</p>
          <ul className="divide-y text-sm">
            {(invoices.data?.items ?? []).map((i: any) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                <Link to={`/app/billing/invoices/${i.id}`} className="font-medium hover:underline">{i.invoiceNumber}</Link>
                <span className="text-xs text-muted-foreground">{i.period?.label}</span>
                <span className="tabular">{formatCurrency(i.balanceDue)}</span>
                <StatusBadge status={i.status} />
              </li>
            ))}
            {!invoices.isLoading && !(invoices.data?.items ?? []).length ? <li className="py-2 text-muted-foreground">No invoices yet.</li> : null}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Ledger (latest)</p>
          <ul className="divide-y text-sm">
            {entries.slice(-6).reverse().map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{e.description}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.date)}</span>
                <span className={`shrink-0 tabular ${e.debit ? 'text-destructive' : 'text-success'}`}>{e.debit ? `+${formatCurrency(e.debit)}` : `−${formatCurrency(e.credit)}`}</span>
              </li>
            ))}
            {!ledger.isLoading && !entries.length ? <li className="py-2 text-muted-foreground">Opening balance {formatCurrency(ledger.data?.openingBalance ?? unit.openingBalance ?? 0)}.</li> : null}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

UNIT_DETAIL_SECTIONS.push({ key: 'billing', module: 'billing', permission: 'billing:view', component: UnitBillingSection });

// ------------------------------------------------------------------ member "my unit": dues card
function MyUnitDuesCard({ unit }: { unit: any }) {
  const { hasModule } = useAccessibleModules();
  const balance = useUnitBalance(unit.id ?? unit._id);
  if (!hasModule('billing')) return null;
  const due = balance.data?.balance ?? 0;
  return (
    <PermissionGate permission="billing:view_own">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          {due > 0 ? <AlertTriangle className="h-4 w-4 text-warning" /> : <Receipt className="h-4 w-4 text-muted-foreground" />}
          <span>{due > 0 ? <>Outstanding dues <strong className="tabular">{formatCurrency(due)}</strong></> : due < 0 ? <>Advance balance <strong className="tabular">{formatCurrency(-due)}</strong></> : 'No dues pending'}</span>
        </div>
        <Button asChild size="sm" variant={due > 0 ? 'default' : 'outline'}><Link to="/app/my/bills">{due > 0 ? 'View & pay bills' : 'View bills'} <ArrowRight /></Link></Button>
      </div>
    </PermissionGate>
  );
}

MY_UNIT_SECTIONS.push({ key: 'billing-dues', component: MyUnitDuesCard });
