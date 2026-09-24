import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Shield, AlertTriangle, UserX, Timer, Download, DoorOpen, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { CardSkeleton } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateGate, useExportIncidents, useIncidentStats, useIncidentTypes, useIncidents, useSaveSecuritySettings, useSecurityGates, useSecurityRealtime, useSecuritySettings, useUpdateGate } from '@/hooks/use-security';
import { useRoles } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { IncidentDialog, IncidentSheet, SEVERITIES, SeverityBadge } from './incident-shared';

function GatesTab() {
  const gates = useSecurityGates();
  const create = useCreateGate();
  const update = useUpdateGate();
  const { can } = usePermissions();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [form, setForm] = React.useState({ name: '', code: '', description: '' });
  React.useEffect(() => { if (editing) setForm(editing === 'new' ? { name: '', code: '', description: '' } : { name: editing.name, code: editing.code, description: editing.description ?? '' }); }, [editing]);
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Gates are where guards sign in, log visitors and report incidents.</p>{can('security:configure') ? <Button size="sm" onClick={() => setEditing('new')}><Plus /> Gate</Button> : null}</div>
      {gates.isLoading ? <CardSkeleton count={1} /> : <ul className="divide-y rounded-lg border bg-card">{(gates.data ?? []).map((g: any) => <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><DoorOpen className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="font-medium">{g.name}</span> <Badge variant="outline">{g.code}</Badge>{g.isDefault ? <Badge variant="info" className="ml-1">Default</Badge> : null}{!g.isActive ? <Badge variant="muted" className="ml-1">Inactive</Badge> : null}{g.description ? <span className="block text-xs text-muted-foreground">{g.description}</span> : null}</span>{can('security:configure') ? <span className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs"><Switch checked={g.isActive} onCheckedChange={(v) => update.mutate({ id: g.id, isActive: v }, { onError: err })} /> Active</label>{!g.isDefault ? <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: g.id, isDefault: true }, { onError: err })}>Make default</Button> : null}<Button size="sm" variant="ghost" onClick={() => setEditing(g)}><Pencil /></Button></span> : null}</li>)}</ul>}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add gate' : 'Edit gate'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="g-name">Name *</Label><Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Service gate" /></div>
            <div className="space-y-1.5"><Label htmlFor="g-code">Code *</Label><Input id="g-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SVC" /></div>
            <div className="space-y-1.5"><Label htmlFor="g-desc">Description</Label><Input id="g-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={form.name.trim().length < 2 || !form.code.trim()} onClick={() => { const done = { onSuccess: () => { toast.success('Saved'); setEditing(null); }, onError: err }; if (editing === 'new') create.mutate(form, done); else update.mutate({ id: editing.id, ...form }, done); }}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTab() {
  const settings = useSecuritySettings();
  const roles = useRoles();
  const save = useSaveSecuritySettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);
  if (!form) return <CardSkeleton count={1} />;
  const toggleRole = (key: string) => setForm({ ...form, notifyRoleKeysOnCritical: form.notifyRoleKeysOnCritical.includes(key) ? form.notifyRoleKeysOnCritical.filter((k: string) => k !== key) : [...form.notifyRoleKeysOnCritical, key] });
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2"><Label>Also alert these roles for high / critical incidents</Label><div className="flex flex-wrap gap-1.5">{(roles.data ?? []).map((r: any) => <button key={r.key} type="button" onClick={() => toggleRole(r.key)} className={`rounded-full border px-3 py-1 text-xs ${form.notifyRoleKeysOnCritical.includes(r.key) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>{r.name}</button>)}</div></div>
      <p className="text-xs text-muted-foreground">Who can see incidents is decided by roles: anyone with “view incidents” sees the whole register, others only their own reports.</p>
      <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.notifyUnitOnIncident)} onCheckedChange={(v) => setForm({ ...form, notifyUnitOnIncident: v })} /> Tell residents when an incident mentions their unit</label>
      <div className="space-y-1.5 sm:max-w-xs"><Label htmlFor="s-close">Auto-close resolved incidents after (days, 0 = never)</Label><Input id="s-close" type="number" min={0} max={365} value={form.autoCloseResolvedAfterDays} onChange={(e) => setForm({ ...form, autoCloseResolvedAfterDays: Number(e.target.value) })} /></div>
      <Button loading={save.isPending} onClick={() => save.mutate({ notifyRoleKeysOnCritical: form.notifyRoleKeysOnCritical, notifyUnitOnIncident: form.notifyUnitOnIncident, autoCloseResolvedAfterDays: form.autoCloseResolvedAfterDays }, { onSuccess: () => toast.success('Security settings saved'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save settings</Button>
    </div>
  );
}

/** Security desk: incident register, gates and rules. */
export default function SecurityPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const stats = useIncidentStats();
  const types = useIncidentTypes();
  const list = useListState({ limit: 25, sort: '-occurredAt' });
  const incidents = useIncidents(list.params);
  const exportRows = useExportIncidents();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useSecurityRealtime();
  const selected = params.get('incident');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Security" description="Incidents reported from the gate and the office, with an audit-ready timeline for each." actions={<PermissionGate permission="security:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Log incident</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Open incidents" value={stats.data?.open ?? 0} hint={`${stats.data?.byStatus?.INVESTIGATING ?? 0} investigating`} icon={<Shield />} tone={(stats.data?.open ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="High / critical" value={stats.data?.critical ?? 0} icon={<AlertTriangle />} tone={(stats.data?.critical ?? 0) > 0 ? 'destructive' : 'default'} loading={stats.isLoading} />
        <StatCard label="Unassigned" value={stats.data?.unassigned ?? 0} icon={<UserX />} tone={(stats.data?.unassigned ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Avg. resolution" value={stats.data?.avgResolutionHours != null ? `${stats.data.avgResolutionHours} h` : '—'} hint={`${stats.data?.resolved30d ?? 0} resolved in 30 days · ${stats.data?.thisMonth ?? 0} this month`} icon={<Timer />} loading={stats.isLoading} />
      </StatGrid>
      <Tabs defaultValue="incidents">
        <TabsList className="mb-4"><TabsTrigger value="incidents">Incidents</TabsTrigger><TabsTrigger value="gates">Gates</TabsTrigger>{can('security:configure') ? <TabsTrigger value="settings">Rules</TabsTrigger> : null}</TabsList>
        <TabsContent value="incidents">
          <FilterBar onReset={list.reset}>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Number, title, location…" className="w-full sm:w-64" />
            <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
            <FilterSelect value={list.filters.severity ?? ''} onChange={(v) => list.setFilter('severity', v)} options={SEVERITIES.map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any severity" />
            <FilterSelect value={list.filters.typeKey ?? ''} onChange={(v) => list.setFilter('typeKey', v)} options={(types.data ?? []).map((t: any) => ({ value: t.key, label: t.name }))} allLabel="All types" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.openOnly === 'true'} onCheckedChange={(v) => list.setFilter('openOnly', v ? 'true' : '')} /> Open only</label>
            <span className="flex-1" />
            <PermissionGate permission="security:export"><Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
          </FilterBar>
          <DataTable
            rows={incidents.data?.items}
            loading={incidents.isFetching}
            error={incidents.error}
            onRetry={() => incidents.refetch()}
            rowKey={(i: any) => i.id}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={(i: any) => setParam('incident', i.id)}
            emptyTitle="No incidents"
            emptyDescription="Guards report from the gate app; the office can log incidents here."
            columns={[
              { key: 'incidentNumber', header: 'Incident', sortable: true, cell: (i: any) => <span><span className="font-medium">{i.title}</span><span className="block text-xs text-muted-foreground">{i.incidentNumber} · {formatStatus(i.typeKey)}{i.photoCount ? ` · ${i.photoCount} photo${i.photoCount > 1 ? 's' : ''}` : ''}</span></span> },
              { key: 'severity', header: 'Severity', sortable: true, cell: (i: any) => <SeverityBadge severity={i.severity} /> },
              { key: 'occurredAt', header: 'When', sortable: true, hideBelow: 'md', cell: (i: any) => <span>{formatDateTime(i.occurredAt)}<span className="block text-xs text-muted-foreground">{[i.location, i.gateId?.name, i.unitId?.code].filter(Boolean).join(' · ')}</span></span> },
              { key: 'reportedBy', header: 'Reported by', hideBelow: 'lg', cell: (i: any) => <span>{i.reportedBy?.name ?? '—'}<span className="block text-xs text-muted-foreground">{i.assignedTo?.name ? `→ ${i.assignedTo.name}` : 'Unassigned'}</span></span> },
              { key: 'status', header: 'Status', sortable: true, cell: (i: any) => <StatusBadge status={i.status} /> },
            ]}
            pagination={incidents.data ? { page: incidents.data.page, pages: incidents.data.pages, total: incidents.data.total, limit: incidents.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
          />
        </TabsContent>
        <TabsContent value="gates"><GatesTab /></TabsContent>
        {can('security:configure') ? <TabsContent value="settings"><SettingsTab /></TabsContent> : null}
      </Tabs>
      <IncidentDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} incident={editing === 'new' ? null : editing} />
      <IncidentSheet id={selected} onClose={() => setParam('incident', null)} onEdit={(i) => setEditing(i)} />
    </div>
  );
}
