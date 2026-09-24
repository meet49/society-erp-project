import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Download, SlidersHorizontal, AlertTriangle, Clock, UserX, Star } from 'lucide-react';
import { ComplaintStatus, Priorities } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { HorizontalBars } from '@/components/common/charts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useComplaintStats, useComplaints, useCreateComplaint, useExportComplaints } from '@/hooks/use-complaints';
import { useCategories } from '@/hooks/use-society';
import { useUnitOptions } from '@/hooks/use-units';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatDate, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export const PRIORITY_TONE: Record<string, string> = { LOW: 'text-muted-foreground', NORMAL: '', HIGH: 'text-warning-foreground dark:text-warning', CRITICAL: 'text-destructive font-semibold' };

/** SLA chip: overdue / due in x / met. */
export function SlaChip({ complaint }: { complaint: any }) {
  const open = ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(complaint.status);
  const due = complaint.sla?.resolutionDueAt;
  if (!due) return null;
  if (!open) return complaint.sla?.resolutionBreached ? <Badge variant="destructive">SLA missed</Badge> : <Badge variant="success">SLA met</Badge>;
  const overdue = new Date(due).getTime() < Date.now();
  return <Badge variant={overdue ? 'destructive' : 'muted'}>{overdue ? `Overdue ${formatRelative(due)}` : `Due ${formatRelative(due)}`}</Badge>;
}

