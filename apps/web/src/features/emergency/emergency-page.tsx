import * as React from 'react';
import { toast } from 'sonner';
import { Siren, Megaphone, Timer, AlertOctagon, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Send } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { CardSkeleton } from '@/components/common/loading-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBroadcast, useCreateContact, useDeleteContact, useEmergencyActive, useEmergencyAlerts, useEmergencyContacts, useEmergencySettings, useEmergencyStats, useReorderContacts, useSaveEmergencySettings, useSecurityRealtime, useUpdateContact } from '@/hooks/use-security';
import { useRoles } from '@/hooks/use-society';
import { ALL_AUDIENCE, useAudiencePreview, type AudienceValue } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { useAuth } from '@/hooks/use-auth';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from '@/features/community/audience-picker';
import { AlertCard, SOS_CATEGORIES } from './emergency-shared';

const CONTACT_CATEGORIES = ['POLICE', 'FIRE', 'AMBULANCE', 'HOSPITAL', 'ELECTRICITY', 'WATER', 'GAS', 'SECURITY', 'COMMITTEE', 'MAINTENANCE', 'OTHER'];

function AlertsTab() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const active = useEmergencyActive();
  const list = useListState({ limit: 20, sort: '-createdAt' });
  const history = useEmergencyAlerts(list.params);
  const live = [...(active.data?.sos ?? []), ...(active.data?.broadcasts ?? [])];
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold">Live now <Badge variant={live.length ? 'destructive' : 'muted'}>{live.length}</Badge></h2>
        {active.isLoading ? <CardSkeleton count={1} /> : live.length ? <div className="grid gap-3 lg:grid-cols-2">{live.map((a: any) => <AlertCard key={a.id} alert={a} canRespond={can('emergency:respond') || (a.kind === 'BROADCAST' && can('emergency:broadcast'))} ownUserId={user?.id} />)}</div> : <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No active SOS or emergency notice. Good.</p>}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        <FilterBar onReset={list.reset}>
          <FilterSelect value={list.filters.kind ?? ''} onChange={(v) => list.setFilter('kind', v)} options={[{ value: 'SOS', label: 'SOS' }, { value: 'BROADCAST', label: 'Broadcasts' }]} allLabel="All alerts" />
          <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM', 'EXPIRED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        </FilterBar>
        <DataTable
          rows={history.data?.items}
          loading={history.isFetching}
          error={history.error}
          onRetry={() => history.refetch()}
          rowKey={(a: any) => a.id}
          emptyTitle="No alerts yet"
          columns={[
            { key: 'alert', header: 'Alert', cell: (a: any) => <span><span className="font-medium">{a.kind === 'SOS' ? `${formatStatus(a.category)} SOS` : a.title}</span><span className="block text-xs text-muted-foreground">{a.alertNumber} · {a.kind === 'SOS' ? `${a.raisedBy?.name ?? ''}${a.unitId?.code ? ` · ${a.unitId.code}` : ''}${a.location ? ` · ${a.location}` : ''}` : a.audienceSummary}</span></span> },
            { key: 'createdAt', header: 'Raised', hideBelow: 'md', cell: (a: any) => formatDateTime(a.createdAt) },
            { key: 'response', header: 'Response', hideBelow: 'lg', cell: (a: any) => a.kind === 'SOS' ? (a.acknowledgedAt ? `${a.acknowledgedBy?.name ?? ''} in ${Math.max(1, Math.round((new Date(a.acknowledgedAt).getTime() - new Date(a.createdAt).getTime()) / 60000))} min` : '—') : `${a.notifiedCount ?? 0} notified` },
            { key: 'status', header: 'Status', cell: (a: any) => <StatusBadge status={a.status} /> },
          ]}
          pagination={history.data ? { page: history.data.page, pages: history.data.pages, total: history.data.total, limit: history.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
        />
      </section>
    </div>
  );
}

