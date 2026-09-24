import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Mail, Copy, KeyRound, LogOut, RefreshCw, X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useConfirm } from '@/components/common/confirm-dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { useAssignUserRoles, useCreateSocietyUser, useInvitations, useInviteUser, useResendInvitation, useResetUserPassword, useRevokeInvitation, useRevokeUserSessions, useRoles, useSetDirectPermissions, useSetUserStatus, useSocietyUser, useSocietyUsers, useUpdateSocietyUser } from '@/hooks/use-society';
import { useAuth } from '@/hooks/use-auth';
import { formatDate, formatDateTime, formatRelative } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

function RolePicker({ roles, value, onChange }: { roles: any[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {roles.filter((r) => r.status === 'ACTIVE').map((r) => (
        <label key={r.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
          <Checkbox className="mt-0.5" checked={value.includes(r.id)} onCheckedChange={(v) => onChange(v ? [...value, r.id] : value.filter((x) => x !== r.id))} />
          <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted-foreground">{r.description}</span></span>
        </label>
      ))}
    </div>
  );
}

function AddUserDialog({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: any[] }) {
  const invite = useInviteUser();
  const create = useCreateSocietyUser();
  const [mode, setMode] = React.useState<'invite' | 'create'>('invite');
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', password: '', roleIds: [] as string[], message: '' });
  const [result, setResult] = React.useState<any>(null);
  const reset = () => { setForm({ name: '', email: '', phone: '', password: '', roleIds: [], message: '' }); setResult(null); };
  const submit = () => {
    const onError = (e: unknown) => toast.error(getErrorMessage(e));
    if (mode === 'invite') invite.mutate({ email: form.email, name: form.name || undefined, phone: form.phone || undefined, roleIds: form.roleIds, message: form.message || undefined }, { onSuccess: (d) => { toast.success('Invitation sent'); setResult({ invite: d }); }, onError });
    else create.mutate({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password || undefined, roleIds: form.roleIds }, { onSuccess: (d) => { toast.success('User created'); setResult({ created: d }); }, onError });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>Invite by email (they choose their password) or create the account directly with a temporary password.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            {result.invite ? (
              <div className="rounded-md border bg-muted p-3">
                <p>Invitation emailed to <strong>{result.invite.email}</strong>, valid until {formatDate(result.invite.expiresAt)}.</p>
                {result.invite.inviteUrl ? <p className="mt-2 break-all text-xs text-muted-foreground">Dev link: {result.invite.inviteUrl}</p> : null}
              </div>
            ) : (
              <div className="rounded-md border bg-muted p-3">
                <p>Account created for <strong>{result.created.user.email}</strong>.</p>
                {result.created.tempPassword ? <div className="mt-2 flex items-center gap-2"><span className="text-xs text-muted-foreground">Temporary password:</span><code className="font-mono">{result.created.tempPassword}</code><Button variant="ghost" size="icon-sm" onClick={() => { void navigator.clipboard.writeText(result.created.tempPassword); toast.success('Copied'); }} aria-label="Copy"><Copy /></Button></div> : null}
              </div>
            )}
            <DialogFooter><Button onClick={() => { onClose(); reset(); }}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList><TabsTrigger value="invite">Send invitation</TabsTrigger><TabsTrigger value="create">Create directly</TabsTrigger></TabsList>
            </Tabs>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="user-name">Name{mode === 'create' ? ' *' : ''}</Label><Input id="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="user-email">Email *</Label><Input id="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              {mode === 'create' ? <div className="space-y-1.5"><Label htmlFor="user-password">Password (optional)</Label><Input id="user-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave empty to generate" /></div> : <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="user-message">Message (optional)</Label><Textarea id="user-message" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>}
            </div>
            <div><Label className="mb-2 block">Roles *</Label><RolePicker roles={roles} value={form.roleIds} onChange={(ids) => setForm({ ...form, roleIds: ids })} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
              <Button onClick={submit} loading={invite.isPending || create.isPending} disabled={!form.email || !form.roleIds.length || (mode === 'create' && !form.name)}>{mode === 'invite' ? 'Send invitation' : 'Create user'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserDetail({ userId, roles, onClose }: { userId: string; roles: any[]; onClose: () => void }) {
  const detail = useSocietyUser(userId);
  const assign = useAssignUserRoles();
  const setStatus = useSetUserStatus();
  const update = useUpdateSocietyUser();
  const setPerms = useSetDirectPermissions();
  const revoke = useRevokeUserSessions();
  const resetPw = useResetUserPassword();
  const { user: me } = useAuth();
  const { confirm, ConfirmElement } = useConfirm();
  const [temp, setTemp] = React.useState<string | null>(null);
  const [allow, setAllow] = React.useState('');
  const [deny, setDeny] = React.useState('');
  const d = detail.data;
  React.useEffect(() => { if (d) { setAllow((d.directPermissions?.allow ?? []).join(', ')); setDeny((d.directPermissions?.deny ?? []).join(', ')); } }, [d]);
  if (!d) return null;
  const isSelf = d.user.id === me?.id;
  const roleIds = d.roles.map((r: any) => r.id ?? r._id);
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <div className="space-y-5">
      {ConfirmElement}
      <div className="flex items-center gap-3">
        <UserAvatar name={d.user.name} src={d.user.avatarUrl} className="h-12 w-12" />
        <div className="min-w-0">
          <p className="font-semibold">{d.user.name} {isSelf ? <Badge variant="info">You</Badge> : null}</p>
          <p className="text-xs text-muted-foreground">{d.user.email}{d.user.phone ? ` · ${d.user.phone}` : ''}</p>
        </div>
        <div className="ml-auto"><StatusBadge status={d.membership.status} /></div>
      </div>
      <Tabs defaultValue="roles">
        <TabsList><TabsTrigger value="roles">Roles</TabsTrigger><TabsTrigger value="access">Effective access</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
        <TabsContent value="roles" className="space-y-4">
          <RolePicker roles={roles} value={roleIds} onChange={(ids) => assign.mutate({ userId, roleIds: ids }, { onSuccess: () => toast.success('Roles updated'), onError: err })} />
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">Direct permission overrides</p>
            <p className="mb-2 text-xs text-muted-foreground">Comma-separated permission keys added to (allow) or removed from (deny) this user regardless of roles.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Allow</Label><Input value={allow} onChange={(e) => setAllow(e.target.value)} placeholder="billing:export, reports:view" /></div>
              <div className="space-y-1"><Label className="text-xs">Deny</Label><Input value={deny} onChange={(e) => setDeny(e.target.value)} placeholder="units:delete" /></div>
            </div>
            <Button size="sm" variant="outline" className="mt-2" loading={setPerms.isPending} onClick={() => setPerms.mutate({ userId, allow: allow.split(',').map((s) => s.trim()).filter(Boolean), deny: deny.split(',').map((s) => s.trim()).filter(Boolean) }, { onSuccess: () => toast.success('Overrides saved'), onError: err })}>Save overrides</Button>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div><p className="font-medium">Membership label</p><p className="text-xs text-muted-foreground">Shown in lists, e.g. "Tower A rep"</p></div>
            <Input defaultValue={d.membership.label ?? ''} className="h-8 w-48" onBlur={(e) => e.target.value !== (d.membership.label ?? '') && update.mutate({ userId, label: e.target.value })} />
          </div>
        </TabsContent>
        <TabsContent value="access" className="space-y-3">
          <KeyValue columns={1} items={[{ label: 'Accessible modules', value: <div className="flex flex-wrap gap-1">{d.accessibleModules.map((m: string) => <Badge key={m} variant="secondary">{m}</Badge>)}</div> }, { label: `Effective permissions (${d.effectivePermissions.length})`, value: <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">{d.effectivePermissions.map((p: string) => <code key={p} className="rounded bg-muted px-1 text-[11px]">{p}</code>)}</div> }]} />
        </TabsContent>
        <TabsContent value="security" className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div><p className="font-medium">Access to this society</p><p className="text-xs text-muted-foreground">Deactivating signs the user out immediately. Data they created is kept.</p></div>
            <Switch checked={d.membership.status === 'ACTIVE'} disabled={isSelf} onCheckedChange={async (v) => { if (!v && !(await confirm({ title: `Deactivate ${d.user.name}?`, destructive: true, confirmLabel: 'Deactivate' }))) return; setStatus.mutate({ userId, status: v ? 'ACTIVE' : 'INACTIVE' }, { onSuccess: () => toast.success(v ? 'Reactivated' : 'Deactivated'), onError: err }); }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => revoke.mutate(userId, { onSuccess: () => toast.success('Sessions revoked') })}><LogOut /> Sign out everywhere</Button>
            {!isSelf ? <Button variant="outline" size="sm" loading={resetPw.isPending} onClick={async () => { if (await confirm({ title: 'Reset password?', description: 'A temporary password is generated and all sessions are signed out.', destructive: true, confirmLabel: 'Reset' })) resetPw.mutate(userId, { onSuccess: (r) => setTemp(r.tempPassword), onError: err }); }}><KeyRound /> Reset password</Button> : null}
          </div>
          {temp ? <div className="rounded-md border bg-muted p-3 text-sm"><span className="text-xs text-muted-foreground">Temporary password:</span> <code className="font-mono">{temp}</code></div> : null}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Login history</p>
            <ul className="space-y-1 text-xs">
              {d.loginHistory.map((s: any) => <li key={s.familyId + s.createdAt} className="flex justify-between gap-2"><span className="truncate">{s.userAgent ?? 'Unknown device'} · {s.ip ?? ''}</span><span className="shrink-0 text-muted-foreground">{formatDateTime(s.createdAt)}{s.revokedAt ? ' · revoked' : ''}</span></li>)}
              {!d.loginHistory.length ? <li className="text-muted-foreground">No logins yet.</li> : null}
            </ul>
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <ul className="space-y-1 text-sm">
            {d.activity.map((a: any) => <li key={a.id ?? a._id} className="flex justify-between gap-2"><code className="text-xs">{a.action}</code><span className="text-xs text-muted-foreground">{formatRelative(a.createdAt)}</span></li>)}
            {!d.activity.length ? <li className="text-muted-foreground">No activity yet.</li> : null}
          </ul>
        </TabsContent>
      </Tabs>
      <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  );
}

export default function UsersPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const list = useListState();
  const users = useSocietyUsers(list.params);
  const roles = useRoles();
  const invitations = useInvitations('PENDING');
  const resend = useResendInvitation();
  const revokeInvite = useRevokeInvitation();
  const [adding, setAdding] = React.useState(false);
  return (
    <div>
      <PageHeader title="Users" description="Committee, staff, guards and residents with login access." actions={<Button onClick={() => setAdding(true)}><Plus /> Add user</Button>} />
      <SettingsNav />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, email, phone…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.roleId ?? ''} onChange={(v) => list.setFilter('roleId', v)} options={(roles.data ?? []).map((r: any) => ({ value: r.id, label: r.name }))} allLabel="Any role" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} allLabel="Any status" />
      </FilterBar>
      <DataTable
        rows={users.data?.items}
        loading={users.isFetching}
        error={users.error}
        onRetry={() => users.refetch()}
        rowKey={(m: any) => m.id}
        onRowClick={(m: any) => navigate(`/app/settings/users/${m.user.id ?? m.user._id ?? m.userId}`)}
        columns={[
          { key: 'user', header: 'User', cell: (m: any) => (<div className="flex items-center gap-3"><UserAvatar name={m.user.name} src={m.user.avatarUrl} /><div><p className="font-medium">{m.user.name}</p><p className="text-xs text-muted-foreground">{m.user.email}</p></div></div>) },
          { key: 'roles', header: 'Roles', cell: (m: any) => <div className="flex flex-wrap gap-1">{m.roles.map((r: any) => <Badge key={r.id ?? r._id} variant="secondary">{r.name}</Badge>)}</div> },
          { key: 'label', header: 'Label', hideBelow: 'lg', cell: (m: any) => m.label ?? '—' },
          { key: 'status', header: 'Status', cell: (m: any) => <StatusBadge status={m.status} /> },
          { key: 'last', header: 'Last login', hideBelow: 'md', cell: (m: any) => (m.user.lastLoginAt ? formatRelative(m.user.lastLoginAt) : 'Never') },
        ]}
        pagination={users.data ? { page: users.data.page, pages: users.data.pages, total: users.data.total, limit: users.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      {(invitations.data ?? []).length ? (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {invitations.data!.map((i: any) => (
              <li key={i.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="font-medium">{i.name ?? i.email} <span className="text-xs text-muted-foreground">{i.email}</span></p><p className="text-xs text-muted-foreground">{(i.roleIds ?? []).map((r: any) => r.name).join(', ')} · expires {formatDate(i.expiresAt)} · sent {formatRelative(i.lastSentAt)}</p></div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => resend.mutate(i.id, { onSuccess: () => toast.success('Invitation resent') })}><RefreshCw /> Resend</Button>
                  <Button variant="ghost" size="sm" onClick={() => revokeInvite.mutate(i.id, { onSuccess: () => toast.success('Invitation revoked') })}><X /> Revoke</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <AddUserDialog open={adding} onClose={() => setAdding(false)} roles={roles.data ?? []} />
      <Sheet open={Boolean(userId)} onOpenChange={(o) => !o && navigate('/app/settings/users')}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader><SheetTitle>User details</SheetTitle><SheetDescription><Mail className="mr-1 inline h-3 w-3" />Roles, effective access and security.</SheetDescription></SheetHeader>
          <div className="mt-6">{userId ? <UserDetail userId={userId} roles={roles.data ?? []} onClose={() => navigate('/app/settings/users')} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
