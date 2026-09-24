import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Trash2, Mail, Phone } from 'lucide-react';
import { LeadStatus, LeadTypes } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useAddLeadNote, useDeleteLead, useLead, useLeads, usePlatformUsers, useUpdateLead } from '@/hooks/use-platform';
import { formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { http } from '@/lib/api-client';
import { downloadFile } from '@/lib/utils';

function LeadDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const lead = useLead(id);
  const update = useUpdateLead();
  const addNote = useAddLeadNote();
  const remove = useDeleteLead();
  const users = usePlatformUsers();
  const { confirm, ConfirmElement } = useConfirm();
  const [note, setNote] = React.useState('');
  const l = lead.data;
  if (!l) return null;
  return (
    <div className="space-y-5">
      {ConfirmElement}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={l.status} />
        <span className="text-xs text-muted-foreground">{formatStatus(l.type)} · via {l.source} · {formatRelative(l.createdAt)}</span>
      </div>
      <KeyValue columns={2} items={[{ label: 'Name', value: l.name }, { label: 'Email', value: <a href={`mailto:${l.email}`} className="text-primary">{l.email}</a> }, { label: 'Phone', value: l.phone ? <a href={`tel:${l.phone}`} className="text-primary">{l.phone}</a> : '—' }, { label: 'Society', value: l.societyName || '—' }, { label: 'City', value: l.city || '—' }, { label: 'Plan interest', value: l.planSlug || '—' }, { label: 'Message', value: l.message || '—', span: 2 }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Status</p>
          <Select value={l.status} onValueChange={(v) => update.mutate({ id, status: v }, { onSuccess: () => toast.success('Lead updated') })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.values(LeadStatus).map((s) => <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Assigned to</p>
          <Select value={l.assignedTo?.id ?? l.assignedTo?._id ?? 'none'} onValueChange={(v) => update.mutate({ id, assignedTo: v === 'none' ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {(users.data?.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium">Notes</p>
        <ul className="mb-3 space-y-2">
          {(l.notes ?? []).map((n: any) => (
            <li key={n._id ?? n.createdAt} className="rounded-md bg-muted p-2 text-sm">
              <p>{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.authorName ?? 'Agent'} · {formatDateTime(n.createdAt)}</p>
            </li>
          ))}
          {!(l.notes ?? []).length ? <li className="text-xs text-muted-foreground">No notes yet.</li> : null}
        </ul>
        <div className="flex gap-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
          <Button variant="outline" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate({ id, body: note }, { onSuccess: () => setNote('') })}>Add</Button>
        </div>
      </div>
      <div className="flex justify-between border-t pt-4">
        <Button variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete lead?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(id, { onSuccess: () => { toast.success('Lead deleted'); onClose(); } }); }}><Trash2 /> Delete</Button>
        <div className="flex gap-2">
          <Button asChild variant="outline"><a href={`mailto:${l.email}`}><Mail /> Email</a></Button>
          {l.phone ? <Button asChild variant="outline"><a href={`tel:${l.phone}`}><Phone /> Call</a></Button> : null}
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: '-createdAt' });
  const leads = useLeads(list.params);
  const [exporting, setExporting] = React.useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await http.blob('/platform/leads/export');
      downloadFile(blob, filename ?? 'leads.csv');
    } finally {
      setExporting(false);
    }
  };
  return (
    <div>
      <PageHeader title="Leads" description="Demo requests, plan enquiries and sales conversations from the public site." actions={<Button variant="outline" onClick={exportCsv} loading={exporting}><Download /> Export CSV</Button>} />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, email, society…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(LeadStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.type ?? ''} onChange={(v) => list.setFilter('type', v)} options={LeadTypes.map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="Any type" />
      </FilterBar>
      <DataTable
        rows={leads.data?.items}
        loading={leads.isFetching}
        error={leads.error}
        onRetry={() => leads.refetch()}
        rowKey={(l: any) => l.id}
        onRowClick={(l: any) => navigate(`/admin/leads/${l.id}`)}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No leads yet"
        emptyDescription="Leads arrive from the contact and pricing pages."
        columns={[
          { key: 'name', header: 'Lead', sortable: true, cell: (l: any) => (<div><p className="font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{l.email}{l.phone ? ` · ${l.phone}` : ''}</p></div>) },
          { key: 'type', header: 'Type', sortable: true, cell: (l: any) => formatStatus(l.type) },
          { key: 'society', header: 'Society', hideBelow: 'md', cell: (l: any) => `${l.societyName || '—'}${l.city ? ` · ${l.city}` : ''}` },
          { key: 'assigned', header: 'Assigned', hideBelow: 'lg', cell: (l: any) => l.assignedTo?.name ?? '—' },
          { key: 'status', header: 'Status', sortable: true, cell: (l: any) => <StatusBadge status={l.status} /> },
          { key: 'createdAt', header: 'Received', sortable: true, cell: (l: any) => formatRelative(l.createdAt) },
        ]}
        pagination={leads.data ? { page: leads.data.page, pages: leads.data.pages, total: leads.data.total, limit: leads.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <Sheet open={Boolean(id)} onOpenChange={(o) => !o && navigate('/admin/leads')}>
        <SheetContent>
          <SheetHeader><SheetTitle>Lead</SheetTitle></SheetHeader>
          <div className="mt-6">{id ? <LeadDetail id={id} onClose={() => navigate('/admin/leads')} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
