import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Copy } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useCreatePlatformUser, usePlatformUsers, useSetPlatformUserRoles } from '@/hooks/use-platform';
import { useAuth } from '@/hooks/use-auth';
import { formatDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export default function PlatformUsersPage() {
  const users = usePlatformUsers();
  const create = useCreatePlatformUser();
  const setRoles = useSetPlatformUserRoles();
  const { user: me } = useAuth();
  const { confirm, ConfirmElement } = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: '', email: '', roleKeys: ['SUPER_ADMIN'] as string[] });
  const [temp, setTemp] = React.useState<string | null>(null);
  const roles = users.data?.meta.roles ?? [];

  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Platform users" description="People who operate the SaaS console. Roles are database-driven; SUPER_ADMIN holds every platform permission." breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Platform users' }]} actions={<Button onClick={() => setOpen(true)}><Plus /> Add platform user</Button>} />
      <DataTable
        rows={users.data?.data}
        loading={users.isLoading}
        error={users.error}
        rowKey={(u: any) => u.id}
        columns={[
          { key: 'user', header: 'User', cell: (u: any) => (<div><p className="font-medium">{u.name} {u.id === me?.id ? <Badge variant="info" className="ml-1">You</Badge> : null}</p><p className="text-xs text-muted-foreground">{u.email}</p></div>) },
          { key: 'roles', header: 'Roles', cell: (u: any) => (
              <div className="flex flex-wrap gap-2">
                {roles.map((r: any) => {
                  const on = u.roles.some((x: any) => x.key === r.key);
                  return (
                    <label key={r.key} className="flex items-center gap-1 text-xs">
                      <Checkbox checked={on} onCheckedChange={async (v) => { const next = v ? [...u.roles.map((x: any) => x.key), r.key] : u.roles.map((x: any) => x.key).filter((k: string) => k !== r.key); if (!next.length && !(await confirm({ title: 'Remove all platform access?', description: `${u.name} will lose access to the console.`, destructive: true, confirmLabel: 'Remove' }))) return; setRoles.mutate({ userId: u.id, roleKeys: next }, { onSuccess: () => toast.success('Roles updated'), onError: (e) => toast.error(getErrorMessage(e)) }); }} />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            ) },
          { key: 'status', header: 'Status', cell: (u: any) => <StatusBadge status={u.status} /> },
          { key: 'last', header: 'Last login', hideBelow: 'md', cell: (u: any) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never') },
        ]}
      />
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTemp(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add platform user</DialogTitle>
            <DialogDescription>A temporary password is generated; the user must change it on first login.</DialogDescription>
          </DialogHeader>
          {temp ? (
            <div className="rounded-md border bg-muted p-3 text-sm">
              <p className="text-xs text-muted-foreground">Temporary password (shown once)</p>
              <div className="mt-1 flex items-center gap-2"><code className="font-mono">{temp}</code><Button variant="ghost" size="icon-sm" onClick={() => { void navigator.clipboard.writeText(temp); toast.success('Copied'); }} aria-label="Copy"><Copy /></Button></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Roles</Label>
                {roles.map((r: any) => (
                  <label key={r.key} className="flex items-center gap-2 text-sm"><Checkbox checked={draft.roleKeys.includes(r.key)} onCheckedChange={(v) => setDraft({ ...draft, roleKeys: v ? [...draft.roleKeys, r.key] : draft.roleKeys.filter((k) => k !== r.key) })} /> {r.name}</label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {!temp ? <Button loading={create.isPending} disabled={!draft.name || !draft.email || !draft.roleKeys.length} onClick={() => create.mutate(draft, { onSuccess: (d) => { toast.success('User added'); setTemp(d.tempPassword ?? 'Existing account attached'); setDraft({ name: '', email: '', roleKeys: ['SUPER_ADMIN'] }); } })}>Create</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