function ContactsTab() {
  const contacts = useEmergencyContacts();
  const create = useCreateContact();
  const update = useUpdateContact();
  const remove = useDeleteContact();
  const reorder = useReorderContacts();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [form, setForm] = React.useState({ name: '', phone: '', altPhone: '', category: 'OTHER', address: '', notes: '' });
  React.useEffect(() => { if (editing) setForm(editing === 'new' ? { name: '', phone: '', altPhone: '', category: 'OTHER', address: '', notes: '' } : { name: editing.name, phone: editing.phone, altPhone: editing.altPhone ?? '', category: editing.category, address: editing.address ?? '', notes: editing.notes ?? '' }); }, [editing]);
  const items: any[] = contacts.data ?? [];
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const move = (i: number, dir: -1 | 1) => { const ids = items.map((c) => c.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids, { onError: err }); };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Shown to residents and guards as click-to-call numbers, in this order.</p><Button size="sm" onClick={() => setEditing('new')}><Plus /> Contact</Button></div>
      {contacts.isLoading ? <CardSkeleton count={2} /> : <ul className="divide-y rounded-lg border bg-card">{items.map((c, i) => <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"><span className="flex flex-col"><Button size="sm" variant="ghost" className="h-5 px-1" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="h-5 px-1" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></Button></span><span className="min-w-0 flex-1"><span className="font-medium">{c.name}</span> <Badge variant="outline">{formatStatus(c.category)}</Badge>{!c.isActive ? <Badge variant="muted" className="ml-1">Hidden</Badge> : null}<span className="block text-xs text-muted-foreground">{c.phone}{c.altPhone ? ` / ${c.altPhone}` : ''}{c.notes ? ` · ${c.notes}` : ''}{c.address ? ` · ${c.address}` : ''}</span></span><label className="flex items-center gap-1 text-xs"><Switch checked={c.isActive} onCheckedChange={(v) => update.mutate({ id: c.id, isActive: v }, { onError: err })} /> Shown</label><Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Remove ${c.name}?`, destructive: true, confirmLabel: 'Remove' })) remove.mutate(c.id, { onError: err }); }}><Trash2 /></Button></li>)}{!items.length ? <li className="p-4 text-sm text-muted-foreground">No contacts yet.</li> : null}</ul>}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add emergency contact' : 'Edit contact'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ec-name">Name *</Label><Input id="ec-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ec-phone">Phone *</Label><Input id="ec-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ec-alt">Alternate phone</Label><Input id="ec-alt" value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ec-cat">Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger id="ec-cat"><SelectValue /></SelectTrigger><SelectContent>{CONTACT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatStatus(c)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="ec-notes">Notes</Label><Input id="ec-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="24x7, weekdays only…" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ec-addr">Address</Label><Input id="ec-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={form.name.trim().length < 2 || form.phone.trim().length < 2} onClick={() => { const payload = { ...form, altPhone: form.altPhone || undefined, address: form.address || undefined, notes: form.notes || undefined }; const done = { onSuccess: () => { toast.success('Saved'); setEditing(null); }, onError: err }; if (editing === 'new') create.mutate(payload, done); else update.mutate({ id: editing.id, ...payload }, done); }}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmElement}
    </div>
  );
}

function BroadcastTab() {
  const broadcast = useBroadcast();
  const preview = useAudiencePreview();
  const settings = useEmergencySettings();
  const [form, setForm] = React.useState({ title: '', message: '', category: 'OTHER', expiresInHours: '' });
  const [audience, setAudience] = React.useState<AudienceValue>(ALL_AUDIENCE);
  const [sent, setSent] = React.useState<any | null>(null);
  const previewMutate = preview.mutate;
  React.useEffect(() => { previewMutate(audience); }, [audience, previewMutate]);
  if (sent) return <div className="max-w-xl space-y-3"><AlertCard alert={sent} canRespond /><Button variant="outline" onClick={() => { setSent(null); setForm({ title: '', message: '', category: 'OTHER', expiresInHours: '' }); }}>Send another</Button></div>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">Emergency broadcasts go out on every channel at once (app, push, email, WhatsApp) and bypass quiet hours. Use notices for anything that can wait.</p>
        <div className="space-y-1.5"><Label htmlFor="bc-title">Headline *</Label><Input id="bc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Gas leak in Tower A — evacuate" /></div>
        <div className="space-y-1.5"><Label htmlFor="bc-msg">Instructions *</Label><Textarea id="bc-msg" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What to do, where to go, whom to call." /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="bc-cat">Type</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger id="bc-cat"><SelectValue /></SelectTrigger><SelectContent>{SOS_CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="bc-hours">Keep active for (hours)</Label><Input id="bc-hours" type="number" min={0.25} max={72} step={0.5} value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: e.target.value })} placeholder={String(settings.data?.broadcastActiveHours ?? 6)} /></div>
        </div>
        <Button variant="destructive" size="lg" loading={broadcast.isPending} disabled={form.title.trim().length < 3 || form.message.trim().length < 3} onClick={() => broadcast.mutate({ title: form.title, message: form.message, category: form.category, audience, expiresInHours: form.expiresInHours ? Number(form.expiresInHours) : undefined }, { onSuccess: (a) => { toast.success(`Broadcast sent to ${a.notifiedCount ?? ''} people`); setSent(a); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Send /> Send emergency broadcast{preview.data ? ` to ${preview.data.count}` : ''}</Button>
      </div>
      <div className="space-y-2"><Label>Who receives it</Label><AudiencePicker value={audience} onChange={setAudience} /></div>
    </div>
  );
}

function SettingsTab() {
  const settings = useEmergencySettings();
  const roles = useRoles();
  const save = useSaveEmergencySettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);
  if (!form) return <CardSkeleton count={1} />;
  const toggle = (field: 'sosNotifyRoleKeys' | 'escalationRoleKeys', key: string) => setForm({ ...form, [field]: form[field].includes(key) ? form[field].filter((k: string) => k !== key) : [...form[field], key] });
  const chips = (field: 'sosNotifyRoleKeys' | 'escalationRoleKeys') => <div className="flex flex-wrap gap-1.5">{(roles.data ?? []).map((r: any) => <button key={r.key} type="button" onClick={() => toggle(field, r.key)} className={`rounded-full border px-3 py-1 text-xs ${form[field].includes(r.key) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>{r.name}</button>)}</div>;
  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-2"><Label>Who is alerted when an SOS is raised</Label>{chips('sosNotifyRoleKeys')}<p className="text-xs text-muted-foreground">Everyone with the “respond to alerts” permission is alerted too.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="em-esc">Escalate if nobody responds within (minutes, 0 = never)</Label><Input id="em-esc" type="number" min={0} max={240} value={form.escalateUnacknowledgedMinutes} onChange={(e) => setForm({ ...form, escalateUnacknowledgedMinutes: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label htmlFor="em-hours">Broadcasts stay active for (hours)</Label><Input id="em-hours" type="number" min={0.25} max={72} step={0.5} value={form.broadcastActiveHours} onChange={(e) => setForm({ ...form, broadcastActiveHours: Number(e.target.value) })} /></div>
      </div>
      <div className="space-y-2"><Label>Escalate to</Label>{chips('escalationRoleKeys')}</div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.memberCanRaiseSos)} onCheckedChange={(v) => setForm({ ...form, memberCanRaiseSos: v })} /> Residents can raise SOS from the app</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.showContactsToMembers)} onCheckedChange={(v) => setForm({ ...form, showContactsToMembers: v })} /> Show emergency contacts to residents</label>
      <Button loading={save.isPending} onClick={() => save.mutate({ sosNotifyRoleKeys: form.sosNotifyRoleKeys, escalateUnacknowledgedMinutes: form.escalateUnacknowledgedMinutes, escalationRoleKeys: form.escalationRoleKeys, broadcastActiveHours: form.broadcastActiveHours, memberCanRaiseSos: form.memberCanRaiseSos, showContactsToMembers: form.showContactsToMembers }, { onSuccess: () => toast.success('Emergency settings saved'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save settings</Button>
    </div>
  );
}

/** Office view: live alerts, history, emergency contacts, broadcasts and rules. */
export default function EmergencyPage() {
  const { can } = usePermissions();
  const stats = useEmergencyStats(can('emergency:manage') || can('emergency:respond'));
  useSecurityRealtime();
  return (
    <div>
      <PageHeader title="Emergency" description="SOS alerts from residents and guards, emergency broadcasts and the numbers to call." />
      <StatGrid className="mb-6">
        <StatCard label="Active SOS" value={stats.data?.activeSos ?? 0} icon={<Siren />} tone={(stats.data?.activeSos ?? 0) > 0 ? 'destructive' : 'default'} loading={stats.isLoading} />
        <StatCard label="SOS in 30 days" value={stats.data?.sos30d ?? 0} hint={`${stats.data?.falseAlarms30d ?? 0} false alarms`} icon={<AlertOctagon />} loading={stats.isLoading} />
        <StatCard label="Avg. response" value={stats.data?.avgAckMinutes != null ? `${stats.data.avgAckMinutes} min` : '—'} icon={<Timer />} loading={stats.isLoading} />
        <StatCard label="Broadcasts (30d)" value={stats.data?.broadcasts30d ?? 0} icon={<Megaphone />} loading={stats.isLoading} />
      </StatGrid>
      <Tabs defaultValue="alerts">
        <TabsList className="mb-4"><TabsTrigger value="alerts">Alerts</TabsTrigger>{can('emergency:manage') ? <TabsTrigger value="contacts">Contacts</TabsTrigger> : null}{can('emergency:broadcast') ? <TabsTrigger value="broadcast">Broadcast</TabsTrigger> : null}{can('emergency:manage') ? <TabsTrigger value="settings">Rules</TabsTrigger> : null}</TabsList>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
        {can('emergency:manage') ? <TabsContent value="contacts"><ContactsTab /></TabsContent> : null}
        {can('emergency:broadcast') ? <TabsContent value="broadcast"><BroadcastTab /></TabsContent> : null}
        {can('emergency:manage') ? <TabsContent value="settings"><SettingsTab /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
