import { HardHat, Sparkles, ParkingSquare } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { registerWidgets } from '@/features/society/widgets';
import { useHelpStats, useParkingStats, useStaffStats } from '@/hooks/use-operations';

function StaffTodayWidget() {
  const stats = useStaffStats();
  return <StatCard label="Staff present today" value={`${stats.data?.today?.present ?? 0}/${stats.data?.headcount ?? 0}`} hint={`${stats.data?.today?.unmarked ?? 0} not marked · ${stats.data?.today?.leave ?? 0} on leave`} icon={<HardHat />} tone={(stats.data?.today?.unmarked ?? 0) > 0 ? 'warning' : 'default'} to="/app/staff" loading={stats.isLoading} />;
}

function HelpWidget() {
  const stats = useHelpStats();
  return <StatCard label="Domestic help inside" value={stats.data?.insideNow ?? 0} hint={`${stats.data?.pendingVerification ?? 0} awaiting verification`} icon={<Sparkles />} tone={(stats.data?.pendingVerification ?? 0) > 0 ? 'warning' : 'default'} to="/app/domestic-help" loading={stats.isLoading} />;
}

function ParkingWidget() {
  const stats = useParkingStats();
  return <StatCard label="Parking occupancy" value={`${stats.data?.occupancyPercent ?? 0}%`} hint={`${stats.data?.available ?? 0} of ${stats.data?.total ?? 0} slots free`} icon={<ParkingSquare />} to="/app/parking" loading={stats.isLoading} />;
}

registerWidgets([
  { key: 'staff-today', module: 'staff', permission: 'staff:view', size: 'stat', component: StaffTodayWidget },
  { key: 'domestic-help-inside', module: 'domestic_help', permission: 'domestic_help:view', size: 'stat', component: HelpWidget },
  { key: 'parking-occupancy', module: 'parking', permission: 'parking:view', size: 'stat', component: ParkingWidget },
]);