/** Raise a complaint: residents pick nothing (own unit); staff may raise on behalf of a unit. */
export function RaiseComplaintDialog({ open, onOpenChange, member = false }: { open: boolean; onOpenChange: (o: boolean) => void; member?: boolean }) {
  const navigate = useNavigate();
  const categories = useCategories('COMPLAINT_CATEGORY');
  const units = useUnitOptions(open && !member);
  const create = useCreateComplaint();
  const { context } = useAuth();
  const { can } = usePermissions();
  const [form, setForm] = React.useState({ title: '', description: '', categoryKey: '', location: '', priority: 'NORMAL', unitId: '', isPublic: false });
  const canPickUnit = !member && can('complaints:create');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Raise a complaint</DialogTitle><DialogDescription>{member ? 'Tell the society office what needs attention. You will be notified at every step.' : 'Log a ticket for a unit or the common areas.'}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cp-title">What is the issue? *</Label><Input id="cp-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Water leakage in bathroom ceiling" /></div>
          <div className="space-y-1.5"><Label>Category *</Label><Combobox value={form.categoryKey} onChange={(v) => setForm({ ...form, categoryKey: v ?? '' })} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} placeholder="Choose category" /></div>
          {canPickUnit ? <div className="space-y-1.5"><Label>Unit (optional)</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} placeholder={context?.resident?.unitIds?.length ? 'Your unit' : 'Common area'} /></div> : <div className="space-y-1.5"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Priorities.map((p) => <SelectItem key={p} value={p}>{formatStatus(p)}</SelectItem>)}</SelectContent></Select></div>}
          {canPickUnit ? <div className="space-y-1.5"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Priorities.map((p) => <SelectItem key={p} value={p}>{formatStatus(p)}</SelectItem>)}</SelectContent></Select></div> : null}
          <div className="space-y-1.5"><Label htmlFor="cp-location">Location</Label><Input id="cp-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Tower A lobby, 3rd floor corridor…" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cp-desc">Details</Label><Textarea id="cp-desc" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="When did it start, how often, anything already tried…" /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} /> Visible to all residents (common-area issue others may want to follow)</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={form.title.trim().length < 3 || !form.categoryKey} onClick={() => create.mutate({ title: form.title, description: form.description || undefined, categoryKey: form.categoryKey, location: form.location || undefined, priority: form.priority, unitId: form.unitId || undefined, isPublic: form.isPublic }, { onSuccess: (c) => { toast.success(`${c.ticketNumber} raised`); onOpenChange(false); setForm({ title: '', description: '', categoryKey: '', location: '', priority: 'NORMAL', unitId: '', isPublic: false }); navigate(member ? `/app/my/complaints/${c.id}` : `/app/complaints/${c.id}`); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Raise complaint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ComplaintsPage() {
  const navigate = useNavigate();
  const list = useListState({ sort: '-createdAt' });
  const complaints = useComplaints(list.params);
  const stats = useComplaintStats();
  const categories = useCategories('COMPLAINT_CATEGORY');
  const exportRows = useExportComplaints();
  const [raising, setRaising] = React.useState(false);
  return (
    <div>
      <PageHeader
        title="Complaints"
        description="Helpdesk tickets with SLA tracking, assignment and escalation."
        actions={
          <SubscriptionGate>
            <PermissionGate permission="complaints:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
            <PermissionGate permission="complaints:configure"><Button asChild variant="outline"><Link to="/app/complaints/settings"><SlidersHorizontal /> SLA & escalation</Link></Button></PermissionGate>
            <PermissionGate permission="complaints:create"><Button onClick={() => setRaising(true)}><Plus /> New complaint</Button></PermissionGate>
          </SubscriptionGate>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Open" value={stats.data?.open ?? 0} hint={`${stats.data?.byStatus?.IN_PROGRESS ?? 0} in progress`} icon={<Clock />} tone="primary" loading={stats.isLoading} />
        <StatCard label="SLA breached" value={stats.data?.breached ?? 0} icon={<AlertTriangle />} tone={(stats.data?.breached ?? 0) > 0 ? 'destructive' : 'default'} loading={stats.isLoading} />
        <StatCard label="Unassigned" value={stats.data?.unassigned ?? 0} icon={<UserX />} tone={(stats.data?.unassigned ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Resident rating" value={stats.data?.rating ? `${stats.data.rating.avg} / 5` : '—'} hint={stats.data?.avgResolutionHours != null ? `Avg. resolution ${stats.data.avgResolutionHours} h · SLA met ${stats.data.slaCompliance ?? '—'}%` : undefined} icon={<Star />} loading={stats.isLoading} />
      </StatGrid>
      {stats.data?.byCategory?.length ? <Card className="mb-6"><CardHeader><CardTitle className="text-sm">Open tickets by category</CardTitle></CardHeader><CardContent><HorizontalBars data={stats.data.byCategory.map((c: any) => ({ label: formatStatus(c.category), value: c.count }))} labelKey="label" valueKey="value" /></CardContent></Card> : null}
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Ticket, title, location…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(ComplaintStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.priority ?? ''} onChange={(v) => list.setFilter('priority', v)} options={Priorities.map((p) => ({ value: p, label: formatStatus(p) }))} allLabel="Any priority" />
        <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
        <FilterSelect value={list.filters.assignedTo ?? ''} onChange={(v) => list.setFilter('assignedTo', v)} options={[{ value: 'me', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }]} allLabel="Anyone" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.breachedOnly === 'true'} onCheckedChange={(v) => list.setFilter('breachedOnly', v ? 'true' : '')} /> Breached only</label>
      </FilterBar>
      <DataTable
        rows={complaints.data?.items}
        loading={complaints.isFetching}
        error={complaints.error}
        onRetry={() => complaints.refetch()}
        rowKey={(c: any) => c.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(c: any) => navigate(`/app/complaints/${c.id}`)}
        emptyTitle="No complaints"
        emptyDescription="Residents raise tickets from the app; staff can log them here on their behalf."
        columns={[
          { key: 'ticketNumber', header: 'Ticket', cell: (c: any) => <span><span className="font-medium">{c.ticketNumber}</span><span className="block max-w-[320px] truncate text-xs text-muted-foreground">{c.title}</span></span> },
          { key: 'category', header: 'Category', hideBelow: 'md', cell: (c: any) => <Badge variant="outline">{formatStatus(c.categoryKey)}</Badge> },
          { key: 'unit', header: 'Unit', hideBelow: 'md', cell: (c: any) => c.unitId?.code ?? <span className="text-muted-foreground">Common</span> },
          { key: 'priority', header: 'Priority', sortable: true, cell: (c: any) => <span className={cn('text-sm', PRIORITY_TONE[c.priority])}>{formatStatus(c.priority)}</span> },
          { key: 'assigned', header: 'Assigned', hideBelow: 'lg', cell: (c: any) => c.assignedTo?.name ?? <span className="text-muted-foreground">—</span> },
          { key: 'sla', header: 'SLA', hideBelow: 'sm', cell: (c: any) => <SlaChip complaint={c} /> },
          { key: 'createdAt', header: 'Raised', sortable: true, hideBelow: 'lg', cell: (c: any) => `${formatDate(c.createdAt)} · ${c.raisedBy?.name ?? ''}` },
          { key: 'status', header: 'Status', sortable: true, cell: (c: any) => <span className="flex items-center gap-1"><StatusBadge status={c.status} />{c.escalationLevel ? <Badge variant="destructive">L{c.escalationLevel}</Badge> : null}</span> },
        ]}
        pagination={complaints.data ? { page: complaints.data.page, pages: complaints.data.pages, total: complaints.data.total, limit: complaints.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <RaiseComplaintDialog open={raising} onOpenChange={setRaising} />
    </div>
  );
}
