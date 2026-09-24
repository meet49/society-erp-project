import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Car, Pencil, Trash2, ParkingSquare } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDeleteVehicle, useOperationsRealtime, useVehicles } from '@/hooks/use-operations';
import { useHousehold } from '@/hooks/use-residents';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { VehicleDialog } from '@/features/operations/vehicles-page';

/** Resident view: my household's vehicles, stickers and parking. */
export default function MyVehiclesPage() {
  const vehicles = useVehicles({ limit: 50 });
  const household = useHousehold();
  const remove = useDeleteVehicle();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useOperationsRealtime();
  const items: any[] = vehicles.data?.items ?? [];
  const unitOptions = (household.data?.units ?? []).map((u: any) => ({ value: u.id, label: u.code }));
  return (
    <div>
      <PageHeader title="My vehicles" description="Registered vehicles get a sticker from the office and are recognised at the gate." actions={<PermissionGate permission="vehicles:create_own"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Register vehicle</Button></SubscriptionGate></PermissionGate>} />
      {vehicles.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<Car />} title="No vehicles yet" description="Register your car or two-wheeler so the guards know it belongs here." action={<Button onClick={() => setEditing('new')}><Plus /> Register vehicle</Button>} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Car /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-lg font-semibold">{v.number}</p>
                  <p className="text-sm text-muted-foreground">{[formatStatus(v.type), v.make, v.model, v.color].filter(Boolean).join(' · ')} · {v.unitId?.code}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">{v.stickerNumber ? <Badge variant="success">Sticker {v.stickerNumber}</Badge> : <Badge variant="outline">Sticker pending</Badge>}{v.parkingSlotId?.code ? <Badge variant="info"><ParkingSquare className="mr-1 h-3 w-3" />{v.parkingSlotId.code}</Badge> : null}</p>
                </div>
                <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(v)}><Pencil /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Remove ${v.number}?`, description: 'Its parking slot is released.', destructive: true, confirmLabel: 'Remove' })) remove.mutate(v.id, { onSuccess: () => toast.success('Removed'), onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /></Button></span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <VehicleDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} vehicle={editing === 'new' ? null : editing} unitOptions={unitOptions} member />
      {ConfirmElement}
    </div>
  );
}
