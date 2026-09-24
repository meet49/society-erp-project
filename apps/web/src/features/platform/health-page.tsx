import { PageHeader } from '@/components/common/page-header';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { KeyValue } from '@/components/common/key-value';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { usePlatformHealth } from '@/hooks/use-platform';
import { Activity, Database, Server, Timer } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export default function HealthPage() {
  const health = usePlatformHealth();
  if (health.isError) return <ErrorState error={health.error} onRetry={() => health.refetch()} />;
  const h = health.data;
  return (
    <div>
      <PageHeader title="Platform health" description="Live status of the API process, database, cache and job runner. Refreshes every 30 seconds." breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Health' }]} />
      <StatGrid>
        <StatCard label="API" value={<StatusBadge status={h?.status === 'ok' ? 'ACTIVE' : 'FAILED'} label={h?.status === 'ok' ? 'Healthy' : 'Degraded'} />} icon={<Activity />} tone={h?.status === 'ok' ? 'success' : 'destructive'} loading={health.isLoading} />
        <StatCard label="Database" value={h?.database?.state ?? '—'} hint={h?.database?.transactions ? 'Transactions supported' : 'No transactions (standalone)'} icon={<Database />} loading={health.isLoading} />
        <StatCard label="Jobs" value={h?.jobs?.driver ?? '—'} hint={`Redis ${h?.redis ?? '—'}`} icon={<Server />} loading={health.isLoading} />
        <StatCard label="Uptime" value={h ? `${Math.floor(h.uptimeSeconds / 3600)}h ${Math.floor((h.uptimeSeconds % 3600) / 60)}m` : '—'} icon={<Timer />} loading={health.isLoading} />
      </StatGrid>
      <Card className="mt-6 max-w-2xl">
        <CardHeader><CardTitle className="text-sm">Process</CardTitle></CardHeader>
        <CardContent>
          <KeyValue columns={2} items={[{ label: 'Node', value: h?.node }, { label: 'Server time', value: h ? formatDateTime(h.time) : '—' }, { label: 'Memory RSS', value: h ? `${h.memoryMb.rss} MB` : '—' }, { label: 'Heap used', value: h ? `${h.memoryMb.heapUsed} MB` : '—' }, { label: 'Database name', value: h?.database?.name }]} />
        </CardContent>
      </Card>
    </div>
  );
}
