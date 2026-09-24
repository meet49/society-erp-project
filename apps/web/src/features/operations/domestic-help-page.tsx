import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Sparkles, ShieldAlert, LogIn, ListChecks, CheckCheck, Ban, Unlock } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { KeyValue } from '@/components/common/key-value';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBlockHelp, useDomesticHelp, useDomesticHelpList, useHelpSettings, useHelpStats, useHelpTypes, useOperationsRealtime, useSaveHelpSettings, useVerifyHelp } from '@/hooks/use-operations';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { HelpDialog, HelpPassCard, VerificationBadge, helpSubtitle } from './help-shared';

function HelpSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const help = useDomesticHelp(id ?? '');
  const verify = useVerifyHelp();
  const block = useBlockHelp();
  const { can } = usePermissions();
  const { confirm, ConfirmElement } = useConfirm();
  const [blocking, setBlocking] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const h = help.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {h ? <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2">{h.name} <StatusBadge status={h.status} /> <VerificationBadge status={h.verification?.status} /></SheetTitle><SheetDescription>{helpSubtitle(h)} · {h.phone}</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-4">
            {h.photoUrl ? <img src={h.photoUrl} alt={h.name} className="h-32 w-32 rounded-md object-cover" /> : null}
            <KeyValue columns={2} items={[
              { label: 'Working for', value: (h.units ?? []).filter((u: any) => u.active).map((u: any) => `${u.unitId?.code ?? ''}${u.schedule ? ` (${u.schedule})` : ''}`).join(', ') || '—', span: 2 },
              { label: 'ID proof', value: h.idProof?.type ? `${h.idProof.type}${h.idProof.number ? ` · ${h.idProof.number}` : ''}` : '—' },
              { label: 'Inside now', value: h.isInside ? `Yes, since ${formatDateTime(h.insideSince)}` : 'No' },
              { label: 'Last entry', value: h.lastEntryAt ? formatDateTime(h.lastEntryAt) : '—' },
              { label: 'Verification', value: h.verification?.verifiedAt ? `${formatStatus(h.verification.status)} · ${formatDateTime(h.verification.verifiedAt)}${h.verification.verifiedBy?.name ? ` by ${h.verification.verifiedBy.name}` : ''}${h.verification.note ? ` · ${h.verification.note}` : ''}` : 'Pending' },
              ...(h.blockedReason ? [{ label: 'Blocked', value: h.blockedReason, span: 2 }] : []),
            ]} />
            <HelpPassCard help={h} />
            <div className="flex flex-wrap gap-2">
              {h.verification?.status !== 'VERIFIED' && can('domestic_help:verify') ? <Button size="sm" onClick={() => verify.mutate({ id: h.id, status: 'VERIFIED', note: 'ID checked at the office' }, { onSuccess: () => toast.success('Verified'), onError: err })}><CheckCheck /> Verify</Button> : null}
              {h.verification?.status === 'PENDING' && can('domestic_help:verify') ? <Button size="sm" variant="outline" onClick={async () => { if (await confirm({ title: 'Reject verification?', destructive: true, confirmLabel: 'Reject' })) verify.mutate({ id: h.id, status: 'REJECTED', note: 'Documents not acceptable' }, { onError: err }); }}>Reject</Button> : null}
              {(can('domestic_help:update') || can('domestic_help:verify')) ? (h.status === 'BLOCKED' ? <Button size="sm" variant="outline" onClick={() => block.mutate({ id: h.id, block: false }, { onSuccess: () => toast.success('Unblocked'), onError: err })}><Unlock /> Unblock</Button> : <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setReason(''); setBlocking(true); }}><Ban /> Block at gate</Button>) : null}
            </div>
            <div><h3 className="mb-2 text-sm font-semibold">Recent gate activity</h3><ul className="divide-y text-sm">{(h.recentLogs ?? []).map((l: any) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.type === 'IN' ? 'Entered' : 'Left'}{l.unitCode ? ` · ${l.unitCode}` : ''}</span><span className="text-muted-foreground">{formatDateTime(l.at)}</span></li>)}{!h.recentLogs?.length ? <li className="py-2 text-muted-foreground">No entries yet.</li> : null}</ul></div>
          </div>
          <Dialog open={blocking} onOpenChange={setBlocking}>
            <DialogContent size="sm">
              <DialogHeader><DialogTitle>Block {h.name} at the gate</DialogTitle></DialogHeader>
              <div className="space-y-1.5"><Label htmlFor="bl-reason">Reason *</Label><Input id="bl-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              <DialogFooter><Button variant="outline" onClick={() => setBlocking(false)}>Cancel</Button><Button variant="destructive" loading={block.isPending} disabled={reason.trim().length < 2} onClick={() => block.mutate({ id: h.id, block: true, reason }, { onSuccess: () => { toast.success('Blocked'); setBlocking(false); }, onError: err })}>Block</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </> : null}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}

