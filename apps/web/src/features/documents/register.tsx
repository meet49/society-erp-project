import { FileText } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { registerWidgets } from '@/features/society/widgets';
import { useDocumentStats } from '@/hooks/use-documents';

function DocumentsStatWidget() {
  const stats = useDocumentStats();
  const alert = (stats.data?.expired ?? 0) + (stats.data?.expiring ?? 0) + (stats.data?.pending ?? 0);
  return <StatCard label="Documents" value={stats.data?.total ?? 0} hint={`${stats.data?.expiring ?? 0} expiring · ${stats.data?.pending ?? 0} to review`} icon={<FileText />} tone={(stats.data?.expired ?? 0) > 0 ? 'destructive' : alert > 0 ? 'warning' : 'default'} to="/app/documents" loading={stats.isLoading} />;
}

registerWidgets([{ key: 'documents-summary', module: 'documents', permission: ['documents:create', 'documents:update', 'documents:manage_folders'], size: 'stat', component: DocumentsStatWidget }]);
