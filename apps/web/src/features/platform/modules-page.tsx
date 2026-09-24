import * as React from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { DynamicIcon } from '@/components/common/icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePlatformModules, useUpdatePlatformModule } from '@/hooks/use-platform';
import { formatStatus } from '@/lib/utils';

export default function PlatformModulesPage() {
  const modules = usePlatformModules();
  const update = useUpdatePlatformModule();
  const [editing, setEditing] = React.useState<any | null>(null);
  const [draft, setDraft] = React.useState<any>({});

  const open = (m: any) => {
    setEditing(m);
    setDraft({ name: m.name, description: m.description ?? '', icon: m.icon, status: m.status, sortOrder: m.sortOrder, navigation: (m.navigation ?? []).map((n: any) => ({ key: n.key, label: n.label, hidden: Boolean(n.hidden), sortOrder: n.sortOrder })) });
  };

  return (
    <div>
      <PageHeader title="Module catalogue" description="Global availability, naming and navigation of every module. Set a module INACTIVE to disable it for all societies without deleting data." />
      <DataTable
        rows={modules.data}
        loading={modules.isLoading}
        error={modules.error}
        rowKey={(m: any) => m.key}
        columns={[
          { key: 'name', header: 'Module', cell: (m: any) => (
              <div className="flex items-center gap-3">
                <DynamicIcon name={m.icon} className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{m.name} {m.isCore ? <Badge variant="muted" className="ml-1">Core</Badge> : null}</p>
                  <p className="text-xs text-muted-foreground">{m.key} · v{m.version}</p>
                </div>
              </div>
            ) },
          { key: 'scope', header: 'Scope', hideBelow: 'md', cell: (m: any) => formatStatus(m.scope) },
          { key: 'category', header: 'Category', hideBelow: 'md', cell: (m: any) => formatStatus(m.category) },
          { key: 'perms', header: 'Permissions', hideBelow: 'lg', cell: (m: any) => m.actions.length },
          { key: 'usage', header: 'Societies', hideBelow: 'lg', cell: (m: any) => (m.scope === 'SOCIETY' ? `${m.societyUsage.enabled} on / ${m.societyUsage.disabled} off` : '—') },
          { key: 'status', header: 'Status', cell: (m: any) => (
              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                {m.featureFlag ? <Badge variant="outline">flag: {m.featureFlag}</Badge> : null}
              </div>
            ) },
          { key: 'actions', header: '', cell: (m: any) => <Button variant="ghost" size="icon-sm" onClick={() => open(m)} aria-label="Edit"><Pencil /></Button> },
        ]}
      />
      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit {editing?.name}</SheetTitle>
            <SheetDescription>Permissions and dependencies are defined by the module registry; labels, status and navigation are editable here.</SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Icon (lucide name)</Label>
                  <Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sort order</Label>
                  <Input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['ACTIVE', 'BETA', 'INACTIVE'].map((s) => <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editing.isCore && draft.status === 'INACTIVE' ? <p className="text-xs text-destructive">Core modules must stay active.</p> : null}
              </div>
              {draft.navigation?.length ? (
                <div>
                  <p className="mb-2 text-sm font-semibold">Navigation items</p>
                  <div className="space-y-2">
                    {draft.navigation.map((n: any, i: number) => (
                      <div key={n.key} className="flex items-center gap-2 rounded-md border p-2">
                        <Input value={n.label} onChange={(e) => { const nav = [...draft.navigation]; nav[i] = { ...n, label: e.target.value }; setDraft({ ...draft, navigation: nav }); }} className="h-8" />
                        <Input type="number" value={n.sortOrder} onChange={(e) => { const nav = [...draft.navigation]; nav[i] = { ...n, sortOrder: Number(e.target.value) }; setDraft({ ...draft, navigation: nav }); }} className="h-8 w-20" aria-label="Order" />
                        <div className="flex items-center gap-1 text-xs">
                          <Switch checked={!n.hidden} onCheckedChange={(v) => { const nav = [...draft.navigation]; nav[i] = { ...n, hidden: !v }; setDraft({ ...draft, navigation: nav }); }} aria-label="Visible" /> visible
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <SheetFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button loading={update.isPending} disabled={editing.isCore && draft.status === 'INACTIVE'} onClick={() => update.mutate({ key: editing.key, ...draft }, { onSuccess: () => { toast.success('Module updated'); setEditing(null); } })}>Save</Button>
              </SheetFooter>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