/** Office view: verification queue, gate activity, blocks. */
export default function DomesticHelpPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const stats = useHelpStats();
  const types = useHelpTypes();
  const settings = useHelpSettings(can('domestic_help:verify') || can('domestic_help:update'));
  const save = useSaveHelpSettings();
  const list = useListState({ limit: 25, sort: 'name' });
  const help = useDomesticHelpList(list.params);
  const units = useUnitOptions(can('domestic_help:create'));
  const [adding, setAdding] = React.useState(false);
  useOperationsRealtime();
  const selected = params.get('help');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Domestic help" description="Maids, cooks and drivers registered by residents, verified by the office and recognised at the gate." actions={<PermissionGate permission="domestic_help:create"><SubscriptionGate><Button onClick={() => setAdding(true)}><Plus /> Register</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Active helpers" value={stats.data?.active ?? 0} hint={(stats.data?.byType ?? []).slice(0, 3).map((t: any) => `${t.count} ${formatStatus(t.type).toLowerCase()}`).join(' · ')} icon={<Sparkles />} loading={stats.isLoading} />
        <StatCard label="Verification pending" value={stats.data?.pendingVerification ?? 0} icon={<ShieldAlert />} tone={(stats.data?.pendingVerification ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Inside now" value={stats.data?.insideNow ?? 0} icon={<LogIn />} loading={stats.isLoading} />
        <StatCard label="Entries today" value={stats.data?.entriesToday ?? 0} icon={<ListChecks />} loading={stats.isLoading} />
      </StatGrid>
      {settings.data ? <div className="mb-4 flex flex-wrap gap-4 rounded-md border bg-card p-3 text-sm"><label className="flex items-center gap-2"><Switch checked={Boolean(settings.data.notifyOnEntry)} onCheckedChange={(v) => save.mutate({ notifyOnEntry: v }, { onError: (e) => toast.error(getErrorMessage(e)) })} /> Notify residents on entry</label><label className="flex items-center gap-2"><Switch checked={Boolean(settings.data.requireVerificationForEntry)} onCheckedChange={(v) => save.mutate({ requireVerificationForEntry: v }, { onError: (e) => toast.error(getErrorMessage(e)) })} /> Only verified helpers may enter</label></div> : null}
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, phone, passcode…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.typeKey ?? ''} onChange={(v) => list.setFilter('typeKey', v)} options={(types.data ?? []).map((t: any) => ({ value: t.key, label: t.name }))} allLabel="All types" />
        <FilterSelect value={list.filters.verification ?? ''} onChange={(v) => list.setFilter('verification', v)} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'VERIFIED', label: 'Verified' }, { value: 'REJECTED', label: 'Rejected' }]} allLabel="Any verification" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'BLOCKED', 'INACTIVE'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.insideOnly === 'true'} onCheckedChange={(v) => list.setFilter('insideOnly', v ? 'true' : '')} /> Inside now</label>
      </FilterBar>
      <DataTable
        rows={help.data?.items}
        loading={help.isFetching}
        error={help.error}
        onRetry={() => help.refetch()}
        rowKey={(h: any) => h.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(h: any) => setParam('help', h.id)}
        emptyTitle="No domestic help registered"
        emptyDescription="Residents register their help from My Domestic Help; the office verifies IDs here."
        columns={[
          { key: 'name', header: 'Name', sortable: true, cell: (h: any) => <span className="flex items-center gap-2">{h.photoUrl ? <img src={h.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : null}<span><span className="font-medium">{h.name}</span><span className="block text-xs text-muted-foreground">{helpSubtitle(h)}</span></span></span> },
          { key: 'phone', header: 'Phone', hideBelow: 'md', cell: (h: any) => h.phone ?? '—' },
          { key: 'verification', header: 'Verification', cell: (h: any) => <VerificationBadge status={h.verification?.status} /> },
          { key: 'lastEntryAt', header: 'Last entry', sortable: true, hideBelow: 'lg', cell: (h: any) => h.isInside ? <Badge variant="success">Inside</Badge> : h.lastEntryAt ? formatRelative(h.lastEntryAt) : '—' },
          { key: 'status', header: 'Status', sortable: true, cell: (h: any) => <StatusBadge status={h.status} /> },
        ]}
        pagination={help.data ? { page: help.data.page, pages: help.data.pages, total: help.data.total, limit: help.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <HelpDialog open={adding} onOpenChange={setAdding} unitOptions={units.data ?? []} />
      <HelpSheet id={selected} onClose={() => setParam('help', null)} />
    </div>
  );
}
