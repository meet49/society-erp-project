import { Link } from 'react-router-dom';
import { Inbox, TrendingDown, Landmark, ArrowRight, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/common/stat-card';
import { ChartCard, SimpleBarChart } from '@/components/common/charts';
import { registerWidgets } from '@/features/society/widgets';
import { useExpenseStats } from '@/hooks/use-expenses';
import { useAccountingSummary, useAccountingTrend } from '@/hooks/use-accounting';
import { useApprovals } from '@/hooks/use-workflows';
import { formatCurrency, formatRelative, formatStatus } from '@/lib/utils';

function ExpensesStatWidget() {
  const stats = useExpenseStats();
  return <StatCard label="Payables" value={formatCurrency(stats.data?.payable?.amount ?? 0)} hint={`${stats.data?.payable?.count ?? 0} approved bills · ${stats.data?.pendingApproval?.count ?? 0} awaiting approval`} icon={<TrendingDown />} tone={(stats.data?.overdueBills ?? 0) > 0 ? 'warning' : 'default'} to="/app/expenses" loading={stats.isLoading} />;
}

function CashWidget() {
  const summary = useAccountingSummary();
  return <StatCard label="Cash & bank" value={formatCurrency(summary.data?.cashAndBank ?? 0)} hint={`Surplus YTD ${formatCurrency(summary.data?.ytd?.surplus ?? 0)}`} icon={<Landmark />} tone="primary" to="/app/accounting" loading={summary.isLoading} />;
}

function IncomeExpenseWidget() {
  const trend = useAccountingTrend();
  const rows = trend.data ?? [];
  return (
    <ChartCard title="Income vs expense" loading={trend.isLoading} columns={[{ key: 'month', label: 'Month' }, { key: 'income', label: 'Income', format: (v) => formatCurrency(v) }, { key: 'expense', label: 'Expense', format: (v) => formatCurrency(v) }]} rows={rows}>
      <SimpleBarChart data={rows} xKey="month" series={[{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' }]} valueFormatter={(v) => formatCurrency(v, 'INR', { compact: true })} height={220} />
    </ChartCard>
  );
}

/** Shown to anyone: renders only when there is something waiting on the user. */
function ApprovalsWidget() {
  const approvals = useApprovals({ limit: 5 });
  const items = approvals.data ?? [];
  if (!items.length) return null;
  return (
    <Card className="border-warning/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm"><Inbox className="h-4 w-4" /> Waiting for your approval <Badge variant="warning">{items.length}</Badge></CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/approvals">Open inbox <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((i: any) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate"><Badge variant="outline" className="mr-2">{formatStatus(i.entityType)}</Badge>{i.context?.expenseNumber ?? i.context?.poNumber ?? i.context?.name ?? ''} {i.context?.title ?? ''}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{i.context?.amount != null ? formatCurrency(i.context.amount) : ''} · {formatRelative(i.createdAt)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><CheckCheck className="h-3.5 w-3.5" /> Decide from the inbox or from each request's page.</p>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'approvals-inbox', module: 'society', permission: ['expenses:approve', 'amenities:approve', 'society:manage_settings', 'vendors:update'], size: 'full', component: ApprovalsWidget },
  { key: 'expenses-payables', module: 'expenses', permission: 'expenses:view', size: 'stat', component: ExpensesStatWidget },
  { key: 'accounting-cash', module: 'accounting', permission: 'accounting:view', size: 'stat', component: CashWidget },
  { key: 'accounting-trend', module: 'accounting', permission: 'accounting:view', size: 'half', component: IncomeExpenseWidget },
]);
