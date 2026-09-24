import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Megaphone, CalendarClock, FileText, Pin, Archive, Send, Eye, Pencil, Trash2, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ALL_AUDIENCE, useArchiveNotice, useCommunityRealtime, useCreateNotice, useDeleteNotice, useNoticeCategories, useNoticeReaders, useNoticeStats, useNotices, usePublishNotice, useUpdateNotice, type AudienceValue } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { formatDateTime, formatStatus, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from './audience-picker';

const CHANNELS = [{ key: 'IN_APP', label: 'In-app' }, { key: 'PUSH', label: 'Push' }, { key: 'EMAIL', label: 'Email' }, { key: 'WHATSAPP', label: 'WhatsApp' }];
const blank = { title: '', body: '', categoryKey: 'GENERAL', priority: 'NORMAL', audience: ALL_AUDIENCE as AudienceValue, isPinned: false, requiresAcknowledgement: false, channels: ['IN_APP', 'PUSH'], expiresAt: '', publishAt: '' };

/** Create / edit dialog: content, audience, channels, scheduling. */
export function NoticeDialog({ open, onOpenChange, notice }: { open: boolean; onOpenChange: (o: boolean) => void; notice?: any | null }) {
  const categories = useNoticeCategories();
  const create = useCreateNotice();
  const update = useUpdateNotice();
  const { can } = usePermissions();
  const [form, setForm] = React.useState<typeof blank>(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(notice ? { title: notice.title, body: notice.body ?? '', categoryKey: notice.categoryKey ?? 'GENERAL', priority: notice.priority ?? 'NORMAL', audience: { ...ALL_AUDIENCE, ...(notice.audience ?? {}) }, isPinned: Boolean(notice.isPinned), requiresAcknowledgement: Boolean(notice.requiresAcknowledgement), channels: notice.channels ?? ['IN_APP', 'PUSH'], expiresAt: notice.expiresAt ? toInputDateTime(notice.expiresAt) : '', publishAt: notice.publishAt ? toInputDateTime(notice.publishAt) : '' } : blank);
  }, [open, notice]);
  const payload = (publishNow: boolean) => ({ title: form.title, body: form.body, categoryKey: form.categoryKey, priority: form.priority, audience: form.audience, isPinned: form.isPinned, requiresAcknowledgement: form.requiresAcknowledgement, channels: form.channels, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null, publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null, publishNow });
  const done = (msg: string) => ({ onSuccess: () => { toast.success(msg); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) });
  const save = (publishNow: boolean) => {
    if (notice) update.mutate({ id: notice.id, ...payload(false) }, done('Notice saved'));
    else create.mutate(payload(publishNow), done(publishNow ? 'Notice published' : form.publishAt ? 'Notice scheduled' : 'Draft saved'));
  };
  const pending = create.isPending || update.isPending;
  const valid = form.title.trim().length >= 3 && form.body.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{notice ? `Edit ${notice.noticeNumber}` : 'New notice'}</DialogTitle><DialogDescription>Residents in the audience are notified on the channels you pick when the notice is published.</DialogDescription></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="space-y-1.5"><Label htmlFor="nt-title">Title *</Label><Input id="nt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="nt-body">Notice *</Label><Textarea id="nt-body" rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the notice. Line breaks are kept." /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="nt-cat">Category</Label><Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}><SelectTrigger id="nt-cat"><SelectValue /></SelectTrigger><SelectContent>{(categories.data ?? []).map((c: any) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}{!categories.data?.length ? <SelectItem value="GENERAL">General</SelectItem> : null}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="nt-priority">Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger id="nt-priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NORMAL">Normal</SelectItem><SelectItem value="IMPORTANT">Important</SelectItem><SelectItem value="URGENT">Urgent</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <AudiencePicker value={form.audience} onChange={(audience) => setForm({ ...form, audience })} />
            <div className="space-y-1.5"><Label>Notify on</Label><div className="flex flex-wrap gap-3">{CHANNELS.map((c) => <label key={c.key} className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.channels.includes(c.key)} onCheckedChange={(v) => setForm({ ...form, channels: v ? [...form.channels, c.key] : form.channels.filter((x) => x !== c.key) })} /> {c.label}</label>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="nt-expires">Hide after</Label><Input id="nt-expires" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
              {!notice || notice.status !== 'PUBLISHED' ? <div className="space-y-1.5"><Label htmlFor="nt-publishAt">Schedule for</Label><Input id="nt-publishAt" type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} /></div> : null}
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.isPinned} onCheckedChange={(v) => setForm({ ...form, isPinned: v })} /> Pin to the top</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.requiresAcknowledgement} onCheckedChange={(v) => setForm({ ...form, requiresAcknowledgement: v })} /> Ask residents to acknowledge</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={notice ? 'default' : 'outline'} loading={pending} disabled={!valid} onClick={() => save(false)}>{notice ? 'Save changes' : form.publishAt ? 'Schedule' : 'Save draft'}</Button>
          {!notice && can('notices:publish') ? <Button loading={pending} disabled={!valid} onClick={() => save(true)}><Send /> Publish now</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadersSheet({ notice, onClose }: { notice: any | null; onClose: () => void }) {
  const readers = useNoticeReaders(notice?.id ?? '', Boolean(notice));
  const d = readers.data;
  return (
    <Sheet open={Boolean(notice)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {notice ? <>
          <SheetHeader><SheetTitle>{notice.title}</SheetTitle><SheetDescription>{notice.noticeNumber} · {notice.audienceLabel}</SheetDescription></SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md border p-2"><p className="text-lg font-semibold">{d?.recipientCount ?? notice.recipientCount}</p><p className="text-xs text-muted-foreground">Recipients</p></div>
            <div className="rounded-md border p-2"><p className="text-lg font-semibold">{d?.readCount ?? notice.readCount}</p><p className="text-xs text-muted-foreground">Read</p></div>
            <div className="rounded-md border p-2"><p className="text-lg font-semibold">{d?.requiresAcknowledgement ? d.ackCount : '—'}</p><p className="text-xs text-muted-foreground">Acknowledged</p></div>
          </div>
          <ul className="mt-4 divide-y text-sm">{(d?.readers ?? []).map((r: any) => <li key={r.id} className="flex items-center justify-between py-2"><span>{r.user?.name ?? '—'}<span className="block text-xs text-muted-foreground">read {formatDateTime(r.readAt)}</span></span>{r.acknowledgedAt ? <Badge variant="success"><CheckCheck className="mr-1 h-3 w-3" />Acknowledged</Badge> : null}</li>)}{d && !d.readers.length ? <li className="py-3 text-muted-foreground">No one has opened it yet.</li> : null}</ul>
        </> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Committee view: draft, schedule, publish, pin and archive notices; see who read them. */
export default function NoticesPage() {
  const { can } = usePermissions();
  const stats = useNoticeStats();
  const categories = useNoticeCategories();
  const list = useListState({ limit: 20 });
  const notices = useNotices(list.params);
  const publish = usePublishNotice();
  const archive = useArchiveNotice();
  const remove = useDeleteNotice();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [readers, setReaders] = React.useState<any | null>(null);
  useCommunityRealtime();
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const doPublish = async (n: any) => { if (await confirm({ title: `Publish “${n.title}”?`, description: `${n.audienceLabel} will be notified on ${(n.channels ?? []).map((c: string) => formatStatus(c)).join(', ')}.`, confirmLabel: 'Publish' })) publish.mutate({ id: n.id }, { onSuccess: () => toast.success('Published'), onError: err }); };
  const doArchive = async (n: any) => { if (await confirm({ title: `Archive “${n.title}”?`, description: 'Residents will no longer see it.', confirmLabel: 'Archive' })) archive.mutate(n.id, { onSuccess: () => toast.success('Archived'), onError: err }); };
  const doDelete = async (n: any) => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(n.id, { onSuccess: () => toast.success('Deleted'), onError: err }); };
  return (
    <div>
      <PageHeader title="Notices" description="Circulars and announcements targeted at buildings, units, roles or everyone." actions={<PermissionGate permission="notices:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> New notice</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Live notices" value={stats.data?.published ?? 0} hint={`${stats.data?.pinned ?? 0} pinned`} icon={<Megaphone />} loading={stats.isLoading} />
        <StatCard label="Scheduled" value={stats.data?.scheduled ?? 0} icon={<CalendarClock />} loading={stats.isLoading} />
        <StatCard label="Drafts" value={stats.data?.drafts ?? 0} icon={<FileText />} loading={stats.isLoading} />
        <StatCard label="Read rate" value={stats.data?.readRate != null ? `${stats.data.readRate}%` : '—'} hint={stats.data?.pendingAcks ? `${stats.data.pendingAcks} acknowledgements pending` : 'Across the last 10 notices'} icon={<Eye />} loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Title, number…" className="w-full sm:w-64" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
      </FilterBar>
      <DataTable
        rows={notices.data?.items}
        loading={notices.isFetching}
        error={notices.error}
        onRetry={() => notices.refetch()}
        rowKey={(n: any) => n.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(n: any) => setReaders(n)}
        emptyTitle="No notices yet"
        emptyDescription="Draft a notice, pick who should get it and publish or schedule it."
        columns={[
          { key: 'title', header: 'Notice', cell: (n: any) => <span><span className="flex items-center gap-1 font-medium">{n.isPinned ? <Pin className="h-3 w-3 text-primary" /> : null}{n.title}</span><span className="block text-xs text-muted-foreground">{n.noticeNumber} · {formatStatus(n.categoryKey)} · {n.audienceLabel}</span></span> },
          { key: 'priority', header: 'Priority', hideBelow: 'md', cell: (n: any) => <Badge variant={n.priority === 'URGENT' ? 'destructive' : n.priority === 'IMPORTANT' ? 'warning' : 'outline'}>{formatStatus(n.priority)}</Badge> },
          { key: 'publishedAt', header: 'When', sortable: true, hideBelow: 'sm', cell: (n: any) => n.status === 'SCHEDULED' ? `Scheduled ${formatDateTime(n.publishAt)}` : n.publishedAt ? formatDateTime(n.publishedAt) : `Draft · ${n.createdBy?.name ?? ''}` },
          { key: 'reach', header: 'Reach', hideBelow: 'md', cell: (n: any) => n.status === 'PUBLISHED' || n.status === 'ARCHIVED' ? `${n.readCount}/${n.recipientCount} read${n.requiresAcknowledgement ? ` · ${n.ackCount} ack` : ''}` : '—' },
          { key: 'status', header: 'Status', sortable: true, cell: (n: any) => <StatusBadge status={n.status} /> },
          { key: 'actions', header: '', cell: (n: any) => <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {['DRAFT', 'SCHEDULED'].includes(n.status) && can('notices:publish') ? <Button size="sm" variant="ghost" onClick={() => doPublish(n)}><Send /> Publish</Button> : null}
            {n.status !== 'ARCHIVED' && can('notices:update') ? <Button size="sm" variant="ghost" onClick={() => setEditing(n)}><Pencil /></Button> : null}
            {n.status === 'PUBLISHED' && can('notices:publish') ? <Button size="sm" variant="ghost" onClick={() => doArchive(n)}><Archive /></Button> : null}
            {['DRAFT', 'SCHEDULED'].includes(n.status) && can('notices:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => doDelete(n)}><Trash2 /></Button> : null}
          </span> },
        ]}
        pagination={notices.data ? { page: notices.data.page, pages: notices.data.pages, total: notices.data.total, limit: notices.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <NoticeDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} notice={editing === 'new' ? null : editing} />
      <ReadersSheet notice={readers} onClose={() => setReaders(null)} />
      {ConfirmElement}
    </div>
  );
}
