import * as React from 'react';
import { toast } from 'sonner';
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2 } from 'lucide-react';
import { CategoryTypes } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/common/loading-state';
import { DynamicIcon } from '@/components/common/icon';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useCategories, useCreateCategory, useDeleteCategory, useReorderCategories, useUpdateCategory } from '@/hooks/use-society';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const LABELS: Record<string, string> = { COMPLAINT_CATEGORY: 'Complaint categories', VISITOR_CATEGORY: 'Visitor categories', STAFF_CATEGORY: 'Staff categories', VENDOR_CATEGORY: 'Vendor categories', EXPENSE_CATEGORY: 'Expense categories', ASSET_CATEGORY: 'Asset categories', INVENTORY_CATEGORY: 'Inventory categories', DOMESTIC_HELP_TYPE: 'Domestic help types', UNIT_TYPE: 'Unit types', DOCUMENT_CATEGORY: 'Document categories', FUND_TYPE: 'Fund types', INCIDENT_TYPE: 'Incident types', EVENT_TYPE: 'Event types', AMENITY_TYPE: 'Amenity types', NOTICE_CATEGORY: 'Notice categories', COMMITTEE_POSITION: 'Committee positions' };

export default function CategoriesPage() {
  const [type, setType] = React.useState<string>('COMPLAINT_CATEGORY');
  const categories = useCategories(type, true);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const reorder = useReorderCategories();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [draft, setDraft] = React.useState({ name: '', description: '', color: '', icon: '', ledgerAccountCode: '' });
  const list = categories.data ?? [];
  const open = (c: any | 'new') => { setEditing(c); setDraft(c === 'new' ? { name: '', description: '', color: '', icon: '', ledgerAccountCode: '' } : { name: c.name, description: c.description ?? '', color: c.color ?? '', icon: c.icon ?? '', ledgerAccountCode: c.metadata?.ledgerAccountCode ?? '' }); };
  const move = (i: number, dir: -1 | 1) => { const ids = list.map((c: any) => c.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate({ type, orderedIds: ids }); };
  const save = () => {
    const payload: any = { name: draft.name, description: draft.description || undefined, color: draft.color || undefined, icon: draft.icon || undefined, metadata: type === 'EXPENSE_CATEGORY' ? { ledgerAccountCode: draft.ledgerAccountCode } : undefined };
    const opts = { onSuccess: () => { toast.success('Saved'); setEditing(null); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (editing === 'new') create.mutate({ type, ...payload }, opts);
    else update.mutate({ type, id: editing.id, ...payload }, opts);
  };
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Categories" description="Configurable lists used across modules: complaint categories, visitor types, staff and vendor categories, expense heads and more." actions={<Button onClick={() => open('new')}><Plus /> Add</Button>} />
      <SettingsNav />
      <div className="mb-4 max-w-sm">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CategoryTypes.map((t) => <SelectItem key={t} value={t}>{LABELS[t] ?? formatStatus(t)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {categories.isLoading ? (
        <TableSkeleton />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {list.map((c: any, i: number) => (
            <li key={c.id} className="flex items-center gap-3 p-3">
              <div className="flex gap-0.5">
                <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down"><ArrowDown /></Button>
              </div>
              <DynamicIcon name={c.icon} className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.name} <span className="text-xs text-muted-foreground">({c.key})</span> {c.isSystem ? <Badge variant="muted" className="ml-1">System</Badge> : null}</p>
                <p className="text-xs text-muted-foreground">{c.description}{c.metadata?.ledgerAccountCode ? ` · ledger ${c.metadata.ledgerAccountCode}` : ''}</p>
              </div>
              <label className="flex items-center gap-1 text-xs"><Switch checked={c.isActive} disabled={c.isSystem} onCheckedChange={(v) => update.mutate({ type, id: c.id, isActive: v }, { onError: (e) => toast.error(getErrorMessage(e)) })} /> active</label>
              <Button variant="ghost" size="icon-sm" onClick={() => open(c)} aria-label="Edit"><Pencil /></Button>
              {!c.isSystem ? <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Remove ${c.name}?`, description: 'Existing records keep the category; it is hidden from new entries.', destructive: true, confirmLabel: 'Remove' })) remove.mutate({ type, id: c.id }, { onSuccess: () => toast.success('Category removed') }); }}><Trash2 /></Button> : null}
            </li>
          ))}
          {!list.length ? <li className="p-6 text-center text-sm text-muted-foreground">No categories yet.</li> : null}
        </ul>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{editing === 'new' ? `New ${LABELS[type]?.replace(/s$/, '').toLowerCase()}` : `Edit ${editing?.name}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Icon (lucide)</Label><Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Colour</Label><Input value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} placeholder="sky, amber…" /></div>
            </div>
            {type === 'EXPENSE_CATEGORY' ? <div className="space-y-1.5"><Label>Ledger account code</Label><Input value={draft.ledgerAccountCode} onChange={(e) => setDraft({ ...draft, ledgerAccountCode: e.target.value })} placeholder="e.g. 5300" /></div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!draft.name.trim()} loading={create.isPending || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
