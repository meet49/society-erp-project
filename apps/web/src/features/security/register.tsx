import { Shield, Siren } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { registerWidgets } from '@/features/society/widgets';
import { useEmergencyStats, useIncidentStats } from '@/hooks/use-security';

function IncidentsWidget() {
  const stats = useIncidentStats();
  return <StatCard label="Open incidents" value={stats.data?.open ?? 0} hint={`${stats.data?.critical ?? 0} high / critical · ${stats.data?.unassigned ?? 0} unassigned`} icon={<Shield />} tone={(stats.data?.critical ?? 0) > 0 ? 'destructive' : (stats.data?.open ?? 0) > 0 ? 'warning' : 'default'} to="/app/security" loading={stats.isLoading} />;
}

function EmergencyWidget() {
  const stats = useEmergencyStats();
  return <StatCard label="Active SOS" value={stats.data?.activeSos ?? 0} hint={`${stats.data?.sos30d ?? 0} in 30 days · avg response ${stats.data?.avgAckMinutes != null ? `${stats.data.avgAckMinutes} min` : '—'}`} icon={<Siren />} tone={(stats.data?.activeSos ?? 0) > 0 ? 'destructive' : 'default'} to="/app/emergency" loading={stats.isLoading} />;
}

registerWidgets([
  { key: 'security-open-incidents', module: 'security', permission: 'security:view', size: 'stat', component: IncidentsWidget },
  { key: 'emergency-active-sos', module: 'emergency', permission: ['emergency:respond', 'emergency:manage'], size: 'stat', component: EmergencyWidget },
]);
