import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyValue } from '@/components/common/key-value';
import { StatusBadge } from '@/components/common/status-badge';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useBuildings, useDeleteUnit, useUnit, useUpdateUnit } from '@/hooks/use-units';
import { useCategories } from '@/hooks/use-society';
import { UnitForm, unitPayload } from '@/features/units/units-page';
import { formatDate, formatNumber, formatStatus, formatPhone } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Extension slot: modules (residents, billing, vehicles, parking…) register tabs here. */
export const UNIT_DETAIL_SECTIONS: { key: string; module: string; permission: string | string[]; component: React.ComponentType<{ unit: any }> }[] = [];

export default function UnitDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useUnit(id);
  const buildings = useBuildings();
  const unitTypes = useCategories('UNIT_TYPE');
  const update = useUpdateUnit();
  const remove = useDeleteUnit();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>(null);
  if (unit.isLoading) return <PageSkeleton />;
  if (unit.isError || !unit.data) return <ErrorState error={unit.error} onRetry={() => unit.refetch()} />;
  const u = unit.data;
  const openEdit = () => { setForm({ buildingId: u.buildingId?.id ?? u.buildingId?._id ?? '', type: u.type, floor: String(u.floor ?? 0), number: u.number, code: u.code, areaSqft: String(u.areaSqft ?? ''), bedrooms: u.bedrooms != null ? String(u.bedrooms) : '', openingBalance: String(u.openingBalance ?? 0) }); setEditing(true); };
  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title={u.code}
        description={`${u.buildingId?.name ?? 'No building'} · floor ${u.floor} · ${formatStatus(u.type)}`}
        breadcrumbs={[{ label: 'Units', to: '/app/units' }, { label: u.code }]}
        actions={
          <>
            <StatusBadge status={u.occupancyStatus} />
            <SubscriptionGate>
              <PermissionGate permission="units:update"><Button variant="outline" onClick={openEdit}><Pencil /> Edit</Button></PermissionGate>
              <PermissionGate permission="units:delete"><Button variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete unit ${u.code}?`, description: 'The unit is archived (soft deleted) and disappears from lists. Linked residents must be moved out first.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(id, { onSuccess: () => { toast.success('Unit deleted'); navigate('/app/units'); }, onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /> Delete</Button></PermissionGate>
            </SubscriptionGate>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
          <CardContent>
            <KeyValue columns={3} items={[{ label: 'Code', value: u.code }, { label: 'Number', value: u.number }, { label: 'Type', value: formatStatus(u.type) }, { label: 'Area', value: u.areaSqft ? `${formatNumber(u.areaSqft)} sq ft` : '—' }, { label: 'Bedrooms', value: u.bedrooms ?? '—' }, { label: 'Status', value: <StatusBadge status={u.status} /> }, { label: 'Opening balance', value: formatNumber(u.openingBalance ?? 0, 2) }, { label: 'Created', value: formatDate(u.createdAt) }, { label: 'Meters', value: u.meters?.length ? u.meters.map((m: any) => <Badge key={m.type} variant="secondary" className="mr-1">{m.type}{m.meterNumber ? ` · ${m.meterNumber}` : ''}</Badge>) : '—' }]} />
            {u.notes ? <p className="mt-3 text-sm text-muted-foreground">{u.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Occupants</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><p className="text-xs uppercase text-muted-foreground">Owner</p><p>{u.ownerResidentId?.name ?? 'Not assigned'}</p>{u.ownerResidentId?.phone ? <p className="text-xs text-muted-foreground">{formatPhone(u.ownerResidentId.phone)}</p> : null}</div>
            <div><p className="text-xs uppercase text-muted-foreground">Tenant</p><p>{u.tenantResidentId?.name ?? 'None'}</p>{u.tenantResidentId?.phone ? <p className="text-xs text-muted-foreground">{formatPhone(u.tenantResidentId.phone)}</p> : null}</div>
            <p className="text-xs text-muted-foreground">Owners, tenants and family members are managed from the Residents module.</p>
          </CardContent>
        </Card>
      </div>
      {UNIT_DETAIL_SECTIONS.map((s) => (
        <div key={s.key} className="mt-4"><s.component unit={u} /></div>
      ))}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Edit {u.code}</DialogTitle></DialogHeader>
          {form ? <UnitForm value={form} onChange={setForm} buildings={buildings.data ?? []} unitTypes={unitTypes.data ?? []} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button loading={update.isPending} onClick={() => update.mutate({ id, ...unitPayload(form) }, { onSuccess: () => { toast.success('Unit updated'); setEditing(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
