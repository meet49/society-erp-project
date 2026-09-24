import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Copy, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/icon';
import { useCloneRole, useCreateRole, useDeleteRole, usePermissionCatalog, useRoles, useUpdateRole } from '@/hooks/use-society';
import { getErrorMessage } from '@/lib/errors';
import { cn, formatStatus } from '@/lib/utils';

function RoleEditor({ role, onClose }: { role: any | 'new'; onClose: () => void }) {
  const catalog = usePermissionCatalog();
  const create = useCreateRole();
  const update = useUpdateRole();
  const isNew = role === 'new';
  const [name, setName] = React.useState(isNew ? '' : role.name);
  const [description, setDescription] = React.useState(isNew ? '' : role.description ?? '');
  const [landing, setLanding] = React.useState(isNew ? 'ADMIN' : role.landing);
  const [permissions, setPermissions] = React.useState<Set<string>>(new Set(isNew ? [] : role.permissions));
  const [filter, setFilter] = React.useState('');
  const locked = !isNew && role.grantsAllPermissions;
  const togglePerm = (key: string, on: boolean) => setPermissions((prev) => { const next = new Set(prev); if (on) next.add(key); else next.delete(key); return next; });
  const toggleModule = (keys: string[], on: boolean) => setPermissions((prev) => { const next = new Set(prev); keys.forEach((k) => (on ? next.add(k) : next.delete(k))); return next; });
  const submit = () => {
    const payload = { name, description, landing, permissions: [...permissions] };
    const opts = { onSuccess: () => { toast.success(isNew ? 'Role created' : 'Role updated'); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (isNew) create.mutate(payload, opts);
    else update.mutate({ id: role.id, ...(locked ? { name, description } : payload) }, opts);
  };
  const modules = (catalog.data ?? []).filter((m: any) => !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.permissions.some((p: any) => p.label.toLowerCase().includes(filter.toLowerCase())));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label>Role name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Treasurer" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Landing experience</Label>
          <Select value={landing} onValueChange={setLanding} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ADMIN">Society console</SelectItem>
              <SelectItem value="MEMBER">Resident self-service</SelectItem>
              <SelectItem value="GUARD">Guard gate app</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {locked ? (
        <p className="rounded-md bg-accent p-3 text-sm text-accent-foreground">The Society Admin role automatically holds every permission of every module available to your society. Only its name and description can be changed.</p>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Permissions <span className="text-xs font-normal text-muted-foreground">({permissions.size} selected)</span></p>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="h-8 w-40" />
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {catalog.isLoading ? <TableSkeleton rows={4} cols={2} /> : null}
            {modules.map((m: any) => {
              const keys = m.permissions.map((p: any) => p.key);
              const all = keys.every((k: string) => permissions.has(k));
              const some = keys.some((k: string) => permissions.has(k));
              return (
                <div key={m.module} className={cn('rounded-md border p-3', !m.accessible && 'opacity-70')}>
                  <div className="mb-2 flex items-center gap-2">
                    <Checkbox checked={all ? true : some ? 'indeterminate' : false} onCheckedChange={(v) => toggleModule(keys, v === true)} aria-label={`All ${m.name} permissions`} />
                    <DynamicIcon name={m.icon} className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">{m.name}</p>
                    {!m.inPlan ? <Badge variant="warning">Not in plan</Badge> : !m.enabledBySociety ? <Badge variant="muted">Disabled</Badge> : null}
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {m.permissions.map((p: any) => (
                      <label key={p.key} className="flex items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/60">
                        <Checkbox className="mt-0.5" checked={permissions.has(p.key)} onCheckedChange={(v) => togglePerm(p.key, v === true)} />
                        <span>
                          {p.label}
                          {p.ownScope ? <span className="ml-1 text-[10px] uppercase text-muted-foreground">own</span> : null}
                          <span className="block text-[11px] text-muted-foreground">{p.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Permissions for modules outside your plan or disabled are stored but only take effect once the module becomes available.</p>
        </div>
      )}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!name.trim()}>{isNew ? 'Create role' : 'Save role'}</Button>
      </SheetFooter>
    </div>
  );
}

export default function RolesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const roles = useRoles();
  const remove = useDeleteRole();
  const clone = useCloneRole();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<any | null>(null);
  const [reassign, setReassign] = React.useState('');
  React.useEffect(() => {
    if (id && roles.data) setEditing(roles.data.find((r: any) => r.id === id) ?? null);
  }, [id, roles.data]);
  if (roles.isError) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />;
  const close = () => { setEditing(null); if (id) navigate('/app/settings/roles'); };
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Roles & permissions" description="Default roles are a starting point. Create roles like Treasurer, Facility Manager or Auditor with exactly the permissions they need." actions={<Button onClick={() => setEditing('new')}><Plus /> New role</Button>} />
      <SettingsNav />
      {roles.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(roles.data ?? []).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{r.name}</p>
                      {r.isSystem ? <Badge variant="muted">Default</Badge> : <Badge variant="info">Custom</Badge>}
                      <Badge variant="outline">{formatStatus(r.landing)}</Badge>
                      {r.status === 'INACTIVE' ? <Badge variant="destructive">Inactive</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" /> {r.memberCount} member{r.memberCount === 1 ? '' : 's'} · {r.grantsAllPermissions ? 'all permissions' : `${r.permissions.length} permissions`}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/app/settings/roles/${r.id}`)}>Edit</Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Clone" onClick={async () => { const ok = await confirm({ title: `Clone ${r.name}?`, description: 'Creates a copy you can customise.', confirmLabel: 'Clone' }); if (ok) clone.mutate({ id: r.id, name: `${r.name} copy` }, { onSuccess: () => toast.success('Role cloned') }); }}><Copy /></Button>
                    {!r.isSystem ? <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDeleting(r)}><Trash2 /></Button> : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && close()}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editing === 'new' ? 'New role' : `Edit ${editing?.name ?? ''}`}</SheetTitle>
            <SheetDescription>Changes apply to every user holding this role immediately.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">{editing ? <RoleEditor key={editing === 'new' ? 'new' : editing.id} role={editing} onClose={close} /> : null}</div>
        </SheetContent>
      </Sheet>
      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle></DialogHeader>
          {deleting?.memberCount > 0 ? (
            <div className="space-y-2 text-sm">
              <p>{deleting.memberCount} user(s) hold this role. Choose the role they should get instead.</p>
              <Select value={reassign} onValueChange={setReassign}>
                <SelectTrigger><SelectValue placeholder="Reassign to…" /></SelectTrigger>
                <SelectContent>{(roles.data ?? []).filter((r: any) => r.id !== deleting.id).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : <p className="text-sm text-muted-foreground">No users hold this role.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" loading={remove.isPending} disabled={deleting?.memberCount > 0 && !reassign} onClick={() => remove.mutate({ id: deleting.id, reassignToRoleId: reassign || undefined }, { onSuccess: () => { toast.success('Role deleted'); setDeleting(null); setReassign(''); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
