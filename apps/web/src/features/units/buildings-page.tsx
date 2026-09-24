import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/common/confirm-dialog';
import { SubscriptionGate } from '@/components/common/gates';
import { useBuildings, useCreateBuilding, useDeleteBuilding, useUpdateBuilding } from '@/hooks/use-units';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const TYPES = ['TOWER', 'BUILDING', 'WING', 'BLOCK', 'PHASE', 'STREET'];
const blank = { name: '', code: '', type: 'TOWER', floors: '0', parentId: '', notes: '' };

export default function BuildingsPage() {
  const buildings = useBuildings();
  const create = useCreateBuilding();
  const update = useUpdateBuilding();
  const remove = useDeleteBuilding();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [form, setForm] = React.useState<any>(blank);
  const open = (b: any | 'new') => { setEditing(b); setForm(b === 'new' ? blank : { name: b.name, code: b.code, type: b.type, floors: String(b.floors ?? 0), parentId: b.parentId ?? '', notes: b.notes ?? '' }); };
  const save = () => {
    const payload = { name: form.name, code: form.code, type: form.type, floors: Number(form.floors) || 0, parentId: form.parentId || null, notes: form.notes || undefined };
    const opts = { onSuccess: () => { toast.success(editing === 'new' ? 'Building added' : 'Building updated'); setEditing(null); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (editing === 'new') create.mutate(payload, opts);
    else update.mutate({ id: editing.id, ...payload }, opts);
  };
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Buildings" description="Towers, wings, blocks and phases. Nest wings under towers with the parent field." breadcrumbs={[{ label: 'Units', to: '/app/units' }, { label: 'Buildings' }]} actions={<SubscriptionGate><Button onClick={() => open('new')}><Plus /> Add building</Button></SubscriptionGate>} />
      <DataTable
        rows={buildings.data}
        loading={buildings.isLoading}
        error={buildings.error}
        onRetry={() => buildings.refetch()}
        rowKey={(b: any) => b.id}
        emptyTitle="No buildings yet"
        emptyDescription="Add your first tower, wing or block."
        columns={[
          { key: 'name', header: 'Building', cell: (b: any) => (<div><p className="font-medium">{b.name}</p><p className="text-xs text-muted-foreground">Code {b.code}{b.parentId ? ` · part of ${(buildings.data ?? []).find((x: any) => x.id === String(b.parentId))?.name ?? ''}` : ''}</p></div>) },
          { key: 'type', header: 'Type', cell: (b: any) => formatStatus(b.type) },
          { key: 'floors', header: 'Floors', cell: (b: any) => b.floors },
          { key: 'units', header: 'Units', cell: (b: any) => `${b.unitCount} (${b.occupiedCount} occupied)` },
          { key: 'status', header: 'Status', cell: (b: any) => <StatusBadge status={b.status} /> },
          { key: 'actions', header: '', cell: (b: any) => (
              <SubscriptionGate>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => open(b)} aria-label="Edit"><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete ${b.name}?`, description: b.unitCount ? `This building has ${b.unitCount} units; move or delete them first.` : 'This cannot be undone.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(b.id, { onSuccess: () => toast.success('Building deleted'), onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /></Button>
                </div>
              </SubscriptionGate>
            ) },
        ]}
      />
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add building' : `Edit ${editing?.name}`}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tower A" /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="A" /></div>
            <div className="space-y-1.5"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Floors</Label><Input type="number" min={0} value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Parent</Label><Select value={form.parentId || 'none'} onValueChange={(v) => setForm({ ...form, parentId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{(buildings.data ?? []).filter((b: any) => editing === 'new' || b.id !== editing?.id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.code} loading={create.isPending || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
