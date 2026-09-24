import { Link } from 'react-router-dom';
import { Building2, CreditCard, Handshake, LifeBuoy, Radar, TrendingUp, Wallet, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/error-state';
import { ChartCard, SimpleBarChart } from '@/components/common/charts';
import { usePlatformAnalytics, usePlatformDashboard } from '@/hooks/use-platform';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function PlatformDashboardPage() {
  const dash = usePlatformDashboard();
  const analytics = usePlatformAnalytics();
  const d = dash.data;
  if (dash.isError) return <ErrorState error={dash.error} onRetry={() => dash.refetch()} />;
  return (
    <div>
      <PageHeader title="Platform overview" description="Societies, revenue and operations at a glance." actions={<Button asChild variant="outline"><Link to="/admin/subscriptions/expiry">Expiry radar</Link></Button>} />
      <StatGrid>
        <StatCard label="Total societies" value={d?.societies.total ?? 0} hint={`${d?.societies.newSignups ?? 0} new in 30 days`} icon={<Building2 />} tone="primary" to="/admin/societies" loading={dash.isLoading} />
        <StatCard label="Active" value={d?.societies.active ?? 0} hint={`${d?.societies.trial ?? 0} on trial`} icon={<TrendingUp />} tone="success" to="/admin/societies?subscriptionStatus=ACTIVE" loading={dash.isLoading} />
        <StatCard label="Past due" value={d?.societies.pastDue ?? 0} hint={`${d?.societies.expired ?? 0} expired · ${d?.societies.suspended ?? 0} suspended`} icon={<AlertTriangle />} tone="warning" to="/admin/subscriptions?status=PAST_DUE" loading={dash.isLoading} />
        <StatCard label="Expiring in 7 days" value={d?.societies.expiringSoon ?? 0} icon={<Radar />} tone="destructive" to="/admin/subscriptions/expiry" loading={dash.isLoading} />
        <StatCard label="MRR" value={formatCurrency(d?.revenue.mrr ?? 0)} hint={`ARR ${formatCurrency(d?.revenue.arr ?? 0, 'INR', { compact: true })}`} icon={<Wallet />} tone="primary" loading={dash.isLoading} />
        <StatCard label="Collected" value={formatCurrency(d?.revenue.collected ?? 0)} hint={`Outstanding ${formatCurrency(d?.revenue.outstanding ?? 0)}`} icon={<CreditCard />} tone="success" to="/admin/payments" loading={dash.isLoading} />
        <StatCard label="Open leads" value={d?.leads.open ?? 0} icon={<Handshake />} to="/admin/leads" loading={dash.isLoading} />
        <StatCard label="Open tickets" value={d?.support.open ?? 0} icon={<LifeBuoy />} to="/admin/support" loading={dash.isLoading} />
      </StatGrid>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="New societies per month" description="Signups over the last 12 months" className="lg:col-span-2" loading={analytics.isLoading} rows={analytics.data?.signupsByMonth ?? []} columns={[{ key: 'month', label: 'Month' }, { key: 'count', label: 'Signups' }]}>
          <SimpleBarChart data={analytics.data?.signupsByMonth ?? []} xKey="month" series={[{ key: 'count', label: 'Signups', slot: 0 }]} labelMax />
        </ChartCard>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Expiry radar</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(d?.expiryRadar ?? []).map((b: any) => (
                <li key={b.key} className="flex items-center justify-between text-sm">
                  <Link to="/admin/subscriptions/expiry" className="text-muted-foreground hover:text-foreground">
                    {b.label}
                  </Link>
                  <span className="tabular font-semibold">{b.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Recent societies</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/societies">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(d?.recentSocieties ?? []).map((s: any) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <Link to={`/admin/societies/${s.id}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {s.address?.city ?? '—'} · {s.stats?.units ?? 0} units · joined {formatDate(s.createdAt)}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
            {!dash.isLoading && !(d?.recentSocieties ?? []).length ? <li className="py-4 text-sm text-muted-foreground">No societies yet.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
