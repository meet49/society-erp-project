import { Home } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyValue } from '@/components/common/key-value';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useHousehold } from '@/hooks/use-residents';
import { formatNumber, formatStatus } from '@/lib/utils';

/** Extension slot: billing, parking and vehicles add cards here. */
export const MY_UNIT_SECTIONS: { key: string; component: React.ComponentType<{ unit: any }> }[] = [];

export default function MyUnitPage() {
  const household = useHousehold();
  if (household.isLoading) return <PageSkeleton />;
  if (household.isError) return <ErrorState error={household.error} onRetry={() => household.refetch()} />;
  const units: any[] = household.data?.units ?? [];
  const members: any[] = household.data?.members ?? [];
  return (
    <div>
      <PageHeader title="My unit" description="Details of the flat(s) linked to your account." />
      {!units.length ? (
        <EmptyState icon={<Home />} title="No unit linked" description="Your unit appears once the society links your login to it." />
      ) : (
        <div className="space-y-4">
          {units.map((u: any) => {
            const occupants = members.filter((m) => String(m.unitId?._id ?? m.unitId?.id ?? m.unitId) === String(u._id ?? u.id));
            return (
              <Card key={u._id ?? u.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">{u.code}</CardTitle>
                  <StatusBadge status={u.occupancyStatus} />
                </CardHeader>
                <CardContent className="space-y-4">
                  <KeyValue columns={3} items={[{ label: 'Floor', value: u.floor }, { label: 'Type', value: formatStatus(u.type) }, { label: 'Area', value: u.areaSqft ? `${formatNumber(u.areaSqft)} sq ft` : '—' }, { label: 'Occupants', value: occupants.map((m) => `${m.name} (${formatStatus(m.type)})`).join(', ') || '—', span: 3 }]} />
                  {MY_UNIT_SECTIONS.map((s) => (
                    <s.component key={s.key} unit={u} />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
