import { PageHeader } from '@/components/common/page-header';
import { ChartCard, SimpleBarChart, HorizontalBars } from '@/components/common/charts';
import { ErrorState } from '@/components/common/error-state';
import { usePlatformAnalytics } from '@/hooks/use-platform';
import { formatCurrency, formatStatus } from '@/lib/utils';

export default function AnalyticsPage() {
  const analytics = usePlatformAnalytics();
  if (analytics.isError) return <ErrorState error={analytics.error} onRetry={() => analytics.refetch()} />;
  const a = analytics.data;
  const money = (v: number) => formatCurrency(v, 'INR', { compact: true });
  return (
    <div>
      <PageHeader title="Analytics" description="Growth, revenue and distribution across the platform. Every chart has a table view." />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups per month" description="New societies created" loading={analytics.isLoading} rows={a?.signupsByMonth ?? []} columns={[{ key: 'month', label: 'Month' }, { key: 'count', label: 'Signups' }]}>
          <SimpleBarChart data={a?.signupsByMonth ?? []} xKey="month" series={[{ key: 'count', label: 'Signups', slot: 0 }]} labelMax />
        </ChartCard>
        <ChartCard title="Subscription revenue per month" description="Successful subscription payments" loading={analytics.isLoading} rows={a?.revenueByMonth ?? []} columns={[{ key: 'month', label: 'Month' }, { key: 'amount', label: 'Amount', format: (v) => formatCurrency(Number(v)) }]}>
          <SimpleBarChart data={a?.revenueByMonth ?? []} xKey="month" series={[{ key: 'amount', label: 'Revenue', slot: 2 }]} valueFormatter={money} labelMax />
        </ChartCard>
        <ChartCard title="Societies by plan" description="Active, trialing and past-due subscriptions" loading={analytics.isLoading} rows={a?.byPlan ?? []} columns={[{ key: 'name', label: 'Plan' }, { key: 'count', label: 'Societies' }, { key: 'mrr', label: 'MRR', format: (v) => formatCurrency(Number(v)) }]}>
          <HorizontalBars data={(a?.byPlan ?? []).map((p: any) => ({ ...p, name: p.name ?? 'Unknown' }))} labelKey="name" valueKey="count" />
        </ChartCard>
        <ChartCard title="Subscription status" loading={analytics.isLoading} rows={(a?.byStatus ?? []).map((s: any) => ({ ...s, status: formatStatus(s.status) }))} columns={[{ key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }]}>
          <HorizontalBars data={(a?.byStatus ?? []).map((s: any) => ({ ...s, status: formatStatus(s.status) }))} labelKey="status" valueKey="count" />
        </ChartCard>
        <ChartCard title="Top cities" description="Active societies by city" loading={analytics.isLoading} rows={a?.byCity ?? []} columns={[{ key: 'city', label: 'City' }, { key: 'count', label: 'Societies' }]} className="lg:col-span-2">
          <HorizontalBars data={a?.byCity ?? []} labelKey="city" valueKey="count" />
        </ChartCard>
      </div>
    </div>
  );
}
