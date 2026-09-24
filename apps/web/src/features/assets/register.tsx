import { FileSignature, Wrench, Warehouse } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { registerWidgets } from '@/features/society/widgets';
import { useAssetStats, useContractStats, useInventoryStats } from '@/hooks/use-assets';
import { formatCurrency } from '@/lib/utils';

function ContractsWidget() {
  const stats = useContractStats();
  return <StatCard label="Contracts expiring (30d)" value={stats.data?.expiring30 ?? 0} hint={`${stats.data?.active ?? 0} active · ${formatCurrency(stats.data?.activeValue ?? 0, 'INR', { compact: true })} a year`} icon={<FileSignature />} tone={(stats.data?.expiring30 ?? 0) > 0 ? 'warning' : 'default'} to="/app/contracts?expiringWithinDays=30" loading={stats.isLoading} />;
}

function AssetsWidget() {
  const stats = useAssetStats();
  return <StatCard label="Maintenance due (30d)" value={stats.data?.maintenanceDue ?? 0} hint={`${stats.data?.total ?? 0} assets · ${stats.data?.underMaintenance ?? 0} out of service`} icon={<Wrench />} tone={(stats.data?.maintenanceDue ?? 0) > 0 ? 'warning' : 'default'} to="/app/assets?maintenanceDue=true" loading={stats.isLoading} />;
}

function InventoryWidget() {
  const stats = useInventoryStats();
  return <StatCard label="Items below minimum" value={stats.data?.lowStock ?? 0} hint={`${stats.data?.items ?? 0} items · ${formatCurrency(stats.data?.stockValue ?? 0, 'INR', { compact: true })} in stock`} icon={<Warehouse />} tone={(stats.data?.lowStock ?? 0) > 0 ? 'warning' : 'default'} to="/app/inventory?lowStockOnly=true" loading={stats.isLoading} />;
}

registerWidgets([
  { key: 'contracts-expiring', module: 'contracts', permission: 'contracts:view', size: 'stat', component: ContractsWidget },
  { key: 'assets-maintenance-due', module: 'assets', permission: 'assets:view', size: 'stat', component: AssetsWidget },
  { key: 'inventory-low-stock', module: 'inventory', permission: 'inventory:view', size: 'stat', component: InventoryWidget },
]);
